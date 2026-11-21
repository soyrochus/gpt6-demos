// SPDX-License-Identifier: GPL-2.0-or-later
//! Bundled OpenArena player, attachment hierarchy and equipped weapons.
use crate::{
    bsp::Map,
    content::{Result, Vfs},
    draw::Vertex,
    game::Actor,
    material::Palette,
    md3::{Mesh, Pose},
};
use glam::{Affine3A, Quat, Vec3};
use std::collections::BTreeMap;

pub struct Light {
    ambient: Vec3,
    directed: Vec3,
    direction: Vec3,
}
impl Light {
    pub fn shade(&self, n: Vec3) -> Vec3 {
        self.ambient + self.directed * n.dot(self.direction).max(0.)
    }
}
pub struct LightGrid {
    start: Vec3,
    step: Vec3,
    dims: [usize; 3],
    cells: Vec<u8>,
}
impl LightGrid {
    pub fn new(m: &Map) -> Self {
        let step = m
            .entities
            .first()
            .and_then(|e| e.get("gridsize"))
            .and_then(|s| {
                let v: Vec<_> = s
                    .split_whitespace()
                    .filter_map(|v| v.parse::<f32>().ok())
                    .collect();
                (v.len() == 3 && v.iter().all(|v| v.is_finite() && *v >= 1.))
                    .then(|| Vec3::from_slice(&v))
            })
            .unwrap_or(Vec3::new(64., 64., 128.));
        let start = (m.models[0].min / step).ceil();
        let dims = ((m.models[0].max / step).floor() - start + Vec3::ONE)
            .max(Vec3::ONE)
            .to_array()
            .map(|x| x as usize);
        Self {
            start: start * step,
            step,
            dims,
            cells: m.light_grid.clone(),
        }
    }
    pub fn sample(&self, p: Vec3) -> Light {
        let fallback = Light {
            ambient: Vec3::splat(0.45),
            directed: Vec3::splat(0.55),
            direction: Vec3::new(0.4, 0.3, 0.85),
        };
        if self.dims.iter().try_fold(8usize, |s, &n| s.checked_mul(n)) != Some(self.cells.len()) {
            return fallback;
        }
        let coord = ((p - self.start) / self.step).clamp(
            Vec3::ZERO,
            Vec3::from_array(self.dims.map(|x| (x - 1) as f32)),
        );
        let frac = coord.fract();
        let base = coord.floor().to_array().map(|x| x as usize);
        let mut ambient = Vec3::ZERO;
        let mut directed = Vec3::ZERO;
        let mut direction = Vec3::ZERO;
        let mut weight = 0.;
        for mask in 0..8 {
            let mut ijk = base;
            let mut w = 1.;
            for j in 0..3 {
                if mask & (1 << j) == 0 {
                    w *= 1. - frac[j]
                } else {
                    ijk[j] = (ijk[j] + 1).min(self.dims[j] - 1);
                    w *= frac[j]
                }
            }
            let off = 8 * (ijk[0] + self.dims[0] * (ijk[1] + self.dims[1] * ijk[2]));
            let c = &self.cells[off..off + 8];
            if c[..3] == [0, 0, 0] {
                continue;
            }
            let rgb = |i: usize| Vec3::new(c[i] as f32, c[i + 1] as f32, c[i + 2] as f32);
            ambient += w * rgb(0);
            directed += w * rgb(3);
            weight += w;
            let radians = std::f32::consts::TAU / 256.;
            let (sa, ca) = (c[7] as f32 * radians).sin_cos();
            let (sp, cp) = (c[6] as f32 * radians).sin_cos();
            direction += w * Vec3::new(ca * sp, sa * sp, cp);
        }
        if weight <= 0. {
            return fallback;
        }
        let scale = 2. / (255. * weight);
        Light {
            ambient: (ambient * scale + Vec3::splat(0.12)).min(Vec3::ONE),
            directed: directed * scale,
            direction: direction.normalize_or_zero(),
        }
    }
}
struct Clip {
    start: usize,
    count: usize,
    loops: usize,
    fps: f32,
}
impl Clip {
    fn pose(&self, ms: u32) -> Pose {
        let t = ms as f32 * self.fps / 1000.;
        let frame = |i: usize| {
            self.start
                + if i < self.count {
                    i
                } else if self.loops == 0 {
                    self.count - 1
                } else {
                    self.count - self.loops + (i - self.count) % self.loops
                }
        };
        Pose {
            a: frame(t as usize),
            b: frame(t as usize + 1),
            mix: t.fract(),
        }
    }
}
const CHARACTER: &str = "models/players/major";
const WEAPONS: [&str; 6] = [
    "gauntlet",
    "machinegun",
    "shotgun",
    "grenadel",
    "rocketl",
    "lightning",
];
struct Weapon {
    mesh: Mesh,
    barrel: Option<Mesh>,
    hand: Option<Mesh>,
}
pub struct Actors {
    lower: Mesh,
    upper: Mesh,
    head: Mesh,
    clips: Vec<Clip>,
    guns: Vec<Weapon>,
}
impl Actors {
    pub fn load(vfs: &mut Vfs, palette: &mut Palette) -> Result<Self> {
        let mut textures = BTreeMap::new();
        let mut materials = BTreeMap::new();
        let mut skin = |vfs: &mut Vfs, name: &str| {
            let name = match name {
                "models/weapons2/machinegun/skin" => "models/weapons2/machinegun/mgun",
                "models/weapons2/shotgun/skinoa" => "models/weapons2/shotgun/shotgun",
                s => s,
            };
            if let Some(id) = materials.get(name) {
                return Ok(*id);
            }
            let id = palette.skin(vfs, name, &mut textures)?;
            materials.insert(name.to_owned(), id);
            Ok(id)
        };
        let mut body = |name: &str| {
            let skinfile = vfs.read(&format!("{CHARACTER}/{name}_default.skin"))?;
            Mesh::load(
                vfs,
                &format!("{CHARACTER}/{name}.md3"),
                Some(&String::from_utf8_lossy(&skinfile)),
                &mut skin,
            )
        };
        let lower = body("lower")?;
        let upper = body("upper")?;
        let head = body("head")?;
        lower.require("tag_torso")?;
        upper.require("tag_head")?;
        upper.require("tag_weapon")?;
        let cfg = vfs.read(&format!("{CHARACTER}/animation.cfg"))?;
        let mut clips = vec![];
        for line in String::from_utf8_lossy(&cfg).lines() {
            let mut words = line.split("//").next().unwrap().split_whitespace();
            let Some(start) = words.next().and_then(|w| w.parse::<usize>().ok()) else {
                continue;
            };
            let err = "Invalid Major animation.cfg";
            let count = words
                .next()
                .and_then(|w| w.parse::<usize>().ok())
                .ok_or(err)?;
            let loops = words
                .next()
                .and_then(|w| w.parse::<usize>().ok())
                .ok_or(err)?;
            let fps = words
                .next()
                .and_then(|w| w.parse::<f32>().ok())
                .ok_or(err)?;
            if count == 0 || loops > count || !(0.1..=120.).contains(&fps) {
                return Err(err.into());
            }
            clips.push(Clip {
                start,
                count,
                loops,
                fps,
            });
        }
        if clips.len() != 25 {
            return Err("Incomplete Major animation.cfg".into());
        }
        let skip = clips[13]
            .start
            .checked_sub(clips[6].start)
            .ok_or("Invalid legs offset")?;
        for (i, clip) in clips.iter_mut().enumerate() {
            let max = if i >= 13 {
                clip.start = clip.start.checked_sub(skip).ok_or("Invalid legs frame")?;
                lower.frames
            } else if i < 6 {
                lower.frames.min(upper.frames)
            } else {
                upper.frames
            };
            if clip.start.checked_add(clip.count).is_none_or(|n| n > max) {
                return Err(format!("Animation {i} exceeds MD3 frames"));
            }
        }
        let mut guns = vec![];
        for name in WEAPONS {
            let base = format!("models/weapons2/{name}/{name}");
            let mesh = Mesh::load(vfs, &format!("{base}.md3"), None, &mut skin)?;
            let mut optional = |suffix: &str| {
                let path = format!("{base}_{suffix}.md3");
                vfs.origin(&path)
                    .is_some()
                    .then(|| Mesh::load(vfs, &path, None, &mut skin))
                    .transpose()
            };
            let barrel = optional("barrel")?;
            let hand = optional("hand")?;
            if barrel.is_some() {
                mesh.require("tag_barrel")?
            }
            if name != "gauntlet" {
                mesh.require("tag_flash")?
            }
            if let Some(h) = &hand {
                h.require("tag_weapon")?
            }
            guns.push(Weapon { mesh, barrel, hand });
        }
        Ok(Self {
            lower,
            upper,
            head,
            clips,
            guns,
        })
    }
    pub fn view(&self, gun: usize, elapsed: u32) -> Affine3A {
        // OpenArena uses the machinegun hand rig for weapons without their own.
        let h = self.guns[gun - 1]
            .hand
            .as_ref()
            .unwrap_or_else(|| self.guns[1].hand.as_ref().unwrap());
        let t = if elapsed < 330 {
            1. + elapsed as f32 * 0.015
        } else {
            0.
        };
        h.tag(
            "tag_weapon",
            Pose {
                a: (t as usize).min(h.frames - 1),
                b: (t.ceil() as usize).min(h.frames - 1),
                mix: t.fract(),
            },
        )
    }
    pub fn weapon(
        &self,
        out: &mut Vec<Vertex>,
        gun: usize,
        at: Affine3A,
        light: &Light,
        elapsed: u32,
    ) -> Vec3 {
        let w = &self.guns[gun - 1];
        let pose = Pose::default();
        w.mesh.draw(out, at, pose, light);
        if let Some(barrel) = &w.barrel {
            let spin = if elapsed < 240 {
                (elapsed as f32 / 240.) * std::f32::consts::TAU
            } else {
                0.
            };
            barrel.draw(
                out,
                at * w.mesh.tag("tag_barrel", pose)
                    * Affine3A::from_quat(Quat::from_rotation_x(spin)),
                pose,
                light,
            );
        }
        let tag = if gun == 1 { "tag_barrel" } else { "tag_flash" };
        let muzzle = at * w.mesh.tag(tag, pose);
        if elapsed < 52 && gun != 1 {
            // A short luminous cone is attached at the authored muzzle origin.
            for i in 0..8 {
                let ring = |i: usize| {
                    let (s, c) = (i as f32 * std::f32::consts::TAU / 8.).sin_cos();
                    Vec3::new(1., s * 1.7, c * 1.7)
                };
                for p in [
                    ring(i),
                    ring(i + 1),
                    Vec3::X * (5. + 2. * (1. - elapsed as f32 / 52.)),
                ] {
                    out.push(Vertex::tint(
                        muzzle.transform_point3(p),
                        Vec3::new(1., 0.78, 0.27),
                    ));
                }
            }
        }
        muzzle.transform_point3(Vec3::ZERO)
    }
    pub fn opponent(
        &self,
        out: &mut Vec<Vertex>,
        a: &Actor,
        time: u32,
        alpha: f32,
        lighting: &LightGrid,
    ) -> (Affine3A, Light) {
        let pos = a.previous.lerp(a.body.pos, alpha);
        let light = lighting.sample(pos);
        let elapsed = shot_age(a, time);
        let since_spawn = time - a.spawned;
        let pain = if a.pain > 0 {
            1. - (time - a.pain) as f32 / 220.
        } else {
            0.
        };
        let moving = a.body.vel.truncate().length() > 24.;
        let (legs, torso) = if a.hp <= 0 {
            let death = self.clips[0].pose(1700 - a.respawn.saturating_sub(time));
            (death, death)
        } else {
            let legs = self.clips[if a.body.crouch {
                if moving {
                    13
                } else {
                    23
                }
            } else if moving {
                15
            } else {
                22
            }]
            .pose(since_spawn);
            let melee = a.gun == 1;
            let torso = if elapsed < 350 {
                self.clips[if melee { 8 } else { 7 }].pose(elapsed)
            } else if since_spawn < 200 {
                self.clips[10].pose(since_spawn)
            } else {
                self.clips[if melee { 12 } else { 11 }].pose(since_spawn)
            };
            (legs, torso)
        };
        let scale = 0.96;
        let root = Affine3A::from_scale_rotation_translation(
            Vec3::splat(scale),
            Quat::from_rotation_z(a.body.yaw),
            pos - Vec3::Z * (24. + scale * self.lower.floor(legs)),
        );
        self.lower.draw(out, root, legs, &light);
        let pitch = if a.hp > 0 {
            -a.body.pitch * 0.75 + pain.max(0.) * 0.28
        } else {
            0.
        };
        let upper = root
            * self.lower.tag("tag_torso", legs)
            * Affine3A::from_quat(Quat::from_rotation_y(pitch));
        self.upper.draw(out, upper, torso, &light);
        self.head.draw(
            out,
            upper * self.upper.tag("tag_head", torso),
            Pose::default(),
            &light,
        );
        (upper * self.upper.tag("tag_weapon", torso), light)
    }
}
pub fn shot_age(a: &Actor, time: u32) -> u32 {
    if a.shot > 0 && a.shot_gun == a.gun {
        time - a.shot
    } else {
        u32::MAX
    }
}
