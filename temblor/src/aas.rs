// SPDX-License-Identifier: GPL-2.0-or-later
//! EAAS v4/v5 area reachability as defined in id's botlib/aasfile.h.
use crate::{bsp::int, content::Result};
use glam::Vec3;
use std::collections::BinaryHeap;
struct Area {
    min: Vec3,
    max: Vec3,
    links: std::ops::Range<usize>,
    safe: bool,
}
struct Link {
    to: usize,
    start: Vec3,
    end: Vec3,
    cost: i32,
    mode: i32,
}
pub struct Areas {
    areas: Vec<Area>,
    links: Vec<Link>,
    nodes: Vec<[i32; 3]>,
    planes: Vec<(Vec3, f32)>,
}
fn pos(b: &[u8], o: usize) -> Result<Vec3> {
    let p = Vec3::from_array([o, o + 4, o + 8].map(|i| f32::from_bits(int(b, i) as u32)));
    if !p.is_finite() || p.abs().max_element() > 131072. {
        return Err("Invalid AAS coordinate".into());
    }
    Ok(p)
}
impl Areas {
    pub fn parse(b: &[u8]) -> Result<Self> {
        if b.len() < 124 || &b[..4] != b"EAAS" || !matches!(int(b, 4), 4 | 5) {
            return Err("Unsupported AAS header".into());
        }
        let mut h = b[..124].to_vec();
        if int(b, 4) == 5 {
            for (i, v) in h[8..].iter_mut().enumerate() {
                *v ^= (i as u8).wrapping_mul(119)
            }
        }
        let lump = |n, size| -> Result<&[u8]> {
            let o = int(&h, 12 + n * 8) as usize;
            let len = int(&h, 16 + n * 8) as usize;
            if len % size != 0 || len / size > 200000 {
                return Err("Invalid AAS record count".into());
            }
            b.get(o..o.checked_add(len).ok_or("AAS overflow")?)
                .ok_or_else(|| "Invalid AAS lump".into())
        };
        let rec = lump(7usize, 48usize)?;
        let cfg = lump(8, 28)?;
        let edges = lump(9, 44)?;
        if rec.len() / 48 != cfg.len() / 28 {
            return Err("AAS settings count mismatch".into());
        }
        let mut links = vec![];
        for l in edges.chunks_exact(44) {
            let to = int(l, 0) as usize;
            if to >= rec.len() / 48 {
                return Err("Bad AAS destination".into());
            }
            links.push(Link {
                to,
                start: pos(l, 12)?,
                end: pos(l, 24)?,
                mode: int(l, 36) & 0xffffff,
                cost: u16::from_le_bytes([l[40], l[41]]) as i32,
            })
        }
        let mut areas = vec![];
        for (a, s) in rec.chunks_exact(48).zip(cfg.chunks_exact(28)) {
            let first = int(s, 24) as usize;
            let n = int(s, 20) as usize;
            if first > links.len() || n > links.len() - first {
                return Err("Bad AAS links".into());
            }
            areas.push(Area {
                min: pos(a, 12)?,
                max: pos(a, 24)?,
                links: first..first + n,
                safe: int(s, 0) & 6 == 0,
            })
        }
        let planes = lump(2, 20)?
            .chunks_exact(20)
            .map(|b| {
                let d = f32::from_bits(int(b, 12) as u32);
                if !d.is_finite() {
                    return Err("Invalid AAS plane".into());
                }
                Ok((pos(b, 0)?, d))
            })
            .collect::<Result<Vec<_>>>()?;
        let nodes = lump(10, 12)?
            .chunks_exact(12)
            .map(|b| [int(b, 0), int(b, 4), int(b, 8)])
            .collect();
        Ok(Self {
            areas,
            links,
            nodes,
            planes,
        })
    }
    fn area(&self, p: Vec3) -> Option<usize> {
        let mut i = 1i32;
        for _ in 0..128 {
            if i <= 0 {
                let id = i.unsigned_abs() as usize;
                if id > 0
                    && self
                        .areas
                        .get(id)
                        .is_some_and(|a| a.safe && !a.links.is_empty())
                {
                    return Some(id);
                }
                break;
            }
            let node = self.nodes.get(i as usize)?;
            let (n, d) = self.planes.get(node[0] as usize)?;
            i = node[if p.dot(*n) > *d { 1 } else { 2 }];
        }
        let mut d = f32::MAX;
        let mut best = None;
        for (i, a) in self.areas.iter().enumerate().skip(1) {
            if !a.safe || a.links.is_empty() {
                continue;
            }
            let delta = (p - a.max).max(a.min - p).max(Vec3::ZERO);
            let dist = delta.length_squared();
            if dist < d {
                d = dist;
                best = Some(i);
                if d == 0. {
                    break;
                }
            }
        }
        best
    }
    pub fn path(&self, p: Vec3, q: Vec3) -> Option<Vec<Vec3>> {
        let s = self.area(p)?;
        let g = self.area(q)?;
        let mut cost = vec![i32::MAX; self.areas.len()];
        let mut via = vec![None; cost.len()];
        let mut open = BinaryHeap::new();
        cost[s] = 0;
        open.push((0, s));
        while let Some((c, i)) = open.pop() {
            if i == g {
                break;
            }
            if -c != cost[i] {
                continue;
            }
            for j in self.areas[i].links.clone() {
                let link = &self.links[j];
                if !matches!(link.mode,2..=5|7..=11|18) || !self.areas[link.to].safe {
                    continue;
                }
                let prev = via[i]
                    .map(|(_, j): (_, usize)| self.links[j].end)
                    .unwrap_or(p);
                let k = cost[i] + link.cost.max(1) + (prev.distance(link.start) * 0.32) as i32;
                if k < cost[link.to] {
                    cost[link.to] = k;
                    via[link.to] = Some((i, j));
                    open.push((-k, link.to))
                }
            }
        }
        let mut route = vec![q];
        let mut i = g;
        while i != s {
            let (parent, j) = via[i]?;
            let l = &self.links[j];
            route.push(l.end);
            route.push(l.start);
            i = parent
        }
        route.reverse();
        Some(route)
    }
}
