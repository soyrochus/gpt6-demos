// SPDX-License-Identifier: GPL-2.0-or-later
use std::{env, fs, path::Path};
use temblor::{bsp::Map, content::Vfs, inventory, material::Palette};
fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let map = args
        .next()
        .ok_or("usage: inspect maps/name.bsp package.pk3 ...")?;
    let mut vfs = Vfs::default();
    for f in args {
        let p = Path::new(&f);
        vfs.mount(
            p.file_name()
                .and_then(|s| s.to_str())
                .ok_or("invalid archive name")?,
            fs::read(p).map_err(|e| e.to_string())?,
        )?
    }
    let m = Map::parse(&vfs.read(&map)?)?;
    let p = Palette::load(&m, &mut vfs)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&inventory::report(&m, &p, &vfs, &map)).unwrap()
    );
    Ok(())
}
