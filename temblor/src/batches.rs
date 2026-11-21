// SPDX-License-Identifier: GPL-2.0-or-later
use crate::material::GpuMaterial;
use std::ops::Range;

// One of WebGPU's 16 guaranteed fragment texture bindings is reserved for lightmaps.
pub const COLOR_SLOTS: usize = 15;

pub struct TextureBatches {
    pub groups: Vec<Vec<u32>>,
    pub material_group: Vec<usize>,
}

impl TextureBatches {
    /// Layer addresses are (scene-wide texture array, layer within that array).
    /// On overflow, return the index of the material that cannot fit in a draw.
    pub fn plan(
        bank_count: usize,
        layers: &[[u32; 2]],
        materials: &[GpuMaterial],
        first_skin: usize,
    ) -> Result<Self, usize> {
        let mut plan = Self {
            groups: vec![Vec::new()],
            material_group: vec![0; materials.len()],
        };
        if bank_count <= COLOR_SLOTS {
            plan.groups[0].extend(0..bank_count as u32);
            return Ok(plan);
        }

        // Pack skins together first so actors and the view weapon can usually
        // keep a single binding for their entire dynamic vertex stream.
        for id in (first_skin..materials.len()).chain(0..first_skin) {
            let material = &materials[id];
            let mut needed = Vec::new();
            for stage in &material.stages[..material.meta[0] as usize] {
                let frames = if stage.animation[1] > 0. {
                    let first = stage.animation[0] as usize;
                    first..first + stage.animation[1] as usize
                } else if stage.mode[0] >= 0. {
                    let layer = stage.mode[0] as usize;
                    layer..layer + 1
                } else {
                    continue; // Lightmap stage.
                };
                for &[bank, _] in &layers[frames] {
                    if !needed.contains(&bank) {
                        needed.push(bank);
                    }
                }
            }
            if needed.len() > COLOR_SLOTS {
                return Err(id);
            }
            let group = plan.groups.iter().position(|banks| {
                banks.len() + needed.iter().filter(|b| !banks.contains(b)).count() <= COLOR_SLOTS
            });
            let group = group.unwrap_or_else(|| {
                plan.groups.push(Vec::new());
                plan.groups.len() - 1
            });
            let banks = &mut plan.groups[group];
            for bank in needed {
                if !banks.contains(&bank) {
                    banks.push(bank);
                }
            }
            plan.material_group[id] = group;
        }
        Ok(plan)
    }
}

/// Keep the array layer ordinal when translating a bank to its draw-local slot.
pub fn layer_lookup(banks: &[u32], layers: &[[u32; 2]]) -> Vec<[u32; 2]> {
    layers
        .iter()
        .map(|&[bank, layer]| {
            banks
                .iter()
                .position(|b| *b == bank)
                .map_or([0, 0], |slot| [slot as u32, layer])
        })
        .collect()
}

#[derive(Debug, PartialEq)]
pub struct DrawRange {
    pub group: usize,
    pub indices: Range<u32>,
}

/// Only merge neighbors. In particular, translucent faces retain their BSP order.
pub fn append_range(ranges: &mut Vec<DrawRange>, group: usize, indices: Range<u32>) {
    if let Some(last) = ranges.last_mut() {
        if last.group == group && last.indices.end == indices.start {
            last.indices.end = indices.end;
            return;
        }
    }
    ranges.push(DrawRange { group, indices });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::material::Stage;

    fn material(layer: usize) -> GpuMaterial {
        let mut mat = GpuMaterial::default();
        mat.meta[0] = 1;
        mat.stages[0].mode[0] = layer as f32;
        mat
    }

    #[test]
    fn exact_limit_uses_one_identity_binding() {
        let layers: Vec<_> = (0..15).map(|bank| [bank, 2]).collect();
        let mats: Vec<_> = (0..15).map(material).collect();
        let plan = TextureBatches::plan(15, &layers, &mats, 12).unwrap();
        assert_eq!(plan.groups.len(), 1);
        assert_eq!(plan.material_group, vec![0; 15]);
        assert_eq!(layer_lookup(&plan.groups[0], &layers), layers);
    }

    #[test]
    fn mixed_size_animation_keeps_all_frames_and_layers_in_one_draw() {
        let mut layers: Vec<_> = (0..16).map(|bank| [bank, 0]).collect();
        layers.extend([[15, 1], [0, 1]]);
        let mut mats: Vec<_> = (0..15).map(material).collect();
        let mut animated = material(0);
        animated.meta[0] = 3;
        animated.stages[0].animation = [14., 4., 5., 0.];
        animated.stages[1].mode[0] = -1.;
        animated.stages[2].mode[0] = 4.;
        mats.push(animated);
        let plan = TextureBatches::plan(16, &layers, &mats, mats.len()).unwrap();
        assert_eq!(plan.groups.len(), 2);
        assert_eq!(plan.material_group[15], 1);
        let banks = &plan.groups[1];
        assert_eq!(banks.len(), 4);
        let lookup = layer_lookup(banks, &layers);
        for image in [4, 14, 15, 16, 17] {
            let [slot, ordinal] = lookup[image];
            assert_eq!([banks[slot as usize], ordinal], layers[image]);
        }
    }

    #[test]
    fn rejects_only_a_material_that_individually_overflows() {
        let layers: Vec<_> = (0..16).map(|bank| [bank, 0]).collect();
        let mut mats: Vec<_> = (0..16).map(material).collect();
        let plan = TextureBatches::plan(16, &layers, &mats, 14).unwrap();
        assert_eq!(&plan.material_group[14..], &[0, 0]);
        // A whole group of 15 sampled banks plus a lightmap is valid.
        mats[0].meta[0] = 2;
        mats[0].stages[0].animation = [1., 15., 1., 0.];
        mats[0].stages[1] = Stage::default();
        mats[0].stages[1].mode[0] = -1.;
        assert!(TextureBatches::plan(16, &layers, &mats, mats.len()).is_ok());
        // Explicit $whiteimage adds bank zero to the same draw.
        mats[0].stages[1].mode[0] = 0.;
        assert_eq!(
            TextureBatches::plan(16, &layers, &mats, mats.len()).err(),
            Some(0)
        );
    }

    #[test]
    fn adjacent_faces_coalesce_without_reordering() {
        let mut runs = Vec::new();
        for (face, group) in [1, 1, 0, 1].into_iter().enumerate() {
            let start = face as u32 * 3;
            append_range(&mut runs, group, start..start + 3);
        }
        assert_eq!(
            runs,
            vec![
                DrawRange {
                    group: 1,
                    indices: 0..6
                },
                DrawRange {
                    group: 0,
                    indices: 6..9
                },
                DrawRange {
                    group: 1,
                    indices: 9..12
                },
            ]
        );
    }
}
