// SPDX-License-Identifier: GPL-2.0-or-later
//! Game-owned articulated armour, pickups, view weapon and effects.
use crate::{bsp::Point, game::Game, movement::direction};
use bytemuck::{Pod, Zeroable};
use glam::{Mat3, Vec3, Vec4};
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Vertex {
    p: [f32; 3],
    uv: [f32; 2],
    lm: [f32; 2],
    color: [f32; 4],
    normal: [f32; 3],
    ids: [u32; 2],
}
impl Vertex {
    pub fn world(p: Point, m: u32, l: u32) -> Self {
        Self {
            p: p.pos.to_array(),
            uv: p.uv.to_array(),
            lm: p.lm.to_array(),
            color: p.color.to_array(),
            normal: p.normal.to_array(),
            ids: [m, l],
        }
    }
    fn tint(p: Vec3, color: Vec3) -> Self {
        Self {
            p: p.to_array(),
            color: color.extend(1.).to_array(),
            ..Self::zeroed()
        }
    }
}
struct Model<'a> {
    v: &'a mut Vec<Vertex>,
    center: Vec3,
    basis: Mat3,
}
impl Model<'_> {
    fn block(&mut self, p: Vec3, size: Vec3, rgb: Vec3) {
        let mut verts = [Vec3::ZERO; 8];
        for (i, v) in verts.iter_mut().enumerate() {
            let sign = Vec3::new(
                if i & 1 == 0 { -1. } else { 1. },
                if i & 2 == 0 { -1. } else { 1. },
                if i & 4 == 0 { -1. } else { 1. },
            );
            *v = self.center + self.basis * (p + sign * size * 0.5)
        }
        for (face, shade) in [
            ([0, 1, 3, 2], 0.48),
            ([4, 6, 7, 5], 1.),
            ([0, 4, 5, 1], 0.70),
            ([2, 3, 7, 6], 0.83),
            ([0, 2, 6, 4], 0.65),
            ([1, 5, 7, 3], 0.93),
        ] {
            for i in [0, 1, 2, 0, 2, 3] {
                self.v.push(Vertex::tint(verts[face[i]], rgb * shade))
            }
        }
    }
    fn plate(&mut self, p: Vec3, sz: Vec3, rgb: Vec3) {
        let base = self.center + self.basis * p;
        let mut points = [Vec3::ZERO; 8];
        for (i, v) in points.iter_mut().enumerate() {
            let a = (i as f32 + 0.5) * std::f32::consts::FRAC_PI_4;
            *v = Vec3::new(a.cos() * sz.x, a.sin() * sz.y, 0.)
        }
        for i in 0..8 {
            let a = points[i];
            let b = points[(i + 1) % 8];
            let h = Vec3::Z * sz.z;
            for (tri, shade) in [
                ([a - h, b - h, b + h], 0.68 + a.x / sz.x * 0.16),
                ([a - h, b + h, a + h], 0.68 + a.x / sz.x * 0.16),
                ([h, a + h, b + h], 1.),
                ([-h, b - h, a - h], 0.44),
            ] {
                for q in tri {
                    self.v
                        .push(Vertex::tint(base + self.basis * q, rgb * shade))
                }
            }
        }
    }
}
const STEEL: Vec3 = Vec3::new(0.25, 0.29, 0.31);
const DARK: Vec3 = Vec3::new(0.085, 0.105, 0.12);
const ORANGE: Vec3 = Vec3::new(0.96, 0.36, 0.12);
const LIGHT: Vec3 = Vec3::new(0.82, 0.88, 0.77);
fn gun(m: &mut Model, g: usize, scale: f32) {
    let old = m.basis;
    m.basis *= Mat3::from_diagonal(Vec3::splat(scale));
    let accent = match g {
        3 => Vec3::new(0.96, 0.64, 0.14),
        4 => Vec3::new(0.18, 0.66, 0.35),
        5 => ORANGE,
        6 => Vec3::new(0.33, 0.76, 1.),
        _ => STEEL,
    };
    // Tapered receiver, recessed barrel shroud and a contrasting illuminated sight.
    let metal = Vec3::new(0.35, 0.39, 0.40);
    let gun_basis = m.basis;
    let tube = |m: &mut Model, p: Vec3, length: f32, r: f32, col: Vec3| {
        let origin = m.center;
        m.center += gun_basis * p;
        m.basis = gun_basis * Mat3::from_rotation_y(std::f32::consts::FRAC_PI_2);
        m.plate(Vec3::ZERO, Vec3::new(r, r, length * 0.5), col);
        m.center = origin;
        m.basis = gun_basis;
    };
    tube(m, Vec3::new(-2., 0., 0.), 11., 3.5, metal);
    m.block(Vec3::new(-4., 0., -3.2), Vec3::new(4., 3.8, 5.2), DARK);
    m.block(Vec3::new(-4., 0., 2.9), Vec3::new(3., 4.4, 0.8), STEEL);
    m.block(
        Vec3::new(-3.9, 0., 3.38),
        Vec3::new(1.1, 2.4, 0.3),
        Vec3::new(0.39, 0.88, 0.75),
    );
    let radius = match g {
        5 | 4 => 3.3,
        3 => 2.25,
        _ => 1.9,
    };
    tube(m, Vec3::new(7., 0., 0.), 14., radius, DARK);
    for k in 0..4 {
        tube(
            m,
            Vec3::new(k as f32 * 2.2 + 2., 0., 0.),
            1.5,
            radius + 0.4,
            if k == 0 { accent } else { metal },
        )
    }
    if g == 2 {
        for k in 0..5 {
            let a = k as f32 * std::f32::consts::TAU / 5.;
            tube(
                m,
                Vec3::new(12.2, a.sin() * 1.5, a.cos() * 1.5),
                8.,
                0.85,
                metal,
            );
        }
    }
    tube(m, Vec3::new(15., 0., 0.), 1.8, radius + 0.35, STEEL);
    m.block(Vec3::new(-0.5, -3.15, 0.), Vec3::new(5., 0.65, 1.5), accent);
    for k in 0..3 {
        m.block(
            Vec3::new(k as f32 * 1.25 - 2., -3.52, 0.),
            Vec3::new(0.55, 0.2, 0.95),
            LIGHT,
        );
    }
    m.basis = old;
}
pub fn geometry(g: &Game, alpha: f32, eye: Vec3, front: Vec3) -> (Vec<Vertex>, usize) {
    let mut v = Vec::new();
    let t = g.time as f32 * 0.001;
    let bot = &g.actors[1];
    let yaw = Mat3::from_rotation_z(bot.body.yaw);
    let death = if bot.hp <= 0 {
        (1. - (bot.respawn.saturating_sub(g.time) as f32 / 1700.))
            .mul_add(4., 0.)
            .min(1.)
    } else {
        0.
    };
    let mut m = Model {
        v: &mut v,
        center: bot.previous.lerp(bot.body.pos, alpha) - Vec3::Z * death * 16.,
        basis: yaw * Mat3::from_rotation_y(death * 1.45),
    };
    let pain = bot.pain > 0 && g.time - bot.pain < 120;
    let armor = if pain { Vec3::ONE } else { ORANGE };
    for side in [-1., 1.] {
        let swing = (t * 10.).sin() * (bot.body.vel.truncate().length() / 320.).min(1.) * side * 5.;
        m.plate(
            Vec3::new(swing, side * 6., -9.),
            Vec3::new(5., 4., 7.),
            STEEL,
        );
        m.block(
            Vec3::new(swing + 1., side * 6., -19.),
            Vec3::new(12., 7., 8.),
            DARK,
        );
        m.plate(Vec3::new(0., side * 11., 13.), Vec3::new(5., 5., 5.), armor);
        m.block(Vec3::new(3., side * 11., 5.), Vec3::new(6., 6., 12.), STEEL)
    }
    m.plate(Vec3::new(0., 0., 2.), Vec3::new(8., 10., 6.), DARK);
    m.plate(Vec3::new(0., 0., 11.), Vec3::new(10., 12., 7.), armor);
    m.block(Vec3::new(8., 0., 12.), Vec3::new(3., 12., 5.), STEEL);
    m.plate(Vec3::new(0., 0., 24.), Vec3::new(7., 7., 6.), STEEL);
    m.block(
        Vec3::new(6., 0., 25.),
        Vec3::new(2., 10., 3.),
        Vec3::new(0.8, 1., 0.2),
    );
    m.center += yaw * Vec3::new(10., -10., 9.);
    gun(&mut m, bot.gun, 0.7);
    if bot.shot > 0 && g.time - bot.shot < 55 {
        m.block(Vec3::X * 14., Vec3::new(8., 4., 4.), LIGHT)
    }
    for it in &g.items {
        if it.next > g.time {
            continue;
        }
        let mut m = Model {
            v: &mut v,
            center: it.pos + Vec3::Z * ((t * 2. + it.pos.x).sin() * 3. + 4.),
            basis: Mat3::from_rotation_z(t + it.pos.y),
        };
        let c = &it.class;
        if let Some(i) = crate::game::WEAPONS
            .iter()
            .position(|w| Some(*w) == c.strip_prefix("weapon_"))
        {
            gun(&mut m, i, 1.4)
        } else if c.starts_with("item_health") {
            let color = if c.ends_with("mega") {
                Vec3::new(0.25, 0.67, 1.)
            } else {
                Vec3::new(1., 0.57, 0.19)
            };
            m.plate(Vec3::ZERO, Vec3::new(8., 8., 5.), DARK);
            m.block(Vec3::Z * 5., Vec3::new(13., 4., 3.), color);
            m.block(Vec3::Z * 5., Vec3::new(4., 13., 3.), color)
        } else if c.starts_with("item_armor") {
            m.plate(
                Vec3::ZERO,
                if c.ends_with("shard") {
                    Vec3::new(6., 4., 8.)
                } else {
                    Vec3::new(12., 9., 10.)
                },
                if c.ends_with("body") {
                    ORANGE
                } else {
                    Vec3::new(0.44, 0.88, 0.29)
                },
            )
        } else {
            m.block(Vec3::ZERO, Vec3::new(12., 9., 8.), STEEL);
            m.block(Vec3::Z * 4., Vec3::new(5., 9., 2.), ORANGE)
        }
    }
    for r in &g.missiles {
        let mut m = Model {
            v: &mut v,
            center: r.pos,
            basis: Mat3::IDENTITY,
        };
        m.plate(Vec3::ZERO, Vec3::splat(4.), ORANGE);
        m.block(-r.vel.normalize_or_zero() * 7., Vec3::splat(4.), LIGHT)
    }
    for e in &g.effects {
        if e.a == e.b {
            let mut m = Model {
                v: &mut v,
                center: e.a,
                basis: Mat3::IDENTITY,
            };
            m.plate(
                Vec3::ZERO,
                Vec3::splat(4. + (180. - (e.end - g.time) as f32) * 0.07),
                ORANGE,
            )
        } else {
            let d = (e.b - e.a).normalize_or_zero();
            let side = d.cross(Vec3::Z).normalize_or_zero() * if e.gun == 6 { 1.4 } else { 0.45 };
            let p = e.a + 8. * d;
            let col = if e.gun == 6 {
                Vec3::new(0.32, 0.76, 1.)
            } else {
                Vec3::new(1., 0.77, 0.34)
            };
            for q in [
                p - side,
                p + side,
                e.b + side,
                p - side,
                e.b + side,
                e.b - side,
            ] {
                v.push(Vertex::tint(q, col))
            }
        }
    }
    let world = v.len();
    let a = &g.actors[0];
    if a.hp > 0 {
        let right = direction(a.body.yaw, 0.).cross(Vec3::Z);
        let up = right.cross(front);
        let recoil = if a.shot > 0 {
            (1. - (g.time - a.shot) as f32 / 120.).max(0.)
        } else {
            0.
        };
        let bob = (t * 9.).sin() * (a.body.vel.truncate().length() / 320.).min(1.) * 0.25;
        let mut m = Model {
            v: &mut v,
            center: eye + front * (11. - recoil) + right * 4.6 - up * (4.8 + bob),
            basis: Mat3::from_cols(front, -right, up),
        };
        gun(&mut m, a.gun, 0.48);
        if recoil > 0.6 {
            m.block(
                Vec3::X * 11.,
                Vec3::splat(1.8),
                Vec4::new(1., 0.73, 0.21, 1.).truncate(),
            )
        }
    }
    (v, world)
}
