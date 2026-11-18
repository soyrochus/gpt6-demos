use crate::*;
use std::io::{Read, Write};
/// Validate in a sibling temporary directory, then atomically rename into place.
/// Existing ids (including bundled ids) are never overwritten.
pub fn install(archive: &Path, destination: &Path, existing_ids: &[String]) -> Result<PathBuf> {
    fs::create_dir_all(destination).map_err(|e| error(e.to_string()))?;
    let file = fs::File::open(archive).map_err(|e| error(e.to_string()))?;
    require(
        file.metadata().map_err(|e| error(e.to_string()))?.len() <= MAX_BYTES,
        "archive file exceeds 32 MiB",
    )?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| error(format!("invalid zip: {e}")))?;
    require(zip.len() <= 4096, "too many archive entries")?;
    let temp = tempfile::Builder::new()
        .prefix(".import-")
        .tempdir_in(destination)
        .map_err(|e| error(e.to_string()))?;
    let mut bytes = 0u64;
    let mut paths = HashSet::new();
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| error(format!("invalid zip entry: {e}")))?;
        let name = entry
            .name()
            .map_err(|e| error(format!("invalid zip entry name: {e}")))?;
        let path = Path::new(name.trim_end_matches('/'));
        require(safe_relative(path), "unsafe zip path")?;
        require(paths.insert(path.to_path_buf()), "duplicate zip entry")?;
        if let Some(mode) = entry.unix_mode() {
            require(mode & 0o170000 != 0o120000, "zip symlinks are forbidden")?;
            require(
                mode & 0o170000 == 0 || matches!(mode & 0o170000, 0o100000 | 0o040000),
                "zip special files are forbidden",
            )?;
        }
        require(
            entry.size() <= MAX_BYTES - bytes,
            "archive exceeds 32 MiB uncompressed",
        )?;
        let output = temp.path().join(path);
        if entry.is_dir() {
            fs::create_dir_all(output).map_err(|e| error(e.to_string()))?;
            continue;
        }
        // Data-only archive: no code or executable payloads are installed.
        require(
            matches!(
                path.extension().and_then(|s| s.to_str()),
                Some("png" | "toml" | "json" | "txt" | "md" | "wav" | "ogg")
            ),
            "unsupported file in pack archive",
        )?;
        fs::create_dir_all(output.parent().unwrap()).map_err(|e| error(e.to_string()))?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(output)
            .map_err(|e| error(e.to_string()))?;
        let mut buffer = [0; 8192];
        loop {
            let n = entry
                .read(&mut buffer)
                .map_err(|e| error(format!("truncated/corrupt zip: {e}")))?;
            if n == 0 {
                break;
            }
            bytes += n as u64;
            require(bytes <= MAX_BYTES, "archive exceeds 32 MiB extracted")?;
            file.write_all(&buffer[..n])
                .map_err(|e| error(e.to_string()))?;
        }
    }
    let mut roots = Vec::new();
    if temp.path().join("pack.toml").is_file() {
        roots.push(temp.path().to_path_buf());
    }
    for entry in fs::read_dir(temp.path()).map_err(|e| error(e.to_string()))? {
        let path = entry.map_err(|e| error(e.to_string()))?.path();
        if path.is_dir() && path.join("pack.toml").is_file() {
            roots.push(path);
        }
    }
    require(
        roots.len() == 1,
        "archive must contain one pack.toml at root or one folder deep",
    )?;
    let loaded = load(&roots[0])?;
    require(
        !existing_ids.contains(&loaded.pack.id),
        "pack id already installed",
    )?;
    let target = destination.join(&loaded.pack.id);
    require(!target.exists(), "pack destination already exists")?;
    fs::rename(&roots[0], &target).map_err(|e| error(format!("cannot install pack: {e}")))?;
    Ok(target)
}
