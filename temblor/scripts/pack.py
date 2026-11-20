#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Build only the audited allowlist. Never scan for installed game files."""
import hashlib, json, pathlib, zipfile
root = pathlib.Path(__file__).resolve().parents[1]
target = root / "assets/arena.pk3"
with zipfile.ZipFile(target, "w") as package:
    for item in sorted(json.loads((root/"assets/manifest.json").read_text()), key=lambda i: i["path"]):
        path = item["path"]
        data = (root/"assets/source"/path).read_bytes()
        if hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise ValueError(f"changed input {path}")
        if path.startswith(("editable/", "levelshots/")):
            continue
        package.writestr(zipfile.ZipInfo(path), data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
print(target.name, hashlib.sha256(target.read_bytes()).hexdigest())
