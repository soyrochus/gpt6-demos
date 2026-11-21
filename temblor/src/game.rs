// SPDX-License-Identifier: GPL-2.0-or-later
//! Local FFA, using id's base-game item and weapon tables.
use crate::{
    bsp::{origin, Brush, Map},
    collision::{box_brush, clip, Hit, Space, World, PLAYER, SHOT},
    movement::{direction, Body, Cmd, DT},
    nav::Nav,
};
use glam::Vec3;
use serde_json::{json, Value};
pub const NAMES: [&str; 10] = [
    "",
    "Gauntlet",
    "Machinegun",
    "Shotgun",
    "Grenade launcher",
    "Rocket launcher",
    "Lightning gun",
    "Railgun",
    "Plasma gun",
    "BFG",
];
pub const WEAPONS: [&str; 10] = [
    "",
    "gauntlet",
    "machinegun",
    "shotgun",
    "grenadelauncher",
    "rocketlauncher",
    "lightning",
    "railgun",
    "plasmagun",
    "bfg",
];
const AMMO: [&str; 10] = [
    "",
    "",
    "bullets",
    "shells",
    "grenades",
    "rockets",
    "lightning",
    "slugs",
    "cells",
    "bfg",
];
const SUPPLY: [i32; 10] = [0, 0, 40, 10, 5, 5, 60, 10, 30, 15];
const PACK: [i32; 10] = [0, 0, 50, 10, 5, 5, 60, 10, 30, 15];
const INTERVAL: [u32; 10] = [0, 400, 100, 1000, 800, 800, 50, 1500, 100, 200];
#[derive(Clone)]
pub struct Actor {
    pub body: Body,
    pub previous: Vec3,
    pub hp: i32,
    pub armor: i32,
    pub ammo: [i32; 10],
    pub owned: [bool; 10],
    pub gun: usize,
    pub score: i32,
    pub ready: u32,
    pub respawn: u32,
    pub shot: u32,
    pub shot_gun: usize,
    pub spawned: u32,
    pub pain: u32,
    pub pad: u32,
}
impl Actor {
    fn spawn(pos: Vec3, yaw: f32, score: i32) -> Self {
        let mut ammo = [0; 10];
        ammo[2] = 100;
        let mut owned = [false; 10];
        owned[1] = true;
        owned[2] = true;
        Self {
            body: Body::new(pos, yaw),
            previous: pos,
            hp: 125,
            armor: 0,
            ammo,
            owned,
            gun: 2,
            score,
            ready: 0,
            respawn: 0,
            shot: 0,
            shot_gun: 0,
            spawned: 0,
            pain: 0,
            pad: 0,
        }
    }
}
pub struct Item {
    pub class: String,
    pub pos: Vec3,
    pub next: u32,
}
pub struct Missile {
    pub pos: Vec3,
    pub vel: Vec3,
    pub owner: usize,
    pub gun: usize,
    pub end: u32,
}
pub struct Effect {
    pub owner: usize,
    pub a: Vec3,
    pub b: Vec3,
    pub end: u32,
    pub gun: usize,
}
#[derive(Clone)]
struct Trigger {
    brushes: Vec<Brush>,
    target: Vec3,
    kind: String,
    damage: i32,
}
pub struct Game {
    pub world: World,
    pub nav: Nav,
    pub areas: Option<crate::aas::Areas>,
    last_plan_pos: Vec3,
    stuck: u32,
    recovery: Vec3,
    recover_until: u32,
    pub actors: [Actor; 2],
    pub items: Vec<Item>,
    pub missiles: Vec<Missile>,
    pub effects: Vec<Effect>,
    pub time: u32,
    pub winner: Option<usize>,
    pub events: Vec<Value>,
    spawns: Vec<(Vec3, f32)>,
    triggers: Vec<Trigger>,
    rng: u32,
    seed: u32,
    route: Vec<Vec3>,
    plan_at: u32,
    seen: u32,
    goal_item: Option<usize>,
    dead_z: f32,
    pub movers: Vec<Brush>,
    moving: Vec<crate::mover::Mover>,
    fixed: Vec<Brush>,
    pub offsets: Vec<[f32; 4]>,
}
fn weapon(s: &str) -> Option<usize> {
    WEAPONS
        .iter()
        .position(|w| Some(*w) == s.strip_prefix("weapon_"))
}
impl Game {
    pub fn new(map: &Map, seed: u32) -> Result<Self, String> {
        let world = World::from_map(map);
        let nav = Nav::generate(map, &world)?;
        let mut spawns = Vec::new();
        let mut items = Vec::new();
        let mut triggers = Vec::new();
        let mut movers = Vec::new();
        let mut moving = Vec::new();
        for e in &map.entities {
            let c = &e["classname"];
            if e.get("notfree").is_some_and(|x| x == "1") {
                continue;
            }
            let pos = origin(e);
            if c == "info_player_deathmatch" || c == "info_player_start" {
                if let Some(p) = world.floor(pos + Vec3::Z * 12., 2048.) {
                    spawns.push((
                        p,
                        e.get("angle")
                            .and_then(|s| s.parse::<f32>().ok())
                            .unwrap_or(0.)
                            .to_radians(),
                    ))
                }
            }
            if weapon(c).is_some() || c.starts_with("ammo_") || c.starts_with("item_") {
                let hit = world.trace(
                    pos + Vec3::Z,
                    pos - Vec3::Z * 1024.,
                    Vec3::splat(8.),
                    PLAYER,
                );
                let z = if hit.inside || hit.fraction >= 1. {
                    pos.z
                } else {
                    pos.z + 1. - 1025. * hit.fraction
                };
                items.push(Item {
                    class: c.clone(),
                    pos: Vec3::new(pos.x, pos.y, z + 8.),
                    next: 0,
                })
            }
            if let Some(i) = e
                .get("model")
                .and_then(|s| s.strip_prefix('*'))
                .and_then(|s| s.parse::<usize>().ok())
            {
                let brushes = map.brushes[map.models[i].brushes.clone()].to_vec();
                if c.starts_with("trigger_") {
                    let dest = map
                        .entities
                        .iter()
                        .find(|t| {
                            e.get("target").is_some() && t.get("targetname") == e.get("target")
                        })
                        .map(origin)
                        .unwrap_or(pos);
                    triggers.push(Trigger {
                        brushes,
                        target: dest,
                        kind: c.clone(),
                        damage: e.get("dmg").and_then(|x| x.parse().ok()).unwrap_or(5),
                    })
                } else if matches!(c.as_str(), "func_door" | "func_plat") {
                    moving.push(crate::mover::Mover::new(i, &map.models[i], e, brushes))
                } else if c.starts_with("func_") {
                    movers.extend(brushes)
                }
            }
        }
        if spawns.len() < 2 {
            return Err("Map needs at least two clear deathmatch spawns".into());
        }
        let placeholder = Actor::spawn(spawns[0].0, 0., 0);
        let mut g = Self {
            world,
            nav,
            areas: None,
            last_plan_pos: Vec3::ZERO,
            stuck: 0,
            recovery: Vec3::ZERO,
            recover_until: 0,
            actors: [placeholder.clone(), placeholder],
            items,
            missiles: vec![],
            effects: vec![],
            time: 0,
            winner: None,
            events: vec![],
            spawns,
            triggers,
            rng: seed,
            seed,
            route: vec![],
            plan_at: 0,
            seen: 0,
            goal_item: None,
            dead_z: map.models[0].min.z - 128.,
            fixed: movers.clone(),
            movers,
            moving,
            offsets: vec![[0.; 4]; map.models.len()],
        };
        g.reset();
        Ok(g)
    }
    fn random(&mut self) -> f32 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        (x >> 8) as f32 / 16777216.
    }
    pub fn reset(&mut self) {
        self.time = 0;
        for m in &mut self.moving {
            m.frac = 0.;
            m.wait_until = 0
        }
        self.sync_movers();
        self.rng = self.seed.max(1);
        self.winner = None;
        self.missiles.clear();
        self.effects.clear();
        self.events.clear();
        self.route.clear();
        self.plan_at = 0;
        self.seen = 0;
        self.goal_item = None;
        self.stuck = 0;
        self.recover_until = 0;
        self.last_plan_pos = Vec3::ZERO;
        for i in &mut self.items {
            i.next = 0
        }
        let n = self.spawns.len();
        let a = (self.random() * n as f32) as usize;
        let b = (a + 1 + (self.random() * (n - 1) as f32) as usize) % n;
        for (i, s) in [a, b].into_iter().enumerate() {
            let (p, y) = self.spawns[s];
            self.actors[i] = Actor::spawn(p, y, 0);
            self.event("respawn", i, p, "")
        }
    }
    fn event(&mut self, k: &str, i: usize, p: Vec3, label: &str) {
        self.events
            .push(json!({"ms":self.time,"kind":k,"actor":i,"pos":p.to_array(),"detail":label}));
    }
    fn respawn(&mut self, i: usize) {
        let other = self.actors[1 - i].body.pos;
        let mut choices = self.spawns.clone();
        choices.sort_by(|a, b| {
            b.0.distance_squared(other)
                .total_cmp(&a.0.distance_squared(other))
        });
        let ix = (self.random() * (choices.len() / 2).max(1) as f32) as usize;
        let (p, y) = choices[ix];
        self.actors[i] = Actor::spawn(p, y, self.actors[i].score);
        self.actors[i].spawned = self.time;
        if i == 1 {
            self.route.clear();
            self.plan_at = 0;
            self.seen = 0
        }
        self.event("respawn", i, p, "")
    }
    pub fn sight(&self, p: Vec3, q: Vec3) -> bool {
        let mut hit = self.world.trace(p, q, Vec3::ZERO, SHOT);
        for b in &self.movers {
            clip(b, p, q, Vec3::ZERO, &mut hit)
        }
        hit.fraction == 1.
    }
    fn bot(&mut self) -> Cmd {
        let bot = &self.actors[1];
        let b = bot.body;
        let human = &self.actors[0];
        let dest = human.body.pos;
        let live = human.hp > 0;
        let delta = human.body.eye() - b.eye();
        let dist = delta.length();
        let visible = live && self.sight(b.eye(), human.body.eye());
        if !visible {
            self.seen = 0
        } else if self.seen == 0 {
            self.seen = self.time
        }
        if self.time >= self.plan_at {
            self.plan_at = self.time + 680;
            if b.pos.distance(self.last_plan_pos) < 24. && !visible {
                self.stuck += 1
            } else {
                self.stuck = 0
            }
            self.last_plan_pos = b.pos;
            if self.stuck >= 2 && !self.nav.points.is_empty() {
                let k = (self.rng as usize ^ (self.time as usize).wrapping_mul(17))
                    % self.nav.points.len();
                self.recovery = self.nav.points[k];
                self.recover_until = self.time + 2800;
                self.stuck = 0;
            }
            let need = self
                .items
                .iter()
                .enumerate()
                .filter(|(_, i)| {
                    i.next <= self.time
                        && ((weapon(&i.class).is_some_and(|w| !bot.owned[w]))
                            || (bot.hp < 90 && i.class.starts_with("item_health"))
                            || (bot.armor < 40 && i.class.starts_with("item_armor")))
                })
                .min_by(|(_, a), (_, c)| {
                    a.pos
                        .distance_squared(b.pos)
                        .total_cmp(&c.pos.distance_squared(b.pos))
                });
            self.goal_item = need
                .filter(|(_, it)| it.pos.distance(b.pos) < if visible { 210. } else { 560. })
                .map(|(i, _)| i);
            let mut firing = dest;
            if !visible && self.goal_item.is_none() {
                let mut choices: Vec<_> = self
                    .nav
                    .points
                    .iter()
                    .filter(|p| p.distance_squared(dest) < 720. * 720.)
                    .collect();
                choices.sort_by(|p, q| {
                    p.distance_squared(b.pos)
                        .total_cmp(&q.distance_squared(b.pos))
                });
                if let Some(p) = choices
                    .into_iter()
                    .find(|p| self.sight(**p + Vec3::Z * 26., human.body.eye()))
                {
                    firing = *p
                }
            }
            let goal = if self.time < self.recover_until {
                self.recovery
            } else {
                self.goal_item.map(|i| self.items[i].pos).unwrap_or(firing)
            };
            if self.stuck > 0 || self.route.last().is_none_or(|p| p.distance(goal) > 64.) {
                self.route = self
                    .areas
                    .as_ref()
                    .and_then(|a| a.path(b.pos, goal))
                    .unwrap_or_else(|| self.nav.path(b.pos, goal, &self.world))
            }
        }
        while self.route.first().is_some_and(|p| {
            (p.truncate() - b.pos.truncate()).length() < 22. && (p.z - b.pos.z).abs() < 55.
        }) {
            self.route.remove(0);
        }
        let next = self.route.first().copied().unwrap_or(dest);
        let travel = next - b.pos;
        let t = self.time as f32 * 0.001;
        let strafing = visible && dist < 560. && self.goal_item.is_none();
        let target = if visible { delta } else { travel };
        let aim = target.y.atan2(target.x) + if visible { 0.056 * (t * 2.7).sin() } else { 0. };
        let yaw = b.yaw + angle(aim - b.yaw).clamp(-0.030, 0.030);
        let tilt = if visible {
            delta.z.atan2(delta.truncate().length()) + 0.027 * (t * 3.1).sin()
        } else {
            0.
        };
        let pitch = b.pitch + (tilt - b.pitch).clamp(-0.021, 0.021);
        let front = direction(yaw, 0.);
        let right = front.cross(Vec3::Z);
        let walk = if strafing {
            right * (t * 1.9).sin() * 0.7
                + front
                    * if dist > 380. {
                        0.4
                    } else if dist < 125. {
                        -0.6
                    } else {
                        0.
                    }
        } else {
            travel.truncate().extend(0.).normalize_or_zero()
        };
        let best = [5, 6, 3, 7, 8, 2, 4, 1]
            .into_iter()
            .find(|&g| {
                bot.owned[g]
                    && (g == 1 || bot.ammo[g] > 0)
                    && !(g == 5 && dist < 95.)
                    && !(g == 6 && dist > 750.)
            })
            .unwrap_or(1);
        Cmd {
            yaw,
            pitch,
            forward: walk.dot(front),
            side: walk.dot(right),
            jump: !strafing
                && travel.z > 14.
                && ((b.grounded && !b.held_jump)
                    || self.world.trace(b.pos, b.pos, Vec3::ZERO, 32).inside),
            fire: visible
                && self.time - self.seen > 360
                && angle(aim - yaw).abs() < 0.15
                && t % 2.3 < 1.75,
            weapon: best,
            ..Cmd::default()
        }
    }
    fn sync_movers(&mut self) {
        if self.moving.is_empty() {
            return;
        }
        self.movers.clone_from(&self.fixed);
        for m in &self.moving {
            m.append(&mut self.movers);
            self.offsets[m.model] = m.offset().extend(0.).to_array()
        }
    }
    fn move_platforms(&mut self) {
        let points = [0, 1].map(|i| (self.actors[i].hp > 0).then_some(self.actors[i].body.pos));
        let mut changed = false;
        for m in &mut self.moving {
            let old = m.offset();
            let d = m.advance(self.time, points);
            if d != Vec3::ZERO {
                changed = true;
                for a in &mut self.actors {
                    if m.ride(a.body.pos, old) {
                        a.body.pos += d
                    }
                }
            }
        }
        if changed {
            self.sync_movers()
        }
    }
    pub fn tick(&mut self, input: Cmd) {
        if self.winner.is_some() {
            return;
        }
        self.time += 8;
        self.move_platforms();
        let bot = self.bot();
        for (i, c) in [input, bot].into_iter().enumerate() {
            if self.actors[i].hp <= 0 {
                if self.time >= self.actors[i].respawn {
                    self.respawn(i)
                }
                continue;
            }
            let other = &self.actors[1 - i];
            let (min, max) = other.body.bounds();
            let other = (other.hp > 0).then(|| box_brush(min, max, PLAYER));
            let space = Space {
                world: &self.world,
                movers: &self.movers,
                other,
            };
            let a = &mut self.actors[i];
            a.previous = a.body.pos;
            let liquid = self
                .world
                .trace(a.body.pos, a.body.pos, Vec3::ZERO, 32)
                .inside;
            a.body.step(c, &space, liquid);
            if c.weapon > 0
                && c.weapon < 10
                && c.weapon != a.gun
                && a.owned[c.weapon]
                && a.ready <= self.time
            {
                a.gun = c.weapon;
                a.ready = self.time + 250;
            }
            self.environment(i);
            if self.winner.is_some() {
                return;
            }
            if self.actors[i].hp <= 0 {
                continue;
            }
            self.collect(i);
            if c.fire {
                self.shoot(i)
            }
            if self.winner.is_some() {
                return;
            }
            if self.time % 1000 == 0 {
                let a = &mut self.actors[i];
                if a.hp > 100 {
                    a.hp -= 1
                }
                if a.armor > 100 {
                    a.armor -= 1
                }
            }
        }
        self.advance_missiles();
        self.effects.retain(|e| e.end > self.time)
    }
    fn environment(&mut self, i: usize) {
        let p = self.actors[i].body.pos;
        if p.z < self.dead_z {
            self.hurt(i, i, 10000, Vec3::ZERO);
            return;
        }
        if self.time % 304 == 0 && self.world.trace(p, p, Vec3::ZERO, 8 | 16).inside {
            self.hurt(i, i, 30, Vec3::ZERO)
        }
        if self.time < self.actors[i].pad {
            return;
        }
        for trigger in &self.triggers {
            if !trigger.brushes.iter().any(|b| {
                let mut h = Hit::default();
                clip(b, p, p, Vec3::new(15., 15., 24.), &mut h);
                h.inside
            }) {
                continue;
            }
            let a = &mut self.actors[i];
            a.pad = self.time + 304;
            match trigger.kind.as_str() {
                "trigger_push" => {
                    let d = trigger.target - p;
                    let t = (2. * d.z.max(8.) / 800.).sqrt();
                    a.body.vel = Vec3::new(d.x / t, d.y / t, 800. * t);
                    self.event("jump pad", i, p, "")
                }
                "trigger_teleport" => {
                    a.body.pos = trigger.target + Vec3::Z * 1.;
                    a.previous = a.body.pos;
                    a.body.vel = Vec3::ZERO;
                    self.event("teleport", i, p, "")
                }
                "trigger_hurt" => {
                    let d = trigger.damage;
                    self.hurt(i, i, d, Vec3::ZERO)
                }
                _ => {}
            }
            break;
        }
    }
    fn collect(&mut self, i: usize) {
        let a = &mut self.actors[i];
        for it in &mut self.items {
            if it.next > self.time {
                continue;
            }
            let d = (it.pos - a.body.pos).abs();
            if d.x > 40. || d.y > 36. || d.z > 42. {
                continue;
            }
            let c = it.class.as_str();
            let seconds = if let Some(w) = weapon(c) {
                a.owned[w] = true;
                a.ammo[w] = (a.ammo[w] + (SUPPLY[w] - a.ammo[w]).max(1)).min(200);
                if w > a.gun {
                    a.gun = w;
                    a.ready = self.time + 250
                }
                5
            } else if let Some(w) = AMMO
                .iter()
                .position(|v| Some(*v) == c.strip_prefix("ammo_"))
            {
                if a.ammo[w] >= 200 {
                    continue;
                }
                a.ammo[w] = (a.ammo[w] + PACK[w]).min(200);
                40
            } else if c.starts_with("item_health") {
                let (n, cap) = match c {
                    "item_health_small" => (5, 200),
                    "item_health_large" => (50, 100),
                    "item_health_mega" => (100, 200),
                    _ => (25, 100),
                };
                if a.hp >= cap {
                    continue;
                }
                a.hp = (a.hp + n).min(cap);
                35
            } else if c.starts_with("item_armor") {
                if a.armor >= 200 {
                    continue;
                }
                a.armor = (a.armor
                    + match c {
                        "item_armor_shard" => 5,
                        "item_armor_body" => 100,
                        _ => 50,
                    })
                .min(200);
                25
            } else {
                continue;
            };
            it.next = self.time + seconds * 1000;
            self.events.push(json!({"ms":self.time,"kind":"pickup","actor":i,"pos":it.pos.to_array(),"detail":c}))
        }
    }
    fn ray(&self, owner: usize, p: Vec3, q: Vec3, h: Vec3) -> (Option<usize>, Hit) {
        let mut result = self.world.trace(p, q, h, SHOT);
        for b in &self.movers {
            clip(b, p, q, h, &mut result)
        }
        let target = 1 - owner;
        let a = &self.actors[target];
        let mut actor = None;
        if a.hp > 0 {
            let (min, max) = a.body.bounds();
            let mut ah = Hit::default();
            clip(&box_brush(min, max, SHOT), p, q, h, &mut ah);
            if ah.fraction < result.fraction {
                actor = Some(target);
                result = ah
            }
        }
        (actor, result)
    }
    fn shoot(&mut self, i: usize) {
        let a = &mut self.actors[i];
        if a.ready > self.time || a.hp <= 0 {
            return;
        }
        let g = a.gun;
        if g != 1 && a.ammo[g] <= 0 {
            return;
        }
        let b = a.body;
        let dir = direction(b.yaw, b.pitch);
        let p = b.eye() + dir * 14.;
        if g != 1 {
            a.ammo[g] -= 1
        }
        a.ready = self.time + INTERVAL[g];
        a.shot = self.time;
        a.shot_gun = g;
        self.event("shot", i, p, NAMES[g]);
        if matches!(g, 4 | 5 | 8 | 9) {
            self.missiles.push(Missile {
                pos: p,
                vel: dir
                    * match g {
                        4 => 700.,
                        5 => 900.,
                        8 => 2000.,
                        _ => 2000.,
                    }
                    + if g == 4 { Vec3::Z * 140. } else { Vec3::ZERO },
                owner: i,
                gun: g,
                end: self.time + if g == 4 { 2500 } else { 10000 },
            });
            return;
        }
        let right = dir.cross(Vec3::Z).normalize_or_zero();
        let up = right.cross(dir);
        let range = match g {
            1 => 48.,
            6 => 768.,
            _ => 8192.,
        };
        for _ in 0..if g == 3 { 11 } else { 1 } {
            let spread = match g {
                2 => 200. / 8192.,
                3 => 0.085,
                _ => 0.,
            };
            let theta = self.random() * std::f32::consts::TAU;
            let spread_dir = right * theta.cos() * (self.random() * 2. - 1.)
                + up * theta.sin() * (self.random() * 2. - 1.);
            let q = p + (dir + spread_dir * spread) * range;
            let (v, h) = self.ray(i, p, q, Vec3::ZERO);
            let end = p.lerp(q, h.fraction);
            self.effects.push(Effect {
                owner: i,
                a: p,
                b: end,
                end: self.time + 64,
                gun: g,
            });
            if h.fraction < 1. {
                self.event("impact", i, end, NAMES[g])
            }
            if let Some(j) = v {
                self.hurt(
                    j,
                    i,
                    match g {
                        1 => 50,
                        2 => 7,
                        3 => 10,
                        6 => 8,
                        7 => 100,
                        _ => 10,
                    },
                    dir,
                );
                if self.winner.is_some() {
                    return;
                }
            }
        }
    }
    fn hurt(&mut self, victim: usize, attacker: usize, damage: i32, dir: Vec3) {
        if self.winner.is_some() || self.actors[victim].hp <= 0 {
            return;
        }
        let a = &mut self.actors[victim];
        let p = a.body.pos;
        a.body.vel += dir.normalize_or_zero() * (damage.min(200) * 5) as f32;
        let damage = if victim == attacker && damage < 1000 {
            (damage / 2).max(1)
        } else {
            damage
        };
        let save = ((damage as f32 * 0.66).ceil() as i32).min(a.armor);
        a.armor -= save;
        a.hp -= damage - save;
        a.pain = self.time;
        self.event("pain", victim, p, "");
        if self.actors[victim].hp <= 0 {
            self.actors[victim].respawn = self.time + 1700;
            self.actors[attacker].score += if attacker == victim { -1 } else { 1 };
            self.event("death", victim, p, "");
            self.event(
                if victim == attacker {
                    "suicide"
                } else {
                    "frag"
                },
                attacker,
                p,
                "",
            );
            if self.actors[attacker].score >= 5 {
                self.winner = Some(attacker);
                self.event("intermission", attacker, p, "")
            }
        }
    }
    fn advance_missiles(&mut self) {
        for mut m in std::mem::take(&mut self.missiles) {
            if self.winner.is_some() {
                break;
            }
            if m.gun == 4 {
                m.vel.z -= 800. * DT
            }
            let q = m.pos + m.vel * DT;
            let (v, h) = self.ray(m.owner, m.pos, q, Vec3::ZERO);
            let p = m.pos.lerp(q, h.fraction);
            if h.fraction >= 1. && m.end > self.time {
                m.pos = q;
                self.missiles.push(m);
                continue;
            }
            if m.gun == 4 && v.is_none() && m.end > self.time {
                m.vel = (m.vel - 2. * m.vel.dot(h.normal) * h.normal) * 0.65;
                m.pos = p + h.normal * 0.3;
                self.missiles.push(m);
                continue;
            }
            let damage = if m.gun == 8 { 20 } else { 100 };
            if let Some(j) = v {
                self.hurt(j, m.owner, damage, m.vel)
            }
            let radius = if m.gun == 8 { 20. } else { 120. };
            for j in 0..2 {
                if Some(j) == v {
                    continue;
                }
                let a = &self.actors[j];
                let (min, max) = a.body.bounds();
                let dist = p.distance(p.clamp(min, max));
                let d = a.body.pos - p;
                if dist < radius && self.sight(p + h.normal * 0.5, a.body.pos) {
                    self.hurt(
                        j,
                        m.owner,
                        ((1. - dist / radius) * damage as f32) as i32,
                        d + Vec3::Z * 24.,
                    )
                }
            }
            self.effects.push(Effect {
                owner: m.owner,
                a: p,
                b: p,
                end: self.time + 180,
                gun: m.gun,
            });
            self.event("impact", m.owner, p, NAMES[m.gun]);
        }
    }
    pub fn route_debug(&self) -> (Option<usize>, Option<&Vec3>, usize) {
        (self.goal_item, self.route.first(), self.route.len())
    }
    pub fn snapshot(&self) -> Value {
        let a = &self.actors[0];
        json!({"ms":self.time,"health":a.hp.max(0),"armor":a.armor,"ammo":a.ammo[a.gun],"gun":a.gun,"weapon":NAMES[a.gun],"owned":a.owned,"scores":[a.score,self.actors[1].score],"winner":self.winner,"pos":a.body.pos.to_array(),"yaw":a.body.yaw,"pitch":a.body.pitch,"bot":self.actors[1].body.pos.to_array(),"botHealth":self.actors[1].hp.max(0),"pain":a.pain,"visible":self.sight(a.body.eye(),self.actors[1].body.eye())})
    }
}
pub fn angle(v: f32) -> f32 {
    (v + std::f32::consts::PI).rem_euclid(std::f32::consts::TAU) - std::f32::consts::PI
}

#[cfg(test)]
mod rules_tests {
    use super::*;
    fn duel() -> Game {
        let map = Map::parse(include_bytes!("../assets/source/maps/oa_rpg3dm2.bsp")).unwrap();
        let mut g = Game::new(&map, 413).unwrap();
        g.world = World::new(vec![box_brush(
            Vec3::new(-2000., -2000., -64.),
            Vec3::new(2000., 2000., 0.),
            1,
        )]);
        g.actors = [
            Actor::spawn(Vec3::new(0., 0., 24.125), 0., 0),
            Actor::spawn(Vec3::new(180., 0., 24.125), 0., 0),
        ];
        g.items.clear();
        g.events.clear();
        g
    }
    #[test]
    fn blocked_shots_misses_empty_and_armor() {
        let mut g = duel();
        g.movers.push(box_brush(
            Vec3::new(70., -40., 0.),
            Vec3::new(80., 40., 128.),
            1,
        ));
        g.shoot(0);
        assert_eq!(g.actors[1].hp, 125);
        assert_eq!(g.actors[0].ammo[2], 99);
        g.movers.clear();
        g.time = 104;
        g.actors[0].body.yaw = 1.6;
        g.shoot(0);
        assert_eq!(g.actors[0].ammo[2], 98);
        assert_eq!(g.actors[1].hp, 125);
        g.time = 208;
        g.actors[0].body.yaw = 0.;
        g.actors[1].armor = 50;
        g.shoot(0);
        assert_eq!((g.actors[1].armor, g.actors[1].hp), (45, 123));
        g.actors[0].ammo[2] = 0;
        g.time = 312;
        g.events.clear();
        g.shoot(0);
        assert!(g.events.is_empty());
    }
    #[test]
    fn rocket_travel_splash_and_suicide() {
        let mut g = duel();
        g.actors[0].gun = 5;
        g.actors[0].ammo[5] = 1;
        g.actors[0].hp = 10;
        g.movers.push(box_brush(
            Vec3::new(55., -40., 0.),
            Vec3::new(65., 40., 128.),
            1,
        ));
        g.actors[1].body.pos.x = 85.;
        g.shoot(0);
        assert_eq!(g.missiles.len(), 1);
        g.advance_missiles();
        assert_eq!(g.actors[0].hp, 10);
        for _ in 0..15 {
            g.time += 8;
            g.advance_missiles()
        }
        assert!(g.missiles.is_empty());
        assert_eq!(g.actors[1].hp, 125);
        assert_eq!(g.actors[0].score, -1);
        assert_eq!(
            g.events.iter().filter(|e| e["kind"] == "suicide").count(),
            1
        );
    }
    #[test]
    fn pickup_returns_and_dead_actor_cannot_shoot() {
        let mut g = duel();
        g.items.push(Item {
            class: "weapon_rocketlauncher".into(),
            pos: g.actors[0].body.pos,
            next: 0,
        });
        g.collect(0);
        assert!(g.actors[0].owned[5]);
        assert_eq!(g.actors[0].ammo[5], 5);
        g.actors[0].ammo[5] = 0;
        g.time = 4992;
        g.collect(0);
        assert_eq!(g.actors[0].ammo[5], 0);
        g.time = 5000;
        g.collect(0);
        assert_eq!(g.actors[0].ammo[5], 5);
        g.actors[0].body.pos.z = g.dead_z - 1.;
        g.environment(0);
        assert!(g.actors[0].hp <= 0);
        g.events.clear();
        g.shoot(0);
        assert!(g.events.is_empty());
    }
}
