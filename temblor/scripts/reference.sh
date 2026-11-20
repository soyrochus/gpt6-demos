#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
set -eu
src=${1:?Pass path to the pinned id-Software/Quake-III-Arena checkout}
test "$(git -C "$src" rev-parse HEAD)" = dbe4ddb10315479fc00086f08e25d968b4b43c49
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
g="$src/code/game"
case "$(uname)" in Darwin) dead="-Wl,-dead_strip";; *) dead="-Wl,--gc-sections";; esac
cc -std=gnu99 -O2 -D__linux__ -ffunction-sections -fdata-sections "$dead" -I"$g" tests/reference/pmove.c "$g/bg_pmove.c" "$g/bg_slidemove.c" "$g/bg_misc.c" "$g/q_math.c" -lm -o "$out/pmove"
"$out/pmove" > "$out/first"
"$out/pmove" > "$out/repeat"
cmp "$out/first" "$out/repeat"
cat "$out/first"
