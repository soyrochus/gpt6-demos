// SPDX-License-Identifier: GPL-2.0-or-later
//! Virtual file names are ASCII case-insensitive. Archives are indexed lazily.
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
    rc::Rc,
};
use zip::ZipArchive;
pub type Result<T> = std::result::Result<T, String>;
pub fn path(name: &str) -> Result<String> {
    let p = name.replace('\\', "/").to_ascii_lowercase();
    if p.len() > 256
        || p.contains(':')
        || p.bytes().any(|b| b < 32)
        || p.split('/').any(|s| matches!(s, "" | ".." | "."))
    {
        return Err(format!("Invalid virtual path: {name}"));
    }
    Ok(p)
}
type Archive = ZipArchive<Cursor<Rc<[u8]>>>;
#[derive(Default)]
pub struct Vfs {
    packs: BTreeMap<(bool, u32, String), Archive>,
    entries: BTreeMap<String, ((bool, u32, String), usize)>,
    total: usize,
}
impl Vfs {
    pub fn mount(&mut self, name: &str, bytes: Vec<u8>) -> Result<()> {
        let name = path(name)?;
        if name.contains('/') || !name.ends_with(".pk3") {
            return Err("Select a named PK3 archive".into());
        }
        if bytes.len() > 600_000_000 || self.total + bytes.len() > 850_000_000 {
            return Err("Selected archives exceed the memory budget".into());
        }
        let size = bytes.len();
        let mut z = ZipArchive::new(Cursor::new(Rc::from(bytes.into_boxed_slice())))
            .map_err(|e| format!("Invalid PK3 {name}: {e}"))?;
        if z.len() > 40000 || self.entries.len() + z.len() > 80000 {
            return Err("Too many archive entries".into());
        }
        let number = name
            .trim_end_matches(".pk3")
            .strip_prefix("pak")
            .and_then(|s| s.parse().ok());
        let key = (number.is_none(), number.unwrap_or(0), name);
        if self.packs.contains_key(&key) {
            return Err("Duplicate archive filename".into());
        }
        let mut pending = Vec::new();
        for i in 0..z.len() {
            let f = z.by_index_raw(i).map_err(|e| e.to_string())?;
            if f.is_dir() {
                continue;
            }
            let p = path(f.name())?;
            pending.push((p, i));
        }
        for (p, i) in pending {
            if self.entries.get(&p).is_none_or(|(k, _)| k <= &key) {
                self.entries.insert(p, (key.clone(), i));
            }
        }
        self.packs.insert(key, z);
        self.total += size;
        Ok(())
    }
    pub fn names(&self) -> impl Iterator<Item = &String> {
        self.entries.keys()
    }
    pub fn origin(&self, p: &str) -> Option<&str> {
        self.entries.get(p).map(|(k, _)| k.2.as_str())
    }
    pub fn read(&mut self, p: &str) -> Result<Vec<u8>> {
        let (k, i) = self
            .entries
            .get(p)
            .ok_or_else(|| format!("Missing dependency: {p}"))?;
        let mut f = self
            .packs
            .get_mut(k)
            .unwrap()
            .by_index(*i)
            .map_err(|e| e.to_string())?;
        let limit = if p.ends_with(".bsp") {
            48 << 20
        } else if p.ends_with(".shader") {
            2 << 20
        } else {
            24 << 20
        };
        let size = f.size();
        if size > limit {
            return Err(format!("{p} exceeds resource limit"));
        }
        let mut out = Vec::new();
        (&mut f)
            .take(size + 1)
            .read_to_end(&mut out)
            .map_err(|e| format!("{p}: {e}"))?;
        if out.len() as u64 != size {
            return Err(format!("Invalid size for {p}"));
        }
        Ok(out)
    }
    pub fn image_path(&self, s: &str) -> Result<String> {
        let s = path(s)?;
        let stem = s
            .rsplit_once('.')
            .filter(|(_, e)| matches!(*e, "tga" | "jpg" | "jpeg" | "png"))
            .map_or(s.as_str(), |(p, _)| p);
        std::iter::once(s.clone())
            .chain(["tga", "jpg", "png", "jpeg"].map(|e| format!("{stem}.{e}")))
            .find(|p| self.entries.contains_key(p))
            .ok_or_else(|| format!("Missing texture {s}. Select the base and patch PK3s together."))
    }
}
