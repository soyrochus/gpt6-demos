// SPDX-License-Identifier: GPL-2.0-or-later
//! Reconstruct multi-storey walkable cells from BSP floor triangles.
use crate::{
    bsp::Map,
    collision::{World, PLAYER},
};
use glam::{Vec2, Vec3};
use std::collections::{BTreeMap, BinaryHeap};
const CELL: f32 = 48.;
pub struct Nav {
    pub points: Vec<Vec3>,
    edges: Vec<Vec<usize>>,
}
impl Nav {
    pub fn generate(map: &Map, world: &World) -> Result<Self, String> {
        let mut grid: BTreeMap<(i32, i32), Vec<usize>> = BTreeMap::new();
        let mut points: Vec<Vec3> = Vec::new();
        let mut budget = 0;
        for f in &map.faces[map.models[0].faces.clone()] {
            if map.materials[f.material].contents & PLAYER == 0 {
                continue;
            }
            for t in f.indices.chunks_exact(3) {
                let [a, b, c] = [t[0], t[1], t[2]].map(|i| f.vertices[i as usize].pos);
                let n = (b - a).cross(c - a);
                if n.normalize_or_zero().z.abs() < 0.7 {
                    continue;
                }
                let lo = (a.min(b).min(c).truncate() / CELL).ceil().as_ivec2();
                let hi = (a.max(b).max(c).truncate() / CELL).floor().as_ivec2();
                if lo.x > hi.x || lo.y > hi.y {
                    continue;
                }
                budget += (hi.x - lo.x + 1) as u64 * (hi.y - lo.y + 1) as u64;
                if budget > 2000000 {
                    return Err("Navigation surface budget exceeded".into());
                }
                for y in lo.y..=hi.y {
                    for x in lo.x..=hi.x {
                        let xy = Vec2::new(x as f32, y as f32) * CELL;
                        let ab = b.truncate() - a.truncate();
                        let ac = c.truncate() - a.truncate();
                        let ap = xy - a.truncate();
                        let u = ap.perp_dot(ac) / n.z;
                        let v = ab.perp_dot(ap) / n.z;
                        if u < -0.001 || v < -0.001 || u + v > 1.001 {
                            continue;
                        }
                        let h = a.z + u * (b.z - a.z) + v * (c.z - a.z);
                        let ids = grid.entry((x, y)).or_default();
                        if ids.iter().any(|&i| (points[i].z - h - 24.).abs() < 12.) {
                            continue;
                        }
                        let Some(p) = world.floor(xy.extend(h + 29.), 12.) else {
                            continue;
                        };
                        ids.push(points.len());
                        points.push(p);
                        if points.len() > 32000 {
                            return Err("Navigation node limit exceeded".into());
                        }
                    }
                }
            }
        }
        let mut edges = vec![vec![]; points.len()];
        for (&(x, y), ids) in &grid {
            for &i in ids {
                let a = points[i];
                for dx in -1..=1 {
                    for dy in -1..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        for &j in grid.get(&(x + dx, y + dy)).into_iter().flatten() {
                            let b = points[j];
                            let dz = b.z - a.z;
                            if !(-120. ..=48.).contains(&dz) {
                                continue;
                            }
                            let z = a.z.max(b.z) + 15.;
                            let p = Vec3::new(a.x, a.y, z);
                            let q = Vec3::new(b.x, b.y, z);
                            if world.trace(p, q, Vec3::new(14., 14., 22.), PLAYER).fraction >= 1. {
                                edges[i].push(j)
                            }
                        }
                    }
                }
            }
        }
        Ok(Self { points, edges })
    }
    fn closest(&self, p: Vec3, w: &World) -> Option<usize> {
        let mut best = f32::MAX;
        let mut id = None;
        for (i, &q) in self.points.iter().enumerate() {
            let d = (p - q) * Vec3::new(1., 1., 1.8);
            let d = d.length_squared();
            if d < best && !self.edges[i].is_empty() && w.visible(p, q + Vec3::Z * 4.) {
                best = d;
                id = Some(i)
            }
        }
        id
    }
    pub fn path(&self, a: Vec3, b: Vec3, w: &World) -> Vec<Vec3> {
        let (Some(s), Some(g)) = (self.closest(a, w), self.closest(b, w)) else {
            return vec![];
        };
        let mut open = BinaryHeap::new();
        let mut parent = vec![usize::MAX; self.points.len()];
        let mut cost = vec![i32::MAX; self.points.len()];
        cost[s] = 0;
        open.push((0, s));
        while let Some((_, i)) = open.pop() {
            if i == g {
                break;
            }
            for &j in &self.edges[i] {
                let next = cost[i] + self.points[i].distance(self.points[j]) as i32;
                if next < cost[j] {
                    cost[j] = next;
                    parent[j] = i;
                    open.push((-(next + self.points[j].distance(b) as i32), j));
                }
            }
        }
        if g != s && parent[g] == usize::MAX {
            return vec![];
        }
        let mut result = vec![b];
        let mut i = g;
        while i != s {
            result.push(self.points[i]);
            i = parent[i]
        }
        result.reverse();
        result
    }
}
