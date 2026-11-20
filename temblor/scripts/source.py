#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Package allowlisted game sources and the exact crates linked into the Wasm."""
import gzip
import hashlib
import html
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tomllib

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
RELEASE = Path("release")
ARCHIVE = RELEASE / "temblor-source.tar.gz"
HOST = ["index.html", "arena.css", "host.js", "audio.js"]
NOTICES = [Path("COPYING"), Path("notices/ENGINE.md"), Path("assets/manifest.json"),
           Path("assets/source/editable/rpg3dm2source.txt")]
for package in ("maps", "misc", "textures", "data"):
    NOTICES.append(Path(f"notices/openarena-{package}.copyright"))
for pack in ("pak0", "pak1-maps", "pak4-textures", "pak6-misc"):
    for notice in ("COPYING", "CREDITS", "CREDITS-0.8.5"):
        path = Path(f"notices/{pack}-{notice}")
        if path.exists():
            NOTICES.append(path)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def add_bytes(tar, name, data, mode=0o644):
    entry = tarfile.TarInfo("temblor/" + str(name))
    entry.size = len(data)
    entry.mode = mode
    tar.addfile(entry, io.BytesIO(data))

def project_inputs():
    files = {Path(name) for name in ["Cargo.toml", "Cargo.lock", "README.md", "play",
        "package.json", "bun.lock", ".gitignore", "PRODUCT.md", "DESIGN.md",
        ".impeccable/design.json", "specs/spec-quake3-engine.md"]}
    files.update(NOTICES)
    for pattern in ["src/*.rs", "src/*.wgsl", "examples/*.rs", "tests/*.rs",
                    "tests/*.mjs", "tests/reference/*.c", "tests/reference/*.patch",
                    "scripts/*.py", "scripts/*.sh", "scripts/*.ts"]:
        files.update(ROOT.glob(pattern))
    files.update(Path("web") / name for name in HOST)
    manifest = json.loads(Path("assets/manifest.json").read_text())
    files.update(Path("assets/source") / entry["path"] for entry in manifest)
    for name in ["README.md", "reference-movement.csv", "reference-arena.log",
                 "oa_rpg3dm2.json", "native.txt", "acceptance.json", "browser-smoke.json",
                 "release-matches.json", "headed-match.json", "browser-route.json", "import.json", "lobby.png",
                 "arena.png", "release-fight.png", "release-intermission.png"]:
        path = Path("evidence") / name
        if path.exists():
            files.add(path)
    return sorted({p.relative_to(ROOT) if p.is_absolute() else p for p in files})

def add_dependencies(tar):
    tree = subprocess.check_output(["cargo", "tree", "--locked", "--offline", "--target",
        "wasm32-unknown-unknown", "--prefix", "none", "-e", "normal,build",
        "--format", "{p}"], text=True)
    used = {tuple(row.split()[:2]) for row in tree.splitlines()}
    cargo = Path(os.environ.get("CARGO_HOME", Path.home() / ".cargo"))
    inventory = {}
    for package in tomllib.loads(Path("Cargo.lock").read_text())["package"]:
        name, version = package["name"], package["version"]
        if "checksum" not in package or (name, "v" + version) not in used:
            continue
        filename = f"{name}-{version}.crate"
        candidates = [ROOT / "dependencies" / filename, *cargo.glob("registry/cache/*/" + filename)]
        archive = next((p for p in candidates if p.is_file()), None)
        if archive is None:
            raise SystemExit("Missing checked crate source " + filename)
        data = archive.read_bytes()
        if digest(data) != package["checksum"]:
            raise SystemExit("Checksum mismatch " + filename)
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as crate:
            manifest = tomllib.loads(crate.extractfile(f"{name}-{version}/Cargo.toml").read().decode())
        info = manifest["package"]
        inventory[f"{name} {version}"] = {
            "license": info.get("license", info.get("license-file")),
            "sha256": package["checksum"],
        }
        add_bytes(tar, "dependencies/" + filename, data)
    listing = (json.dumps(inventory, indent=2, sort_keys=True) + "\n").encode()
    add_bytes(tar, "dependencies/inventory.json", listing)
    (RELEASE / "dependencies.json").write_bytes(listing)
    return len(inventory)

with ARCHIVE.open("wb") as out, gzip.GzipFile(fileobj=out, filename="", mode="wb", mtime=0, compresslevel=6) as gz:
    with tarfile.open(fileobj=gz, mode="w|") as tar:
        for path in project_inputs():
            add_bytes(tar, path, path.read_bytes(), 0o755 if os.access(path, os.X_OK) else 0o644)
        dep_count = add_dependencies(tar)

licenses = RELEASE / "licenses"
licenses.mkdir(exist_ok=True)
for source in NOTICES:
    shutil.copyfile(source, licenses / source.name)

links = "".join(f"<li><a href='licenses/{html.escape(p.name)}'>{html.escape(p.name)}</a></li>"
                for p in sorted(NOTICES, key=lambda p: p.name))
(RELEASE / "notices.html").write_text("""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Temblor · Licenses</title><link rel="stylesheet" href="arena.css">
<main style="max-width:65ch;margin:5vh auto;padding:24px;line-height:1.6">
<a href="./">Back to Temblor</a><h1 style="font-size:3.5rem;margin:28px 0">Licenses</h1>
<p>Temblor is licensed under GPL-2.0-or-later. Trial by Error was created by Robert P. Gove Jr. and retextured for OpenArena.
The archive includes the editable map, source media, build scripts and the Rust dependencies used for this build.</p>
<p><a href="temblor-source.tar.gz" download>Download corresponding source</a> · <a href="dependencies.json">Dependency licenses</a></p>
<ul>""" + links + "</ul></main></html>")

public = set(HOST + ["arena.pk3", "arena.jpg", "pkg/temblor.js", "pkg/temblor_bg.wasm",
                     "temblor-source.tar.gz", "dependencies.json", "notices.html"])
public.update("licenses/" + p.name for p in NOTICES)
actual = {p.relative_to(RELEASE).as_posix() for p in RELEASE.rglob("*")
          if p.is_file() and p.name != ".DS_Store" and p.name != "build.json"}
if actual != public:
    raise SystemExit(f"Unexpected release contents. Extra {sorted(actual-public)}, missing {sorted(public-actual)}")
files = {}
for name in sorted(public):
    path = RELEASE / name
    files[name] = {"bytes": path.stat().st_size, "sha256": digest(path.read_bytes())}
revision_inputs = [Path("Cargo.toml"), Path("Cargo.lock"), Path("assets/manifest.json"),
                   Path("scripts/build.sh"), Path("scripts/compile.py"), Path("scripts/pack.py")]
revision_inputs += list(Path("src").glob("*.rs")) + list(Path("src").glob("*.wgsl"))
revision_inputs += [Path("web") / name for name in HOST]
revision = digest("".join(f"{digest(path.read_bytes())}  {path}\n" for path in sorted(revision_inputs)).encode())
record = {"engine": "Temblor 0.1.0", "sourceRevision": revision, "rustc": subprocess.check_output(["rustc", "-V"], text=True).strip(),
          "bindgen": "0.2.114", "files": files}
(RELEASE / "build.json").write_text(json.dumps(record, indent=2) + "\n")
print(f"Corresponding source: {ARCHIVE.stat().st_size} bytes, {dep_count} crate packages")
