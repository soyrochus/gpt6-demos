#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Generate the release inventory, dependency source links and notices."""
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
RELEASE = Path("release")
SOURCE_URL = "https://github.com/soyrochus/gpt6-demos/tree/main/temblor"
HOST = ["index.html", "arena.css", "host.js", "audio.js"]
NOTICES = [Path("COPYING"), Path("notices/ENGINE.md"), Path("assets/manifest.json"),
           Path("assets/source/editable/rpg3dm2source.txt")]
for package in ("maps", "misc", "textures", "data", "players"):
    NOTICES.append(Path(f"notices/openarena-{package}.copyright"))
for pack in ("pak0", "pak1-maps", "pak2-players", "pak4-textures", "pak6-misc"):
    for notice in ("COPYING", "CREDITS", "CREDITS-0.8.5"):
        path = Path(f"notices/{pack}-{notice}")
        if path.exists():
            NOTICES.append(path)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def dependency_inventory():
    tree = subprocess.check_output(["cargo", "tree", "--locked", "--offline", "--target",
        "wasm32-unknown-unknown", "--prefix", "none", "-e", "normal,build",
        "--format", "{p}"], text=True)
    used = {tuple(row.split()[:2]) for row in tree.splitlines()}
    packages = json.loads(subprocess.check_output(["cargo", "metadata", "--locked", "--offline",
        "--filter-platform", "wasm32-unknown-unknown", "--format-version", "1"], text=True))["packages"]
    metadata = {(p["name"], p["version"]): p for p in packages}
    inventory = {}
    for package in tomllib.loads(Path("Cargo.lock").read_text())["package"]:
        name, version = package["name"], package["version"]
        if "checksum" not in package or (name, "v" + version) not in used:
            continue
        filename = f"{name}-{version}.crate"
        manifest = metadata[(name, version)]
        inventory[f"{name} {version}"] = {
            "license": manifest["license"] or manifest["license_file"],
            "sha256": package["checksum"],
            "source": f"https://static.crates.io/crates/{name}/{filename}",
        }
    listing = (json.dumps(inventory, indent=2, sort_keys=True) + "\n").encode()
    (RELEASE / "dependencies.json").write_bytes(listing)
    return len(inventory)

dep_count = dependency_inventory()

licenses = RELEASE / "licenses"
licenses.mkdir(exist_ok=True)
for source in NOTICES:
    shutil.copyfile(source, licenses / source.name)

links = "".join(f"<li><a href='licenses/{html.escape(p.name)}'>{html.escape(p.name)}</a></li>"
                for p in sorted(NOTICES, key=lambda p: p.name))
(RELEASE / "notices.html").write_text(f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Temblor · Licenses</title><link rel="stylesheet" href="arena.css">
<main style="max-width:65ch;margin:5vh auto;padding:24px;line-height:1.6">
<a href="./">Back to Temblor</a><h1 style="font-size:3.5rem;margin:28px 0">Licenses</h1>
<p>Temblor is licensed under GPL-2.0-or-later. Trial by Error was created by Robert P. Gove Jr. and retextured for OpenArena.
The repository includes the editable map, source media, build scripts and Cargo.lock. The dependency inventory links to the source of each Rust crate used in this build.</p>
<p><a href="{SOURCE_URL}">Source on GitHub</a> · <a href="dependencies.json">Dependency licenses</a></p>
<ul>""" + links + "</ul></main></html>")

public = set(HOST + ["actors.pk3", "arena.pk3", "arena.jpg", "pkg/temblor.js", "pkg/temblor_bg.wasm",
                     "dependencies.json", "notices.html"])
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
print(f"Release inventory: {len(files)} files, {dep_count} crate packages")
