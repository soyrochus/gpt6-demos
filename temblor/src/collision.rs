// SPDX-License-Identifier: GPL-2.0-or-later
//! Convex brush clipping follows cm_trace.c. Quake origins are 24 units above feet.
use crate::bsp::{Brush, Map, Plane};
use glam::Vec3;
pub const SOLID: i32 = 1;
pub const PLAYER: i32 = 1 | 0x10000;
pub const SHOT: i32 = 1 | 0x02000000;
pub const HULL: Vec3 = Vec3::new(15., 15., 28.);
#[derive(Clone, Copy, Debug)]
pub struct Hit {
    pub fraction: f32,
    pub normal: Vec3,
    pub inside: bool,
}
impl Default for Hit {
    fn default() -> Self {
        Self {
            fraction: 1.,
            normal: Vec3::ZERO,
            inside: false,
        }
    }
}
pub fn clip(b: &Brush, p: Vec3, q: Vec3, h: Vec3, hit: &mut Hit) {
    let mut enter = -1.;
    let mut leave = 1f32;
    let mut normal = Vec3::ZERO;
    let mut outside = false;
    let mut end_out = false;
    for plane in &b.planes {
        let d = plane.d + h.dot(plane.n.abs());
        let a = p.dot(plane.n) - d;
        let z = q.dot(plane.n) - d;
        outside |= a > 0.;
        end_out |= z > 0.;
        if a > 0. && z >= a {
            return;
        }
        if a <= 0. && z <= 0. {
            continue;
        }
        if a > z {
            let f = (a - 0.125) / (a - z);
            if f > enter {
                enter = f;
                normal = plane.n
            }
        } else {
            leave = leave.min((a + 0.125) / (a - z))
        }
    }
    if !outside {
        if !end_out {
            hit.inside = true;
            hit.fraction = 0.;
        }
        return;
    }
    if enter < leave && enter > -1. && enter < hit.fraction {
        hit.fraction = enter.max(0.);
        hit.normal = normal
    }
}
pub fn box_brush(min: Vec3, max: Vec3, contents: i32) -> Brush {
    let mut planes = Vec::new();
    for a in [Vec3::X, Vec3::Y, Vec3::Z] {
        planes.push(Plane {
            n: a,
            d: max.dot(a),
        });
        planes.push(Plane {
            n: -a,
            d: -min.dot(a),
        })
    }
    Brush {
        planes,
        min,
        max,
        contents,
    }
}
#[derive(Default)]
struct Node {
    min: Vec3,
    max: Vec3,
    start: usize,
    end: usize,
    children: Option<(usize, usize)>,
}
pub struct World {
    pub brushes: Vec<Brush>,
    nodes: Vec<Node>,
    ids: Vec<usize>,
}
impl World {
    pub fn from_map(m: &Map) -> Self {
        let mut brushes = m.brushes[m.models[0].brushes.clone()].to_vec();
        for f in &m.faces[m.models[0].faces.clone()] {
            let contents = m.materials[f.material].contents;
            if !f.patch || contents & PLAYER == 0 {
                continue;
            }
            for t in f.indices.chunks_exact(3) {
                let [a, b, c] = [t[0], t[1], t[2]].map(|i| f.vertices[i as usize].pos);
                let n = (b - a).cross(c - a).normalize_or_zero();
                if n == Vec3::ZERO {
                    continue;
                }
                let mut planes = vec![
                    Plane {
                        n,
                        d: n.dot(a) + 0.1,
                    },
                    Plane {
                        n: -n,
                        d: -n.dot(a) + 0.1,
                    },
                ];
                for (p, q) in [(a, b), (b, c), (c, a)] {
                    let side = (q - p).cross(n).normalize_or_zero();
                    planes.push(Plane {
                        n: side,
                        d: side.dot(p),
                    })
                }
                let min = a.min(b).min(c) - Vec3::splat(0.1);
                let max = a.max(b).max(c) + Vec3::splat(0.1);
                planes.extend(box_brush(min, max, contents).planes);
                brushes.push(Brush {
                    planes,
                    min,
                    max,
                    contents,
                })
            }
        }
        Self::new(brushes)
    }
    pub fn new(brushes: Vec<Brush>) -> Self {
        let n = brushes.len();
        let mut w = Self {
            brushes,
            nodes: Vec::new(),
            ids: (0..n).collect(),
        };
        w.build(0, n);
        w
    }
    fn build(&mut self, start: usize, end: usize) -> usize {
        let i = self.nodes.len();
        let mut min = Vec3::splat(f32::INFINITY);
        let mut max = -min;
        for &id in &self.ids[start..end] {
            min = min.min(self.brushes[id].min);
            max = max.max(self.brushes[id].max)
        }
        self.nodes.push(Node {
            min,
            max,
            start,
            end,
            children: None,
        });
        if end - start > 8 {
            let a = (max - min).max_position();
            self.ids[start..end].sort_unstable_by(|&x, &y| {
                let p = &self.brushes[x];
                let q = &self.brushes[y];
                (p.min[a] + p.max[a]).total_cmp(&(q.min[a] + q.max[a]))
            });
            let mid = (start + end) / 2;
            let l = self.build(start, mid);
            let r = self.build(mid, end);
            self.nodes[i].children = Some((l, r))
        }
        i
    }
    pub fn trace(&self, p: Vec3, q: Vec3, h: Vec3, mask: i32) -> Hit {
        let mut out = Hit::default();
        let min = p.min(q) - h;
        let max = p.max(q) + h;
        let mut stack = [0usize; 64];
        let mut n = 1;
        while n > 0 {
            n -= 1;
            let node = &self.nodes[stack[n]];
            if min.cmpgt(node.max).any() || max.cmplt(node.min).any() {
                continue;
            }
            if let Some((a, b)) = node.children {
                stack[n] = a;
                stack[n + 1] = b;
                n += 2;
                continue;
            }
            for &id in &self.ids[node.start..node.end] {
                let b = &self.brushes[id];
                if b.contents & mask != 0 && !min.cmpgt(b.max).any() && !max.cmplt(b.min).any() {
                    clip(b, p, q, h, &mut out)
                }
            }
        }
        out
    }
    pub fn floor(&self, p: Vec3, depth: f32) -> Option<Vec3> {
        let start = p + Vec3::Z * 4.;
        let end = start - Vec3::Z * depth;
        let h = self.trace(start, end, HULL, PLAYER);
        (!h.inside && h.fraction < 1. && h.normal.z > 0.65)
            .then(|| p - Vec3::Z * depth * h.fraction)
    }
    pub fn visible(&self, a: Vec3, b: Vec3) -> bool {
        self.trace(a, b, Vec3::ZERO, SHOT).fraction == 1.
    }
}
pub struct Space<'a> {
    pub world: &'a World,
    pub movers: &'a [Brush],
    pub other: Option<Brush>,
}
impl Space<'_> {
    pub fn trace(&self, p: Vec3, q: Vec3, h: Vec3) -> Hit {
        let mut hit = self.world.trace(p, q, h, PLAYER);
        for b in self.movers.iter().chain(self.other.iter()) {
            if b.contents & PLAYER != 0 {
                clip(b, p, q, h, &mut hit)
            }
        }
        hit
    }
}
