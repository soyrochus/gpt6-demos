// SPDX-License-Identifier: GPL-2.0-or-later
pub mod aas;
#[cfg(target_arch = "wasm32")]
mod browser;
pub mod bsp;
pub mod collision;
pub mod content;
pub mod draw;
pub mod game;
pub mod inventory;
pub mod material;
pub mod md3;
pub mod models;
pub mod movement;
pub mod mover;
pub mod nav;
#[cfg(target_arch = "wasm32")]
mod renderer;
