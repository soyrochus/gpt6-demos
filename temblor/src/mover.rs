// SPDX-License-Identifier: GPL-2.0-or-later
use crate::bsp::{Brush, Entity, Model};
use glam::Vec3;
pub struct Mover {
    pub model: usize,
    pub start: Vec3,
    pub travel: Vec3,
    pub frac: f32,
    pub wait_until: u32,
    speed: f32,
    wait: u32,
    min: Vec3,
    max: Vec3,
    pub brushes: Vec<Brush>,
}
impl Mover {
    pub fn new(index: usize, model: &Model, e: &Entity, brushes: Vec<Brush>) -> Self {
        let num = |k: &str, d: f32| {
            e.get(k)
                .and_then(|s| s.parse::<f32>().ok())
                .filter(|n| n.is_finite())
                .unwrap_or(d)
        };
        let platform = e["classname"] == "func_plat";
        let angle = num("angle", 0.);
        let dir = if platform || angle == -1. {
            Vec3::Z
        } else if angle == -2. {
            -Vec3::Z
        } else {
            Vec3::new(angle.to_radians().cos(), angle.to_radians().sin(), 0.)
        };
        let dist = num(
            "height",
            dir.abs().dot(model.max - model.min) - num("lip", 8.),
        )
        .max(1.);
        let mut travel = dir * dist;
        let mut start = if platform { -travel } else { Vec3::ZERO };
        if e.get("spawnflags")
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0)
            & 1
            != 0
            && !platform
        {
            start = travel;
            travel = -travel
        }
        Self {
            model: index,
            start,
            travel,
            frac: 0.,
            wait_until: 0,
            speed: num("speed", if platform { 200. } else { 400. }).max(1.),
            wait: (num("wait", 2.).max(0.) * 1000.) as u32,
            min: model.min,
            max: model.max,
            brushes,
        }
    }
    pub fn offset(&self) -> Vec3 {
        self.start + self.travel * self.frac
    }
    pub fn advance(&mut self, time: u32, actors: [Option<Vec3>; 2]) -> Vec3 {
        let old = self.offset();
        let near = actors.into_iter().flatten().any(|p| {
            let d = (p - (self.max + old))
                .max(self.min + old - p)
                .max(Vec3::ZERO);
            d.truncate().length() < 64. && d.z < 65.
        });
        if near {
            self.wait_until = time + self.wait
        }
        let delta = self.speed * 0.008 / self.travel.length();
        self.frac = (self.frac
            + if near || self.wait_until > time {
                delta
            } else {
                -delta
            })
        .clamp(0., 1.);
        self.offset() - old
    }
    pub fn ride(&self, p: Vec3, old: Vec3) -> bool {
        let q = p - old;
        p.is_finite()
            && (q.z - 24. - self.max.z).abs() < 2.
            && q.x >= self.min.x - 14.
            && q.x <= self.max.x + 14.
            && q.y >= self.min.y - 14.
            && q.y <= self.max.y + 14.
    }
    pub fn append(&self, out: &mut Vec<Brush>) {
        let d = self.offset();
        for k in &self.brushes {
            let mut b = k.clone();
            b.min += d;
            b.max += d;
            for p in &mut b.planes {
                p.d += p.n.dot(d)
            }
            out.push(b)
        }
    }
}
