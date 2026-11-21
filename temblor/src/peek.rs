// SPDX-License-Identifier: GPL-2.0-or-later
//! World-space triangles for the inspection window. Edges shared within a BSP
//! face are triangulation seams. Keep its perimeter so doors and stairs read.
use crate::bsp::Map;
use std::collections::HashMap;

pub(crate) fn mesh(map: &Map, models: &[u32]) -> Vec<f32> {
    let mut out = Vec::new();
    for (f, model_id) in map.faces.iter().zip(models) {
        let material = &map.materials[f.material];
        // Sky and invisible volumes (triggers, clips) obscure playable space.
        if material.flags & (4 | 128) != 0 || material.contents & (1 | 8 | 16 | 32) == 0 {
            continue;
        }
        let edge = |a: u32, b: u32| (a.min(b), a.max(b));
        let mut edges = HashMap::new();
        for tri in f.indices.chunks_exact(3) {
            for i in 0..3 {
                *edges.entry(edge(tri[i], tri[(i + 1) % 3])).or_insert(0u32) += 1;
            }
        }
        for tri in f.indices.chunks_exact(3) {
            let [a, b, c] = [0, 1, 2].map(|i| f.vertices[tri[i] as usize]);
            let mut normal = (b.pos - a.pos).cross(c.pos - a.pos).normalize_or_zero();
            if normal.dot(a.normal + b.normal + c.normal) < 0. {
                normal = -normal
            }
            if normal.length_squared() < 0.5 || normal.z < -0.65 {
                continue;
            }
            let mut mask = 0;
            for i in 0..3 {
                if edges[&edge(tri[i], tri[(i + 1) % 3])] == 1 {
                    mask |= 1 << i;
                }
            }
            for v in [a, b, c] {
                out.extend(v.pos.to_array());
            }
            out.extend(normal.to_array());
            out.extend([mask as f32, *model_id as f32]);
        }
    }
    out
}
