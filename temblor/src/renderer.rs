// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{
    batches::{append_range, layer_lookup, DrawRange, TextureBatches, COLOR_SLOTS},
    bsp::Map,
    draw::{self, Vertex},
    game::Game,
    material::Palette,
    movement::direction,
};
use glam::{Mat4, Vec3};
use wgpu::util::DeviceExt;
pub struct Renderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    layout: wgpu::BindGroupLayout,
    pipeline: wgpu::RenderPipeline,
    water: wgpu::RenderPipeline,
    weapon: wgpu::RenderPipeline,
    depth: wgpu::TextureView,
    uniform: wgpu::Buffer,
    dynamic: wgpu::Buffer,
    capacity: u64,
}
pub struct Scene {
    pub peek_mesh: Vec<f32>,
    actors: crate::models::Actors,
    lighting: crate::models::LightGrid,
    groups: Vec<wgpu::BindGroup>,
    material_group: Vec<usize>,
    single_actor_group: bool,
    verts: wgpu::Buffer,
    indices: wgpu::Buffer,
    opaque: Vec<DrawRange>,
    translucent: Vec<DrawRange>,
    offsets: wgpu::Buffer,
}
impl Scene {
    fn draw_world(&self, pass: &mut wgpu::RenderPass<'_>, ranges: &[DrawRange]) {
        pass.set_vertex_buffer(0, self.verts.slice(..));
        pass.set_index_buffer(self.indices.slice(..), wgpu::IndexFormat::Uint32);
        for range in ranges {
            pass.set_bind_group(0, &self.groups[range.group], &[]);
            pass.draw_indexed(range.indices.clone(), 0, 0..1);
        }
    }

    fn draw_actors(&self, pass: &mut wgpu::RenderPass<'_>, vertices: &[Vertex], first: u32) {
        if self.single_actor_group {
            pass.set_bind_group(0, &self.groups[0], &[]);
            pass.draw(first..first + vertices.len() as u32, 0..1);
            return;
        }
        let group = |v: &Vertex| self.material_group[v.material()];
        let mut start = first;
        for run in vertices.chunk_by(|a, b| group(a) == group(b)) {
            let end = start + run.len() as u32;
            pass.set_bind_group(0, &self.groups[group(&run[0])], &[]);
            pass.draw(start..end, 0..1);
            start = end;
        }
    }
}
fn depth(d: &wgpu::Device, c: &wgpu::SurfaceConfiguration) -> wgpu::TextureView {
    d.create_texture(&wgpu::TextureDescriptor {
        label: Some("Depth"),
        size: wgpu::Extent3d {
            width: c.width,
            height: c.height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth24Plus,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    })
    .create_view(&Default::default())
}
fn buffer(d: &wgpu::Device, label: &str, size: u64, usage: wgpu::BufferUsages) -> wgpu::Buffer {
    d.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size,
        usage: usage | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}
impl Renderer {
    pub async fn new(canvas: web_sys::HtmlCanvasElement) -> Result<Self, String> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..Default::default()
        });
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(|e| e.to_string())?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or("No WebGPU adapter. Check graphics acceleration in chrome://settings/system. On Linux, set chrome://flags/#enable-vulkan to Enabled. Relaunch Chromium and click Play.")?;
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("Temblor"),
                    required_limits: wgpu::Limits {
                        max_texture_dimension_2d: adapter.limits().max_texture_dimension_2d,
                        ..wgpu::Limits::default()
                    },
                    ..Default::default()
                },
                None,
            )
            .await
            .map_err(|e| format!("WebGPU device limits: {e}"))?;
        let mut config = surface
            .get_default_config(&adapter, 1280, 720)
            .ok_or("No supported surface format")?;
        let formats = surface.get_capabilities(&adapter).formats;
        config.format = formats
            .iter()
            .copied()
            .find(|f| !f.is_srgb())
            .unwrap_or(formats[0]);
        surface.configure(&device, &config);
        use wgpu::{BindingType as B, BufferBindingType as T, ShaderStages as S};
        let entry = |binding, visibility, ty| wgpu::BindGroupLayoutEntry {
            binding,
            visibility,
            ty,
            count: None,
        };
        let tex = B::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2Array,
            multisampled: false,
        };
        let mut entries = vec![
            entry(
                0,
                S::VERTEX_FRAGMENT,
                B::Buffer {
                    ty: T::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
            ),
            entry(
                1,
                S::FRAGMENT,
                B::Buffer {
                    ty: T::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
            ),
            entry(2, S::FRAGMENT, tex),
            entry(
                3,
                S::FRAGMENT,
                B::Sampler(wgpu::SamplerBindingType::Filtering),
            ),
            entry(
                4,
                S::FRAGMENT,
                B::Buffer {
                    ty: T::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
            ),
            entry(
                5,
                S::VERTEX,
                B::Buffer {
                    ty: T::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
            ),
        ];
        entries.extend((0..COLOR_SLOTS).map(|i| entry(6 + i as u32, S::FRAGMENT, tex)));
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Arena materials"),
            entries: &entries,
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("IBSP materials"),
            source: wgpu::ShaderSource::Wgsl(include_str!("arena.wgsl").into()),
        });
        let pipe = |label: &str, blend, write, compare| {
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor{label:Some(label),layout:Some(&pipeline_layout),vertex:wgpu::VertexState{module:&shader,entry_point:Some("vs"),compilation_options:Default::default(),buffers:&[wgpu::VertexBufferLayout{array_stride:std::mem::size_of::<Vertex>() as u64,step_mode:wgpu::VertexStepMode::Vertex,attributes:&wgpu::vertex_attr_array![0=>Float32x3,1=>Float32x2,2=>Float32x2,3=>Float32x4,4=>Float32x3,5=>Uint32x2]}]},fragment:Some(wgpu::FragmentState{module:&shader,entry_point:Some("fs"),compilation_options:Default::default(),targets:&[Some(wgpu::ColorTargetState{format:config.format,blend,write_mask:wgpu::ColorWrites::ALL})]}),primitive:wgpu::PrimitiveState{front_face:wgpu::FrontFace::Cw,..Default::default()},depth_stencil:Some(wgpu::DepthStencilState{format:wgpu::TextureFormat::Depth24Plus,depth_write_enabled:write,depth_compare:compare,stencil:Default::default(),bias:Default::default()}),multisample:Default::default(),multiview:None,cache:None})
        };
        let pipeline = pipe("World", None, true, wgpu::CompareFunction::LessEqual);
        let water = pipe(
            "Translucent",
            Some(wgpu::BlendState::ALPHA_BLENDING),
            false,
            wgpu::CompareFunction::LessEqual,
        );
        let weapon = pipe("View weapon", None, true, wgpu::CompareFunction::LessEqual);
        let depth = depth(&device, &config);
        let uniform = buffer(&device, "Camera", 80, wgpu::BufferUsages::UNIFORM);
        let capacity = 4 << 20;
        let dynamic = buffer(&device, "Actors", capacity, wgpu::BufferUsages::VERTEX);
        Ok(Self {
            surface,
            device,
            queue,
            config,
            layout,
            pipeline,
            water,
            weapon,
            depth,
            uniform,
            dynamic,
            capacity,
        })
    }
    fn array(&self, w: u32, h: u32, layers: &[&[u8]], mipmaps: bool) -> wgpu::TextureView {
        let levels = if mipmaps { w.max(h).ilog2() + 1 } else { 1 };
        let tex = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Material images"),
            size: wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: layers.len() as u32,
            },
            mip_level_count: levels,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        for (i, layer) in layers.iter().enumerate() {
            let mut pixels = std::borrow::Cow::Borrowed(*layer);
            let (mut width, mut height) = (w, h);
            for level in 0..levels {
                self.queue.write_texture(
                    wgpu::TexelCopyTextureInfo {
                        texture: &tex,
                        mip_level: level,
                        origin: wgpu::Origin3d {
                            x: 0,
                            y: 0,
                            z: i as u32,
                        },
                        aspect: wgpu::TextureAspect::All,
                    },
                    &pixels,
                    wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(width * 4),
                        rows_per_image: Some(height),
                    },
                    wgpu::Extent3d {
                        width,
                        height,
                        depth_or_array_layers: 1,
                    },
                );
                if level + 1 < levels {
                    let image = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(
                        width,
                        height,
                        pixels.as_ref(),
                    )
                    .unwrap();
                    width = (width / 2).max(1);
                    height = (height / 2).max(1);
                    pixels = std::borrow::Cow::Owned(
                        image::imageops::resize(
                            &image,
                            width,
                            height,
                            image::imageops::FilterType::Triangle,
                        )
                        .into_raw(),
                    );
                }
            }
        }
        tex.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            ..Default::default()
        })
    }
    pub fn upload(
        &self,
        m: &Map,
        p: &Palette,
        actors: crate::models::Actors,
    ) -> Result<Scene, String> {
        // Only equal-sized images share an array. The layer table also handles
        // animated shader stages whose successive frames have different sizes.
        let mut banks: Vec<((u32, u32), Vec<&[u8]>)> = Vec::new();
        let mut image_layers = Vec::new();
        for texture in &p.layers {
            let dims = texture.image.dimensions();
            let bank = match banks.iter().position(|(d, _)| *d == dims) {
                Some(i) => i,
                None => {
                    banks.push((dims, Vec::new()));
                    banks.len() - 1
                }
            };
            image_layers.push([bank as u32, banks[bank].1.len() as u32]);
            banks[bank].1.push(texture.image.as_raw());
        }
        let first_skin = m.materials.len() + 1;
        let plan = TextureBatches::plan(banks.len(), &image_layers, &p.materials, first_skin)
            .map_err(|id| {
                // Skins have a single texture stage. Only BSP materials can overflow.
                format!("{}: one material exceeds {COLOR_SLOTS} distinct texture sizes across its stages and animation frames", m.materials[id - 1].name)
            })?;
        let views: Vec<_> = banks
            .iter()
            .map(|((w, h), layers)| self.array(*w, *h, layers, true))
            .collect();
        let mut layers = vec![vec![255; 128 * 128 * 4]];
        for l in m.lights.chunks_exact(49152) {
            layers.push(
                l.chunks_exact(3)
                    .flat_map(|rgb| [rgb[0], rgb[1], rgb[2], 255])
                    .collect(),
            );
        }
        let light_layers: Vec<_> = layers.iter().map(Vec::as_slice).collect();
        let lights = self.array(128, 128, &light_layers, false);
        let sampler = self.device.create_sampler(&wgpu::SamplerDescriptor {
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            min_filter: wgpu::FilterMode::Linear,
            mag_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let make = |label, contents: &[u8], usage| {
            self.device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some(label),
                    contents,
                    usage,
                })
        };
        let mat = make(
            "Stages",
            bytemuck::cast_slice(&p.materials),
            wgpu::BufferUsages::STORAGE,
        );
        let offsets = buffer(
            &self.device,
            "Inline model offsets",
            (m.models.len() * 16) as u64,
            wgpu::BufferUsages::STORAGE,
        );
        let mut groups = Vec::new();
        for banks in &plan.groups {
            let entry = |binding, resource| wgpu::BindGroupEntry { binding, resource };
            let lookup = make(
                "Batch texture layers",
                bytemuck::cast_slice(&layer_lookup(banks, &image_layers)),
                wgpu::BufferUsages::STORAGE,
            );
            let mut entries = vec![
                entry(0, self.uniform.as_entire_binding()),
                entry(1, lookup.as_entire_binding()),
                entry(2, wgpu::BindingResource::TextureView(&lights)),
                entry(3, wgpu::BindingResource::Sampler(&sampler)),
                entry(4, mat.as_entire_binding()),
                entry(5, offsets.as_entire_binding()),
            ];
            entries.extend((0..COLOR_SLOTS).map(|i| {
                entry(
                    6 + i as u32,
                    wgpu::BindingResource::TextureView(
                        &views[banks.get(i).copied().unwrap_or(0) as usize],
                    ),
                )
            }));
            groups.push(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Arena texture batch"),
                layout: &self.layout,
                entries: &entries,
            }));
        }
        let mut v = vec![];
        let mut ix = vec![];
        let mut translucent_indices = vec![];
        let mut opaque = vec![];
        let mut translucent = vec![];
        let mut models = vec![0u32; m.faces.len()];
        for (i, model) in m.models.iter().enumerate() {
            models[model.faces.clone()].fill(i as u32)
        }
        for (fi, f) in m.faces.iter().enumerate() {
            let material = f.material + 1;
            if f.indices.is_empty() || p.materials[material].meta[0] == 0 {
                continue;
            }
            let base = v.len() as u32;
            for &pt in &f.vertices {
                v.push(Vertex::world(
                    pt,
                    f.material as u32 + 1,
                    (f.light + 1).max(0) as u32 | (models[fi] << 16),
                ))
            }
            let (target, ranges) = if p.materials[material].meta[1] == 1 {
                (&mut translucent_indices, &mut translucent)
            } else {
                (&mut ix, &mut opaque)
            };
            let start = target.len() as u32;
            target.extend(f.indices.iter().map(|i| base + i));
            append_range(
                ranges,
                plan.material_group[material],
                start..target.len() as u32,
            );
        }
        let split = ix.len() as u32;
        for range in &mut translucent {
            range.indices = split + range.indices.start..split + range.indices.end;
        }
        ix.extend(translucent_indices);
        if ix.is_empty() {
            return Err("No drawable map surfaces".into());
        }
        Ok(Scene {
            peek_mesh: crate::peek::mesh(m, &models),
            actors,
            lighting: crate::models::LightGrid::new(m),
            groups,
            single_actor_group: plan.material_group[first_skin..].iter().all(|&g| g == 0),
            material_group: plan.material_group,
            offsets,
            verts: make(
                "Map vertices",
                bytemuck::cast_slice(&v),
                wgpu::BufferUsages::VERTEX,
            ),
            indices: make(
                "Map indices",
                bytemuck::cast_slice(&ix),
                wgpu::BufferUsages::INDEX,
            ),
            opaque,
            translucent,
        })
    }
    pub fn limit(&self) -> u32 {
        self.device.limits().max_texture_dimension_2d
    }
    pub fn resize(&mut self, w: u32, h: u32) {
        debug_assert!((1..=self.limit()).contains(&w) && (1..=self.limit()).contains(&h));
        if self.config.width != w || self.config.height != h {
            self.config.width = w;
            self.config.height = h;
            self.surface.configure(&self.device, &self.config);
            self.depth = depth(&self.device, &self.config)
        }
    }
    pub fn frame(&mut self, s: &Scene, g: &Game, alpha: f32) -> Result<(), String> {
        self.queue
            .write_buffer(&s.offsets, 0, bytemuck::cast_slice(&g.offsets));
        let a = &g.actors[0];
        let eye = a.previous.lerp(a.body.pos, alpha) + (a.body.eye() - a.body.pos)
            - if a.hp <= 0 { Vec3::Z * 23. } else { Vec3::ZERO };
        let front = direction(a.body.yaw, a.body.pitch);
        let vp = Mat4::perspective_rh(
            76f32.to_radians(),
            self.config.width as f32 / self.config.height as f32,
            1.,
            16384.,
        ) * Mat4::look_to_rh(eye, front, Vec3::Z);
        let mut u = [0f32; 20];
        u[..16].copy_from_slice(&vp.to_cols_array());
        u[16..].copy_from_slice(&eye.extend(g.time as f32 * 0.001).to_array());
        self.queue
            .write_buffer(&self.uniform, 0, bytemuck::cast_slice(&u));
        let (v, n) = draw::geometry(g, alpha, eye, front, &s.actors, &s.lighting);
        let bytes = bytemuck::cast_slice(&v);
        if bytes.len() as u64 > self.capacity {
            self.capacity = bytes.len().next_power_of_two() as u64;
            self.dynamic = buffer(
                &self.device,
                "Actors",
                self.capacity,
                wgpu::BufferUsages::VERTEX,
            )
        }
        self.queue.write_buffer(&self.dynamic, 0, bytes);
        let frame = match self.surface.get_current_texture() {
            Ok(f) => f,
            Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                self.surface.configure(&self.device, &self.config);
                return Ok(());
            }
            Err(wgpu::SurfaceError::Timeout) => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };
        let view = frame.texture.create_view(&Default::default());
        let mut enc = self.device.create_command_encoder(&Default::default());
        for overlay in [false, true] {
            let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: if overlay {
                            wgpu::LoadOp::Load
                        } else {
                            wgpu::LoadOp::Clear(wgpu::Color {
                                r: 0.04,
                                g: 0.055,
                                b: 0.07,
                                a: 1.,
                            })
                        },
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            if overlay {
                pass.set_pipeline(&self.weapon);
                pass.set_vertex_buffer(0, self.dynamic.slice(..));
                s.draw_actors(&mut pass, &v[n..], n as u32);
            } else {
                pass.set_pipeline(&self.pipeline);
                s.draw_world(&mut pass, &s.opaque);
                pass.set_vertex_buffer(0, self.dynamic.slice(..));
                s.draw_actors(&mut pass, &v[..n], 0);
                pass.set_pipeline(&self.water);
                s.draw_world(&mut pass, &s.translucent);
            }
        }
        self.queue.submit(Some(enc.finish()));
        frame.present();
        Ok(())
    }
}
