// SPDX-License-Identifier: GPL-2.0-or-later
//! IBSP 46 structures follow id Software code/qcommon/qfiles.h.
use crate::content::{path, Result};
use glam::{Vec2, Vec3, Vec4};
use std::{collections::BTreeMap, ops::Range};
pub fn int(b: &[u8], o: usize) -> i32 {
    i32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
fn float(b: &[u8], o: usize) -> Result<f32> {
    let x = f32::from_bits(int(b, o) as u32);
    if !x.is_finite() || x.abs() > 1e7 {
        Err("Invalid BSP floating point value".into())
    } else {
        Ok(x)
    }
}
fn vec3(b: &[u8], o: usize) -> Result<Vec3> {
    Ok(Vec3::new(float(b, o)?, float(b, o + 4)?, float(b, o + 8)?))
}
fn span(i: i32, n: i32, max: usize) -> Result<Range<usize>> {
    if i < 0 || n < 0 || i as u64 + n as u64 > max as u64 {
        return Err("BSP range outside lump".into());
    }
    Ok(i as usize..i as usize + n as usize)
}
fn index(i: i32, max: usize) -> Result<usize> {
    Ok(span(i, 1, max)?.start)
}
#[derive(Clone, Copy)]
pub struct Plane {
    pub n: Vec3,
    pub d: f32,
}
#[derive(Clone)]
pub struct Brush {
    pub planes: Vec<Plane>,
    pub contents: i32,
    pub min: Vec3,
    pub max: Vec3,
}
pub struct Material {
    pub name: String,
    pub flags: i32,
    pub contents: i32,
}
#[derive(Clone, Copy, Default)]
pub struct Point {
    pub pos: Vec3,
    pub uv: Vec2,
    pub lm: Vec2,
    pub color: Vec4,
    pub normal: Vec3,
}
#[derive(Clone)]
pub struct Face {
    pub material: usize,
    pub light: i32,
    pub vertices: Vec<Point>,
    pub indices: Vec<u32>,
    pub patch: bool,
}
#[derive(Clone)]
pub struct Model {
    pub min: Vec3,
    pub max: Vec3,
    pub brushes: Range<usize>,
    pub faces: Range<usize>,
}
pub type Entity = BTreeMap<String, String>;
pub fn origin(e: &Entity) -> Vec3 {
    let mut a = e
        .get("origin")
        .into_iter()
        .flat_map(|s| s.split_whitespace())
        .filter_map(|v| v.parse::<f32>().ok());
    Vec3::new(
        a.next().unwrap_or(0.),
        a.next().unwrap_or(0.),
        a.next().unwrap_or(0.),
    )
}
pub struct Map {
    pub entities: Vec<Entity>,
    pub materials: Vec<Material>,
    pub brushes: Vec<Brush>,
    pub models: Vec<Model>,
    pub faces: Vec<Face>,
    pub lights: Vec<u8>,
}
fn entities(data: &[u8]) -> Result<Vec<Entity>> {
    let text = String::from_utf8_lossy(data);
    let mut result = Vec::new();
    let mut chars = text.trim_end_matches('\0').chars().peekable();
    while let Some(c) = chars.next() {
        if c.is_whitespace() {
            continue;
        }
        if c != '{' {
            return Err("Bad entity opening".into());
        }
        let mut fields = BTreeMap::new();
        let mut key = None;
        loop {
            let c = chars.next().ok_or("Truncated entity")?;
            if c.is_whitespace() {
                continue;
            }
            if c == '}' && key.is_none() {
                break;
            }
            if c != '"' {
                return Err("Bad entity field".into());
            }
            let mut s = String::new();
            loop {
                match chars.next() {
                    Some('"') => break,
                    Some(c) => s.push(c),
                    None => return Err("Unterminated entity string".into()),
                }
            }
            if let Some(k) = key.take() {
                fields.insert(k, s);
            } else {
                key = Some(s)
            }
        }
        if !fields.contains_key("classname") {
            return Err("Entity missing classname".into());
        }
        if let Some(s) = fields.get("origin") {
            let a: Vec<_> = s
                .split_whitespace()
                .filter_map(|v| v.parse::<f32>().ok())
                .collect();
            if a.len() != 3 || a.iter().any(|v| !v.is_finite() || v.abs() > 131072.) {
                return Err("Invalid entity origin".into());
            }
        }
        result.push(fields);
        if result.len() > 8192 {
            return Err("Too many entities".into());
        }
    }
    Ok(result)
}
impl Map {
    pub fn parse(data: &[u8]) -> Result<Self> {
        if data.len() < 144 || data.get(..4) != Some(b"IBSP") {
            return Err("Invalid IBSP header".into());
        }
        if int(data, 4) != 46 {
            return Err(format!(
                "Unsupported BSP version {} (expected 46)",
                int(data, 4)
            ));
        }
        let sizes = [
            1, 72, 16, 36, 48, 4, 4, 40, 12, 8, 44, 4, 72, 104, 49152, 8, 1,
        ];
        let mut l = [&[][..]; 17];
        let mut ranges = Vec::new();
        for i in 0..17 {
            let r = span(int(data, 8 + i * 8), int(data, 12 + i * 8), data.len())?;
            if !r.is_empty() {
                if r.start < 144
                    || ranges
                        .iter()
                        .any(|q: &Range<usize>| q.start < r.end && r.start < q.end)
                {
                    return Err("Overlapping BSP lumps".into());
                }
                ranges.push(r.clone())
            }
            l[i] = &data[r];
            if l[i].len() % sizes[i] != 0 {
                return Err(format!("Partial record in BSP lump {i}"));
            }
        }
        let count = |i: usize| l[i].len() / sizes[i];
        if count(0) > 1 << 20
            || count(1) > 2048
            || count(2) > 262144
            || count(8) > 65536
            || count(10) > 550000
            || count(13) > 131072
            || count(14) > 250
        {
            return Err("BSP resource limit exceeded".into());
        }
        let mut materials = Vec::new();
        for b in l[1].chunks_exact(72) {
            let end = b[..64]
                .iter()
                .position(|&x| x == 0)
                .ok_or("Unterminated shader name")?;
            materials.push(Material {
                name: path(std::str::from_utf8(&b[..end]).map_err(|_| "Invalid shader name")?)?,
                flags: int(b, 64),
                contents: int(b, 68),
            })
        }
        let planes = l[2]
            .chunks_exact(16)
            .map(|b| {
                Ok(Plane {
                    n: vec3(b, 0)?,
                    d: float(b, 12)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        for b in l[3].chunks_exact(36) {
            index(int(b, 0), planes.len())?;
            for j in [4, 8] {
                let c = int(b, j);
                if c >= 0 {
                    index(c, count(3))?;
                } else {
                    index(!c, count(4))?;
                }
            }
        }
        for b in l[4].chunks_exact(48) {
            span(int(b, 32), int(b, 36), count(5))?;
            span(int(b, 40), int(b, 44), count(6))?;
        }
        for (which, n) in [(5, 13), (6, 8)] {
            for b in l[which].chunks_exact(4) {
                index(int(b, 0), count(n))?;
            }
        }
        if !l[16].is_empty()
            && (l[16].len() < 8
                || int(l[16], 0) < 0
                || int(l[16], 4) < 0
                || int(l[16], 0) as u64 * int(l[16], 4) as u64 + 8 > l[16].len() as u64)
        {
            return Err("Bad visibility table".into());
        }
        let mut models = Vec::new();
        for b in l[7].chunks_exact(40) {
            models.push(Model {
                min: vec3(b, 0)?,
                max: vec3(b, 12)?,
                faces: span(int(b, 24), int(b, 28), count(13))?,
                brushes: span(int(b, 32), int(b, 36), count(8))?,
            })
        }
        if models.is_empty() {
            return Err("No world model".into());
        }
        let sides = l[9]
            .chunks_exact(8)
            .map(|b| {
                index(int(b, 4), materials.len())?;
                Ok(planes[index(int(b, 0), planes.len())?])
            })
            .collect::<Result<Vec<_>>>()?;
        let mut brushes = Vec::new();
        let mut side_budget = 0;
        for b in l[8].chunks_exact(12) {
            let r = span(int(b, 0), int(b, 4), sides.len())?;
            side_budget += r.len();
            if side_budget > 500000 {
                return Err("Too many brush sides".into());
            }
            let mut min = Vec3::splat(-131072.);
            let mut max = -min;
            for p in &sides[r.clone()] {
                for a in 0..3 {
                    if p.n[a] == 1. {
                        max[a] = max[a].min(p.d)
                    }
                    if p.n[a] == -1. {
                        min[a] = min[a].max(-p.d)
                    }
                }
            }
            brushes.push(Brush {
                planes: sides[r].to_vec(),
                min,
                max,
                contents: materials[index(int(b, 8), materials.len())?].contents,
            })
        }
        let verts = l[10]
            .chunks_exact(44)
            .map(|b| {
                Ok(Point {
                    pos: vec3(b, 0)?,
                    uv: Vec2::new(float(b, 12)?, float(b, 16)?),
                    lm: Vec2::new(float(b, 20)?, float(b, 24)?),
                    normal: vec3(b, 28)?,
                    color: Vec4::from_array(
                        b[40..44]
                            .try_into()
                            .map(|a: [u8; 4]| a.map(|v| v as f32 / 255.))
                            .unwrap(),
                    ),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let mut faces = Vec::new();
        let mut budget = 0;
        for b in l[13].chunks_exact(104) {
            let material = index(int(b, 0), materials.len())?;
            let light = int(b, 28);
            if light >= 0 {
                index(light, count(14))?;
            }
            let r = span(int(b, 12), int(b, 16), verts.len())?;
            let ir = span(int(b, 20), int(b, 24), count(11))?;
            budget += r.len() + ir.len();
            if budget > 4000000 {
                return Err("Surface resource limit".into());
            }
            let mut f = Face {
                material,
                light,
                vertices: vec![],
                indices: vec![],
                patch: false,
            };
            match int(b, 8) {
                1 | 3 => {
                    f.vertices = verts[r.clone()].to_vec();
                    if ir.len() % 3 != 0 {
                        return Err("Incomplete triangle".into());
                    }
                    for i in ir {
                        f.indices.push(index(int(l[11], i * 4), r.len())? as u32)
                    }
                }
                2 => {
                    let (w, h) = (int(b, 96), int(b, 100));
                    if !(3..=31).contains(&w)
                        || !(3..=31).contains(&h)
                        || w % 2 == 0
                        || h % 2 == 0
                        || (w * h) as usize != r.len()
                    {
                        return Err("Invalid patch dimensions".into());
                    }
                    budget += ((w * h) as usize) * 40;
                    if budget > 4000000 {
                        return Err("Patch resource limit".into());
                    }
                    f.patch = true;
                    tessellate(&mut f, &verts[r], w as usize, h as usize)
                }
                4 => {}
                _ => return Err("Unsupported BSP surface type".into()),
            }
            faces.push(f)
        }
        let entities = entities(l[0])?;
        for e in &entities {
            if let Some(s) = e.get("model").and_then(|s| s.strip_prefix('*')) {
                index(s.parse().map_err(|_| "Invalid inline model")?, models.len())?;
            }
        }
        Ok(Self {
            entities,
            materials,
            brushes,
            models,
            faces,
            lights: l[14].to_vec(),
        })
    }
}
fn tessellate(f: &mut Face, v: &[Point], w: usize, h: usize) {
    const N: usize = 4;
    for y in (0..h - 2).step_by(2) {
        for x in (0..w - 2).step_by(2) {
            let base = f.vertices.len() as u32;
            for j in 0..=N {
                for i in 0..=N {
                    let basis = |a: usize| {
                        let t = a as f32 / N as f32;
                        [(1. - t).powi(2), 2. * t * (1. - t), t * t]
                    };
                    let mut q = Point::default();
                    for (dy, by) in basis(j).iter().enumerate() {
                        for (dx, bx) in basis(i).iter().enumerate() {
                            let p = &v[(y + dy) * w + x + dx];
                            let a = by * bx;
                            q.pos += p.pos * a;
                            q.uv += p.uv * a;
                            q.lm += p.lm * a;
                            q.color += p.color * a;
                            q.normal += p.normal * a;
                        }
                    }
                    f.vertices.push(q)
                }
            }
            for j in 0..N {
                for i in 0..N {
                    let a = base + (j * (N + 1) + i) as u32;
                    let b = a + (N + 1) as u32;
                    f.indices.extend([a, b, b + 1, a, b + 1, a + 1]);
                }
            }
        }
    }
}
