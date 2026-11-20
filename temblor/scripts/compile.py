#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Keep checkout and toolchain installation paths outside shipping Wasm."""
import os
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
sysroot = subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip()
registry = Path(os.environ.get("CARGO_HOME", Path.home()/".cargo")).resolve()
flags = [f"--remap-path-prefix={root}=/temblor", f"--remap-path-prefix={registry}=/cargo", f"--remap-path-prefix={sysroot}=/rust"]
env=dict(os.environ, CARGO_ENCODED_RUSTFLAGS="\x1f".join(flags))
subprocess.run(["cargo","build","--locked","--release","--lib","--target","wasm32-unknown-unknown","--target-dir","target"],check=True,cwd=root,env=env)
