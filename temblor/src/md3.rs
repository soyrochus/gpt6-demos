// SPDX-License-Identifier: GPL-2.0-or-later
//! Quake III vertex animation. MD3 stores tag axes as three basis vectors.
use crate::{
    content::{Result, Vfs},
    draw::Vertex,
};
use glam::{Affine3A, Mat3, Quat, Vec2, Vec3};
use std::collections::BTreeMap;

#[derive(Copy, Clone, Default)]
pub struct Pose {
    pub a: usize,
    pub b: usize,
    pub mix: f32,
}

#[derive(Clone, Copy)]
struct Tag {
    origin: Vec3,
    rotation: Quat,
}
struct Surface {
    material: u32,
    triangles: Vec<usize>,
    uv: Vec<Vec2>,
    frames: Vec<(Vec3, Vec3)>,
}
pub struct Mesh {
    pub frames: usize,
    floor: Vec<f32>,
    tags: BTreeMap<String, Vec<Tag>>,
    surfaces: Vec<Surface>,
}
struct Bytes<'a>(&'a [u8]);
impl<'a> Bytes<'a> {
    fn block(&self, offset: usize, len: usize) -> Result<&'a [u8]> {
        self.0
            .get(offset..offset.checked_add(len).ok_or("MD3 offset overflow")?)
            .ok_or_else(|| "Truncated MD3".into())
    }
    fn count(&self, off: usize, max: usize) -> Result<usize> {
        let n = u32::from_le_bytes(self.block(off, 4)?.try_into().unwrap()) as usize;
        if n > max {
            return Err("MD3 count or offset outside limits".into());
        }
        Ok(n)
    }
    fn name(&self, off: usize) -> Result<String> {
        let bytes = self.block(off, 64)?;
        Ok(String::from_utf8_lossy(bytes.split(|b| *b == 0).next().unwrap()).to_ascii_lowercase())
    }
    fn float(&self, off: usize) -> Result<f32> {
        let f = f32::from_le_bytes(self.block(off, 4)?.try_into().unwrap());
        if !f.is_finite() {
            return Err("Invalid MD3 coordinate".into());
        }
        Ok(f)
    }
    fn vector(&self, off: usize) -> Result<Vec3> {
        Ok(Vec3::new(
            self.float(off)?,
            self.float(off + 4)?,
            self.float(off + 8)?,
        ))
    }
    fn offset(&self, off: usize) -> Result<usize> {
        self.count(off, self.0.len())
    }
}
impl Mesh {
    pub fn load(
        vfs: &mut Vfs,
        path: &str,
        skin: Option<&str>,
        mut material: impl FnMut(&mut Vfs, &str) -> Result<u32>,
    ) -> Result<Self> {
        let data = vfs.read(path)?;
        Self::parse(&data, skin, |name| material(vfs, name)).map_err(|e| format!("{path}: {e}"))
    }
    fn parse(
        data: &[u8],
        skin: Option<&str>,
        mut material: impl FnMut(&str) -> Result<u32>,
    ) -> Result<Self> {
        let b = Bytes(data);
        if b.block(0, 4)? != b"IDP3" || b.count(4, 15)? != 15 || b.offset(104)? != data.len() {
            return Err("Invalid MD3 header".into());
        }
        let frames = b.count(76, 1024)?;
        let tag_count = b.count(80, 32)?;
        let surface_count = b.count(84, 32)?;
        if frames == 0 {
            return Err("Empty MD3 animation".into());
        }
        let base = b.offset(92)?;
        let floor = (0..frames)
            .map(|i| b.float(base + 56 * i + 8))
            .collect::<Result<Vec<_>>>()?;
        let mut tags = BTreeMap::<String, Vec<Tag>>::new();
        let base = b.offset(96)?;
        for frame in 0..frames {
            for t in 0..tag_count {
                let off = base + 112 * (frame * tag_count + t);
                let entries = tags.entry(b.name(off)?).or_default();
                if entries.len() != frame {
                    return Err("Inconsistent MD3 tag names".into());
                }
                let axes = Mat3::from_cols(
                    b.vector(off + 76)?,
                    b.vector(off + 88)?,
                    b.vector(off + 100)?,
                );
                entries.push(Tag {
                    origin: b.vector(off + 64)?,
                    rotation: Quat::from_mat3(&axes).normalize(),
                });
            }
        }
        let skins: BTreeMap<_, _> = skin
            .unwrap_or("")
            .lines()
            .filter_map(|s| s.trim().split_once(','))
            .map(|(s, t)| (s.trim().to_ascii_lowercase(), t.trim().to_ascii_lowercase()))
            .collect();
        let mut off = b.offset(100)?;
        let mut surfaces = vec![];
        for _ in 0..surface_count {
            let header = Bytes(b.block(off, 108)?);
            let size = header.count(104, data.len() - off)?;
            let s = Bytes(b.block(off, size)?);
            if s.block(0, 4)? != b"IDP3" || s.count(72, 1024)? != frames {
                return Err("Invalid MD3 surface".into());
            }
            let name = s.name(4)?;
            let verts = s.count(80, 4096)?;
            let tris = s.count(84, 8192)?;
            if verts == 0 {
                return Err("Empty MD3 surface".into());
            }
            let texture = match skin {
                Some(_) => skins
                    .get(&name)
                    .ok_or_else(|| format!("Missing skin for {name}"))?
                    .clone(),
                None => s.name(s.offset(92)?)?,
            };
            let material = material(&texture)?;
            let base = s.offset(88)?;
            let triangles = (0..tris * 3)
                .map(|i| s.count(base + 4 * i, verts - 1))
                .collect::<Result<Vec<_>>>()?;
            let base = s.offset(96)?;
            let uv = (0..verts)
                .map(|i| {
                    Ok(Vec2::new(
                        s.float(base + 8 * i)?,
                        s.float(base + 8 * i + 4)?,
                    ))
                })
                .collect::<Result<Vec<_>>>()?;
            let bytes = s.block(s.offset(100)?, frames * verts * 8)?;
            let frames = bytes
                .chunks_exact(8)
                .map(|p| {
                    let val = |i: usize| i16::from_le_bytes([p[i], p[i + 1]]) as f32 / 64.;
                    let angle = std::f32::consts::TAU / 255.;
                    let (sl, cl) = (p[7] as f32 * angle).sin_cos();
                    let (sn, cn) = (p[6] as f32 * angle).sin_cos();
                    (
                        Vec3::new(val(0), val(2), val(4)),
                        Vec3::new(cl * sn, sl * sn, cn),
                    )
                })
                .collect();
            surfaces.push(Surface {
                material,
                triangles,
                uv,
                frames,
            });
            off += size;
        }
        Ok(Self {
            frames,
            floor,
            tags,
            surfaces,
        })
    }
    pub fn require(&self, name: &str) -> Result<()> {
        if self.tags.contains_key(name) {
            Ok(())
        } else {
            Err(format!("Missing attachment {name}"))
        }
    }
    pub fn tag(&self, name: &str, pose: Pose) -> Affine3A {
        let tags = &self.tags[name];
        let (a, b) = (tags[pose.a], tags[pose.b]);
        Affine3A::from_rotation_translation(
            a.rotation.slerp(b.rotation, pose.mix),
            a.origin.lerp(b.origin, pose.mix),
        )
    }
    pub fn floor(&self, p: Pose) -> f32 {
        self.floor[p.a] + (self.floor[p.b] - self.floor[p.a]) * p.mix
    }
    pub fn draw(
        &self,
        out: &mut Vec<Vertex>,
        transform: Affine3A,
        p: Pose,
        light: &crate::models::Light,
    ) {
        for s in &self.surfaces {
            let count = s.uv.len();
            let vertices: Vec<_> =
                s.uv.iter()
                    .enumerate()
                    .map(|(i, &uv)| {
                        let (a, na) = s.frames[p.a * count + i];
                        let (b, nb) = s.frames[p.b * count + i];
                        let normal = transform
                            .transform_vector3(na.lerp(nb, p.mix))
                            .normalize_or_zero();
                        Vertex::model(
                            transform.transform_point3(a.lerp(b, p.mix)),
                            uv,
                            normal,
                            light.shade(normal),
                            s.material,
                        )
                    })
                    .collect();
            out.extend(s.triangles.iter().map(|&i| vertices[i]));
        }
    }
}
