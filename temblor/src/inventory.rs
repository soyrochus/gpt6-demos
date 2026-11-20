// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{bsp::Map, content::Vfs, material::Palette};
use serde_json::{json, Value};
use std::collections::BTreeMap;
pub fn report(m: &Map, p: &Palette, fs: &Vfs, name: &str) -> Value {
    let mut classes = BTreeMap::new();
    let mut entities = Vec::new();
    for e in &m.entities {
        let c = e["classname"].as_str();
        *classes.entry(c).or_insert(0) += 1;
        let handling = match c {
            "worldspawn" => "World collision and surfaces",
            "info_player_deathmatch" | "info_player_start" => "Spawn position and yaw",
            "info_player_intermission" => "Camera marker",
            "target_position" | "misc_teleporter_dest" | "target_location" => "Named destination",
            "trigger_push" => "Inline brush jump pad",
            "trigger_teleport" => "Teleport to named destination",
            "trigger_hurt" => "Damage on contact",
            "func_door" | "func_plat" => "Translating solid BSP model",
            "target_speaker" => "Local audio emitter",
            s if s.starts_with("weapon_")
                || s.starts_with("ammo_")
                || s.starts_with("item_health")
                || s.starts_with("item_armor") =>
            {
                "Inventory and timed respawn"
            }
            _ => "Unimplemented entity",
        };
        entities.push(json!({"properties":e,"handling":handling}))
    }
    let materials:Vec<_>=m.materials.iter().enumerate().map(|(i,s)|json!({"name":s.name,"surfaceFlags":s.flags,"contents":s.contents,"surfaces":m.faces.iter().filter(|f|f.material==i).count(),"stages":p.materials[i+1].meta[0]})).collect();
    let models:Vec<_>=m.models.iter().enumerate().map(|(i,m)|json!({"index":i,"mins":m.min.to_array(),"maxs":m.max.to_array(),"brushes":m.brushes.len(),"surfaces":m.faces.len()})).collect();
    json!({"map":name,"archive":fs.origin(name),"title":m.entities.first().and_then(|e|e.get("message")).map_or(name,String::as_str),"classes":classes,"entities":entities,"materials":materials,"models":models,"resources":p.origins,"warnings":p.warnings})
}
