// SPDX-License-Identifier: GPL-2.0-or-later
//! Decision timing and target observations. The resulting commands use ordinary player physics.
use crate::game::{weapon, Actor, Item};
use glam::Vec3;

pub(crate) struct Skill {
    pub reaction_ms: u32,
    pub sample_ms: u32,
    pub turn: f32,
    pub pitch_step: f32,
    pub sway: f32,
    pub pitch_sway: f32,
    pub burst: f32,
    pub cycle: f32,
    pub plan_ms: u32,
}

impl Skill {
    pub fn for_level(level: u8) -> Self {
        let standard = Self {
            reaction_ms: 360,
            sample_ms: 0,
            turn: 0.030,
            pitch_step: 0.021,
            sway: 0.056,
            pitch_sway: 0.027,
            burst: 1.75,
            cycle: 2.3,
            plan_ms: 680,
        };
        match level {
            1 => Self {
                reaction_ms: 1050,
                sample_ms: 320,
                turn: 0.012,
                pitch_step: 0.009,
                sway: 0.16,
                pitch_sway: 0.075,
                burst: 0.65,
                cycle: 3.4,
                plan_ms: 900,
            },
            2 => Self {
                reaction_ms: 680,
                sample_ms: 160,
                turn: 0.020,
                pitch_step: 0.014,
                sway: 0.095,
                pitch_sway: 0.047,
                burst: 1.05,
                cycle: 2.8,
                plan_ms: 800,
            },
            4 => Self {
                reaction_ms: 250,
                sample_ms: 64,
                turn: 0.043,
                pitch_step: 0.033,
                sway: 0.035,
                pitch_sway: 0.017,
                burst: 1.95,
                cycle: 2.3,
                plan_ms: 440,
            },
            5 => Self {
                reaction_ms: 160,
                sample_ms: 48,
                turn: 0.057,
                pitch_step: 0.044,
                sway: 0.020,
                pitch_sway: 0.010,
                burst: 2.00,
                cycle: 2.2,
                plan_ms: 320,
            },
            _ => standard,
        }
    }
}

#[derive(Default)]
pub(crate) struct Tracking {
    pub last_eye: Option<Vec3>,
    pub last_seen_ms: u32,
    sample_time: Option<u32>,
    velocity: Vec3,
}

impl Tracking {
    pub fn lose_sight(&mut self) {
        self.sample_time = None;
        self.velocity = Vec3::ZERO;
    }

    pub fn observe(&mut self, time: u32, eye: Vec3, interval: u32) {
        self.last_seen_ms = time;
        if let Some(last) = self.sample_time {
            let elapsed = time - last;
            if elapsed < interval {
                return;
            }
            let change = eye - self.last_eye.unwrap();
            // A teleport or respawn is not a velocity observation.
            self.velocity = if change.length() < 128. {
                (change * (1000. / elapsed as f32)).clamp_length_max(480.)
            } else {
                Vec3::ZERO
            };
        }
        self.last_eye = Some(eye);
        self.sample_time = Some(time);
    }

    pub fn aim(&self, from: Vec3, gun: usize, level: u8, time: u32) -> Vec3 {
        let delta = self.last_eye.unwrap() - from;
        if level < 4 {
            return delta;
        }
        let age = (time - self.sample_time.unwrap()) as f32 * 0.001;
        let delta = delta + self.velocity * age;
        let speed = match gun {
            4 => 700.,
            5 => 900.,
            8 | 9 => 2000.,
            _ => 0.,
        };
        if speed == 0. {
            return delta;
        }
        let estimate = (delta.length() / speed).min(0.9);
        let flight = ((delta + self.velocity * estimate).length() / speed).min(0.9);
        let lead = self.velocity * flight * if level == 5 { 1.0 } else { 0.95 };
        let lift = if gun == 4 {
            400. * flight * flight - 140. * flight
        } else {
            0.
        };
        delta + lead + Vec3::Z * lift
    }
}

pub(crate) fn choose_weapon(bot: &Actor, range: f32, level: u8) -> usize {
    let order = if level == 5 && range < 185. {
        [3, 6, 8, 7, 2, 4, 5, 1]
    } else if level == 5 && range < 460. {
        [6, 5, 8, 3, 7, 2, 4, 1]
    } else if level >= 4 && range > 750. {
        [7, 5, 8, 2, 4, 3, 6, 1]
    } else {
        [5, 6, 3, 7, 8, 2, 4, 1]
    };
    order
        .into_iter()
        .find(|&g| {
            bot.owned[g]
                && (g == 1 || bot.ammo[g] > 0)
                && !(g == 5 && range < 95.)
                && !(g == 6 && range > 750.)
        })
        .unwrap_or(1)
}

// Compare travel cost against the value of equipment and its respawn time.
pub(crate) fn pickup_goal(
    bot: &Actor,
    items: &[Item],
    time: u32,
    visible: bool,
    level: u8,
) -> Option<usize> {
    let mut best_cost = if visible { 370. } else { 900. };
    let mut best = None;
    for (i, item) in items.iter().enumerate() {
        let wait = item.next.saturating_sub(time);
        if wait > if level == 5 { 1400 } else { 700 } {
            continue;
        }
        let value = match item.class.as_str() {
            "item_armor_body" if bot.armor < 140 => 2.7,
            "item_armor_combat" if bot.armor < 100 => 2.1,
            "item_health_mega" if bot.hp < 145 => 2.4,
            "weapon_rocketlauncher" if !bot.owned[5] || bot.ammo[5] < 3 => 2.5,
            "weapon_lightning" if !bot.owned[6] || bot.ammo[6] < 10 => 2.0,
            "ammo_rockets" if bot.owned[5] && bot.ammo[5] < 4 => 1.6,
            c if c.starts_with("item_health") && bot.hp < 85 => 1.6,
            c if weapon(c).is_some_and(|g| !bot.owned[g]) => 1.3,
            "item_armor_shard" if bot.armor < 40 => 0.65,
            _ => continue,
        };
        let cost = (item.pos.distance(bot.body.pos) + wait as f32 * 0.32) / value;
        if cost < best_cost {
            best_cost = cost;
            best = Some(i);
        }
    }
    best
}
