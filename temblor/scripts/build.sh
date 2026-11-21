#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
set -eu
cd "$(dirname "$0")/.."
bindgen=${WASM_BINDGEN:-wasm-bindgen}
test "$("$bindgen" --version)" = "wasm-bindgen 0.2.114" || { echo "Install wasm-bindgen-cli 0.2.114" >&2; exit 1; }
"${PYTHON:-python3}" scripts/pack.py
"${PYTHON:-python3}" scripts/compile.py
mkdir -p release/pkg
"$bindgen" --target web --no-typescript --out-dir release/pkg target/wasm32-unknown-unknown/release/temblor.wasm
cp web/index.html web/arena.css web/host.js web/audio.js web/peek.js release/
cp assets/actors.pk3 assets/arena.pk3 release/
cp assets/source/levelshots/oa_rpg3dm2.jpg release/arena.jpg
"${PYTHON:-python3}" scripts/source.py
