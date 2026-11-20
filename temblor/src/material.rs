// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{
    bsp::Map,
    content::{Result, Vfs},
};
use bytemuck::{Pod, Zeroable};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
};
pub const TILE: u32 = 256;
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable, Debug)]
pub struct Stage {
    // layer (-1 lightmap), blend operation, texgen, alpha test
    pub mode: [f32; 4],
    pub uv: [f32; 4],
    pub rgb: [f32; 4],
    pub wave: [f32; 4],
    pub animation: [f32; 4],
}
impl Default for Stage {
    fn default() -> Self {
        Self {
            mode: [0.; 4],
            uv: [1., 1., 0., 0.],
            rgb: [1., 1., 1., 0.],
            wave: [1., 0., 0., 0.],
            animation: [0.; 4],
        }
    }
}
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable, Default)]
pub struct GpuMaterial {
    pub meta: [u32; 4],
    pub stages: [Stage; 8],
}
pub struct Palette {
    pub layers: Vec<Vec<u8>>,
    pub materials: Vec<GpuMaterial>,
    pub warnings: Vec<String>,
    pub origins: BTreeMap<String, String>,
}
#[derive(Default)]
struct Script {
    outer: Vec<Vec<String>>,
    stages: Vec<Vec<Vec<String>>>,
}
fn parse_scripts(text: &str, out: &mut BTreeMap<String, Script>) {
    let mut depth = 0;
    let mut name = String::new();
    let mut current = Script::default();
    let mut comment = false;
    for line in text.lines() {
        let mut clean = String::new();
        let mut cs = line.chars().peekable();
        while let Some(c) = cs.next() {
            if comment {
                if c == '*' && cs.next_if_eq(&'/').is_some() {
                    comment = false
                }
                continue;
            }
            if c == '/' {
                if cs.next_if_eq(&'/').is_some() {
                    break;
                }
                if cs.next_if_eq(&'*').is_some() {
                    comment = true;
                    continue;
                }
            }
            clean.push(c)
        }
        let mut row = Vec::new();
        let push = |row: &mut Vec<String>, cur: &mut Script, dep: i32, name: &mut String| {
            if row.is_empty() {
                return;
            }
            if dep == 0 {
                *name = row[0].clone();
                row.clear()
            } else if dep == 1 {
                cur.outer.push(std::mem::take(row))
            } else if let Some(stage) = cur.stages.last_mut() {
                stage.push(std::mem::take(row))
            }
        };
        for tok in clean
            .replace('{', " { ")
            .replace('}', " } ")
            .to_ascii_lowercase()
            .split_whitespace()
        {
            match tok {
                "{" => {
                    push(&mut row, &mut current, depth, &mut name);
                    depth += 1;
                    if depth == 2 {
                        current.stages.push(vec![])
                    }
                }
                "}" => {
                    push(&mut row, &mut current, depth, &mut name);
                    depth = (depth - 1).max(0);
                    if depth == 0 && !name.is_empty() {
                        out.insert(std::mem::take(&mut name), std::mem::take(&mut current));
                    }
                }
                _ => row.push(tok.to_owned()),
            }
        }
        push(&mut row, &mut current, depth, &mut name)
    }
}
impl Palette {
    pub fn load(map: &Map, vfs: &mut Vfs) -> Result<Self> {
        let mut scripts = BTreeMap::new();
        let names: Vec<_> = vfs
            .names()
            .filter(|p| p.starts_with("scripts/") && p.ends_with(".shader"))
            .cloned()
            .collect();
        let mut script_bytes = 0;
        for name in names {
            let s = vfs.read(&name)?;
            script_bytes += s.len();
            if script_bytes > 12 << 20 {
                return Err("Material script budget exceeded".into());
            }
            parse_scripts(&String::from_utf8_lossy(&s), &mut scripts)
        }
        let mut p = Self {
            layers: vec![vec![255; (TILE * TILE * 4) as usize]],
            materials: vec![GpuMaterial::default(); map.materials.len() + 1],
            warnings: vec![],
            origins: BTreeMap::new(),
        };
        let mut cache = BTreeMap::new();
        let used: BTreeSet<_> = map
            .faces
            .iter()
            .filter(|f| !f.indices.is_empty())
            .map(|f| f.material)
            .collect();
        for mi in used {
            let m = &map.materials[mi];
            if m.flags & 0x80 != 0 {
                continue;
            }
            let script = scripts.get(&m.name);
            let mut mat = GpuMaterial::default();
            let sky = m.flags & 4 != 0;
            let mut stages = vec![];
            if let Some(s) = script {
                mat.meta[1] = s
                    .outer
                    .iter()
                    .any(|v| v.iter().any(|t| t == "trans" || t == "water"))
                    as u32;
                for lines in &s.stages {
                    let mut stage = Stage::default();
                    let mut tex = None;
                    for line in lines {
                        let args: Vec<_> = line.iter().map(String::as_str).collect();
                        let num = |i: usize, d: f32| {
                            args.get(i)
                                .and_then(|s| s.parse::<f32>().ok())
                                .filter(|n| n.is_finite())
                                .unwrap_or(d)
                        };
                        match args.as_slice() {
                            ["map" | "clampmap", name, ..] => {
                                tex = Some(*name);
                                stage.animation[3] = (args[0] == "clampmap") as u8 as f32
                            }
                            ["animmap", _, names @ ..] if !names.is_empty() => {
                                let start = p.layers.len();
                                for n in names {
                                    p.texture(vfs, &mut cache, n, true)?;
                                }
                                stage.animation[0] = start as f32;
                                stage.animation[1] = names.len() as f32;
                                stage.animation[2] = num(1, 1.);
                                tex = Some("$animated")
                            }
                            ["blendfunc", rest @ ..] => {
                                stage.mode[1] = match rest {
                                    ["add"] | ["gl_one", "gl_one"] => 1.,
                                    ["filter"]
                                    | ["gl_dst_color", "gl_zero"]
                                    | ["gl_zero", "gl_src_color"] => 2.,
                                    ["blend"] | ["gl_src_alpha", "gl_one_minus_src_alpha"] => 3.,
                                    ["gl_one", "gl_one_minus_src_alpha"] => 4.,
                                    ["gl_one", "gl_zero"] => 0.,
                                    _ => {
                                        p.warnings.push(format!("{}: {}", m.name, line.join(" ")));
                                        3.
                                    }
                                }
                            }
                            ["tcgen", "environment", ..] => stage.mode[2] = 1.,
                            ["tcgen", "lightmap", ..] => stage.mode[2] = 2.,
                            ["tcmod", "scale", ..] => {
                                stage.uv[0] = num(2, 1.);
                                stage.uv[1] = num(3, 1.)
                            }
                            ["tcmod", "scroll", ..] => {
                                stage.uv[2] = num(2, 0.);
                                stage.uv[3] = num(3, 0.)
                            }
                            ["alphafunc", f, ..] => {
                                stage.mode[3] = match *f {
                                    "gt0" => 0.001,
                                    "lt128" => -0.5,
                                    _ => 0.5,
                                }
                            }
                            ["rgbgen", "const", ..] => {
                                let v: Vec<f32> = args[2..]
                                    .iter()
                                    .filter_map(|s| s.trim_matches(['(', ')']).parse().ok())
                                    .collect();
                                if v.len() == 3 {
                                    stage.rgb[..3].copy_from_slice(&v)
                                }
                            }
                            ["rgbgen", "wave", "sin", ..] => {
                                stage.wave = [num(3, 1.), num(4, 0.), num(5, 0.), num(6, 1.)]
                            }
                            ["rgbgen", "oneminusvertex", ..] => stage.rgb[3] = 2.,
                            ["rgbgen", "vertex" | "exactvertex", ..] => stage.rgb[3] = 1.,
                            ["rgbgen", "identity" | "identitylighting", ..]
                            | ["depthwrite" | "depthfunc" | "tcgen", ..] => {}
                            _ => p.warnings.push(format!("{}: {}", m.name, line.join(" "))),
                        }
                    }
                    if let Some(tex) = tex {
                        stage.mode[0] = match tex {
                            "$lightmap" => -1.,
                            "$whiteimage" | "$animated" => 0.,
                            _ => p.texture(vfs, &mut cache, tex, false)? as f32,
                        };
                        stages.push(stage)
                    }
                }
            }
            if stages.is_empty() {
                let mut stage = Stage::default();
                stage.mode[0] = p.texture(vfs, &mut cache, &m.name, false)? as f32;
                stages.push(stage);
                let mut lm = Stage::default();
                lm.mode = [-1., 2., 0., 0.];
                stages.push(lm)
            }
            if stages.len() > 8 {
                return Err(format!("{} has too many material stages", m.name));
            }
            mat.meta[0] = stages.len() as u32;
            mat.meta[2] = sky as u32;
            mat.meta[3] = script.is_some_and(|s| {
                s.outer.iter().any(|v| {
                    v.first().is_some_and(|t| t == "cull")
                        && v.get(1)
                            .is_some_and(|t| matches!(t.as_str(), "none" | "disable" | "twosided"))
                })
            }) as u32;
            mat.stages[..stages.len()].copy_from_slice(&stages);
            p.materials[mi + 1] = mat
        }
        Ok(p)
    }
    fn texture(
        &mut self,
        vfs: &mut Vfs,
        cache: &mut BTreeMap<String, usize>,
        name: &str,
        duplicate: bool,
    ) -> Result<usize> {
        let path = vfs.image_path(name)?;
        if !duplicate {
            if let Some(i) = cache.get(&path) {
                return Ok(*i);
            }
        }
        if self.layers.len() >= 250 {
            return Err("Map uses more than 249 texture layers".into());
        }
        let bytes = vfs.read(&path)?;
        let format = image::ImageFormat::from_path(&path).map_err(|e| e.to_string())?;
        let mut reader = image::ImageReader::with_format(Cursor::new(bytes), format);
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(4096);
        limits.max_image_height = Some(4096);
        limits.max_alloc = Some(80 << 20);
        reader.limits(limits);
        let img = reader
            .decode()
            .map_err(|e| format!("{path}: {e}"))?
            .resize_exact(TILE, TILE, image::imageops::FilterType::Triangle)
            .to_rgba8();
        let i = self.layers.len();
        self.layers.push(img.into_raw());
        cache.insert(path.clone(), i);
        self.origins
            .insert(path.clone(), vfs.origin(&path).unwrap().into());
        Ok(i)
    }
}
