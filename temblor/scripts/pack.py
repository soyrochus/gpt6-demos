#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Build only the audited allowlist. Never scan for installed game files."""
import hashlib, json, pathlib, zipfile
root = pathlib.Path(__file__).resolve().parents[1] / "assets"
with zipfile.ZipFile(root/"arena.pk3", "w") as arena, zipfile.ZipFile(root/"actors.pk3", "w") as actors:
    for item in sorted(json.loads((root/"manifest.json").read_text()), key=lambda i: i["path"]):
        path = item["path"]
        data = (root/"source"/path).read_bytes()
        if hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise ValueError(f"changed input {path}")
        if path.startswith(("editable/", "levelshots/")):
            continue
        package = actors if path.startswith("models/") else arena
        package.writestr(zipfile.ZipInfo(path), data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
