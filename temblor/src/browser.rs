// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{
    bsp::Map,
    content::Vfs,
    game::Game,
    material::Palette,
    movement::Cmd,
    renderer::{Renderer, Scene},
};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub struct Packages(Vfs);
#[wasm_bindgen]
impl Packages {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(Vfs::default())
    }
    pub fn mount(&mut self, name: &str, bytes: Vec<u8>) -> Result<(), String> {
        self.0.mount(name, bytes)
    }
    pub fn sound(&mut self, path: &str) -> Result<Vec<u8>, String> {
        self.0.read(path)
    }
    pub fn speakers(&mut self, map: &str) -> Result<String, String> {
        let m = Map::parse(&self.0.read(map)?)?;
        let mut sources = Vec::new();
        for e in &m.entities {
            if e["classname"] != "target_speaker" {
                continue;
            }
            let Some(name) = e.get("noise") else { continue };
            if name.starts_with('*') {
                continue;
            }
            let key = crate::content::path(name)?;
            let stem = key.trim_end_matches(".wav").trim_end_matches(".ogg");
            let path = [key.clone(), format!("{stem}.wav"), format!("{stem}.ogg")]
                .into_iter()
                .find(|p| self.0.origin(p).is_some())
                .ok_or_else(|| format!("Missing map sound {name}"))?;
            sources.push(serde_json::json!({"file":path,"origin":self.0.origin(&path),"pos":crate::bsp::origin(e).to_array(),"flags":e.get("spawnflags").and_then(|v|v.parse::<i32>().ok()).unwrap_or(0)}));
        }
        Ok(serde_json::to_string(&sources).unwrap())
    }
    pub fn maps(&self) -> String {
        serde_json::to_string(
            &self
                .0
                .names()
                .filter(|p| p.starts_with("maps/") && p.ends_with(".bsp"))
                .collect::<Vec<_>>(),
        )
        .unwrap()
    }
}
#[wasm_bindgen]
pub struct Engine {
    gpu: Renderer,
    session: Option<(Scene, Game)>,
}
#[wasm_bindgen]
impl Engine {
    pub async fn create(canvas: web_sys::HtmlCanvasElement) -> Result<Engine, JsValue> {
        console_error_panic_hook::set_once();
        Ok(Self {
            gpu: Renderer::new(canvas).await?,
            session: None,
        })
    }
    pub fn load(
        &mut self,
        packs: &mut Packages,
        actors: &mut Packages,
        name: &str,
        seed: u32,
    ) -> Result<String, String> {
        let m = Map::parse(&packs.0.read(name)?)?;
        let mut palette = Palette::load(&m, &mut packs.0)?;
        let mut game = Game::new(&m, seed)?;
        let aas = name.trim_end_matches(".bsp").to_owned() + ".aas";
        if packs.0.origin(&aas).is_some() {
            game.areas = Some(crate::aas::Areas::parse(&packs.0.read(&aas)?)?);
        }
        let assets = crate::models::Actors::load(&mut actors.0, &mut palette)?;
        let scene = self.gpu.upload(&m, &palette, assets)?;
        let mut info = crate::inventory::report(&m, &palette, &packs.0, name);
        info["textureSizes"] = palette
            .layers
            .iter()
            .map(|l| (l.name.clone(), serde_json::json!(l.image.dimensions())))
            .collect::<serde_json::Map<String, _>>()
            .into();
        info["nodes"] = game.nav.points.len().into();
        self.session = Some((scene, game));
        Ok(info.to_string())
    }
    pub fn tick(&mut self, forward: f32, side: f32, dx: f32, dy: f32, buttons: u8, weapon: usize) {
        if let Some((_, g)) = &mut self.session {
            let b = g.actors[0].body;
            g.tick(Cmd {
                forward,
                side,
                yaw: b.yaw + dx,
                pitch: b.pitch + dy,
                jump: buttons & 1 != 0,
                crouch: buttons & 2 != 0,
                fire: buttons & 4 != 0,
                weapon,
            })
        }
    }
    pub fn frame(&mut self, alpha: f32) -> Result<(), String> {
        if let Some((s, g)) = &self.session {
            self.gpu.frame(s, g, alpha)?
        }
        Ok(())
    }
    pub fn surface_limit(&self) -> u32 {
        self.gpu.limit()
    }
    pub fn resize(&mut self, w: u32, h: u32) {
        self.gpu.resize(w, h)
    }
    pub fn snapshot(&self) -> String {
        self.session
            .as_ref()
            .map(|(_, g)| g.snapshot().to_string())
            .unwrap_or_default()
    }
    pub fn route(&self, x: f32, y: f32, z: f32) -> String {
        let Some((_, g)) = &self.session else {
            return "[]".into();
        };
        let p = g.actors[0].body.pos;
        let q = glam::Vec3::new(x, y, z);
        if !q.is_finite() {
            return "[]".into();
        }
        let r = g
            .areas
            .as_ref()
            .and_then(|a| a.path(p, q))
            .unwrap_or_else(|| g.nav.path(p, q, &g.world));
        serde_json::to_string(&r.iter().map(|p| p.to_array()).collect::<Vec<_>>()).unwrap()
    }
    pub fn items(&self) -> String {
        let Some((_, g)) = &self.session else {
            return "[]".into();
        };
        serde_json::to_string(&g.items.iter().map(|it|serde_json::json!({"class":it.class,"pos":it.pos.to_array(),"next":it.next})).collect::<Vec<_>>()).unwrap()
    }
    pub fn events(&mut self) -> String {
        self.session
            .as_mut()
            .map(|(_, g)| serde_json::to_string(&std::mem::take(&mut g.events)).unwrap())
            .unwrap_or_else(|| "[]".into())
    }
    /// Discard grounded walking momentum when the browser relinquishes controls.
    /// Airborne motion, projectiles and the match clock stay frozen until resume.
    pub fn release_controls(&mut self) {
        if let Some((_, game)) = &mut self.session {
            let player = &mut game.actors[0];
            if player.body.grounded && player.hp > 0 {
                player.body.vel.x = 0.;
                player.body.vel.y = 0.;
                player.previous = player.body.pos;
            }
            player.body.held_jump = false;
        }
    }
    pub fn set_bot_level(&mut self, level: u8) {
        if let Some((_, game)) = &mut self.session {
            game.set_bot_level(level);
        }
    }
    pub fn peek_geometry(&self) -> Vec<f32> {
        self.session
            .as_ref()
            .map(|(scene, _)| scene.peek_mesh.clone())
            .unwrap_or_default()
    }
    pub fn peek_offsets(&self) -> Vec<f32> {
        self.session
            .as_ref()
            .map(|(_, g)| g.offsets.concat())
            .unwrap_or_default()
    }
    pub fn rematch(&mut self) {
        if let Some((_, g)) = &mut self.session {
            g.reset()
        }
    }
}
