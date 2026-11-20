#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Validate the recorded six-match run against its shipped runtime and summarize timing."""
import argparse
import json
import math
from pathlib import Path
import statistics

parser = argparse.ArgumentParser()
parser.add_argument("--machine", required=True)
parser.add_argument("--os", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
evidence = root / "evidence"
run = json.loads((evidence / "release-matches.json").read_text())
build = json.loads((root / "release/build.json").read_text())
for name in ("pkg/temblor_bg.wasm", "arena.pk3", "pkg/temblor.js", "host.js", "audio.js"):
    assert build["files"][name] == run["build"]["files"][name], name
matches = run["matches"]
assert len(matches) == 6 and {m["state"]["winner"] for m in matches} == {0, 1}
assert all(max(m["state"]["scores"]) == 5 for m in matches)
assert all(m["resources"] == matches[0]["resources"] for m in matches)
assert not run["errors"]
assert any(e["kind"] == "pickup" and e["actor"] == 0 and e["detail"].startswith("weapon_")
           for m in matches for e in m["events"])

def after_warmup(match):
    elapsed = 0.
    for frame in match["frames"]:
        elapsed += frame
        if elapsed >= 5000:
            yield frame

def sample_rounds(rounds):
    frames, included = [], []
    elapsed = 0.
    for match in rounds:
        included.append(match["round"] + 1)
        for delta in after_warmup(match):
            frames.append(delta)
            elapsed += delta
            if elapsed >= 120000:
                return frames, included
    raise ValueError("Insufficient active match time")

offense = [m for m in matches if m["offense"]]
continuous = next((m for m in offense if sum(m["frames"]) >= 125100), None)
frames, sampled = sample_rounds([continuous] if continuous is not None else offense)
ordered = sorted(frames)
median = round(statistics.median(ordered), 3)
p95 = round(ordered[math.ceil(len(ordered) * .95) - 1], 3)
observations = {
    "fixture": "maps/oa_rpg3dm2.bsp",
    "seed": 1813,
    "machine": args.machine,
    "os": args.os,
    "browser": run["browser"],
    "device": run["device"],
    "wasm": build["files"]["pkg/temblor_bg.wasm"],
    "arena": build["files"]["arena.pk3"],
    "coldNavigationToControlMs": round(run["coldToControlMs"], 1),
    "playToControlMs": round(run["playToControlMs"], 1),
    "resourceTransferBytesExcludingNavigation": sum(i["bytes"] for i in run["transfers"]),
    "finalScoresHumanBot": [m["state"]["scores"] for m in matches],
    "rematches": len(matches) - 1,
    "stableObservedCountsAfterGC": matches[0]["resources"],
    "performance": {
        "matchNumbers": sampled,
        "warmupMsPerMatch": 5000,
        "sampleDurationMs": round(sum(frames), 1),
        "frames": len(frames),
        "medianMs": median,
        "p95Ms": p95,
        "longestFrameMs": round(max(frames), 1),
        "framesOver50Ms": sum(dt > 50 for dt in frames),
        "longestFrameAcrossSixMatchesMs": round(max(max(m["frames"]) for m in matches), 1),
        "targetPassed": median <= 16.7 and p95 <= 33.3,
    },
    "retail": "Open: licensed baseq3 files unavailable",
    "humanPlaytest": "Open: no feedback received",
}
(evidence / "acceptance.json").write_text(json.dumps(observations, indent=2) + "\n")
print(json.dumps(observations, indent=2))
