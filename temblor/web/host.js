// SPDX-License-Identifier: GPL-2.0-or-later
import init, { Engine, Packages } from "./pkg/temblor.js";
import { PeekMap } from "./peek.js";
import { ArenaAudio } from "./audio.js";
const $ = (id) => document.getElementById(id),
  canvas = $("arena"),
  audio = new ArenaAudio(),
  peek = new PeekMap($("peekCanvas"), $("peekYou"), $("peekBot"));
let resumeAfterPeek = false;
const lobbyLevel = $("lobbyLevel"), controlsLevel = $("controlsLevel");
controlsLevel.replaceChildren(...Array.from(lobbyLevel.options, option => option.cloneNode(true)));
lobbyLevel.value = controlsLevel.value = "3";
for (const select of [lobbyLevel, controlsLevel]) {
  select.addEventListener("change", () => {
    lobbyLevel.value = controlsLevel.value = select.value;
  });
}
let engine,
  actorPack,
  hasMap = false,
  active = false,
  loading = false,
  pending = null,
  selection = 0,
  state,
  info,
  events = [],
  frames = [],
  last = 0,
  simWall = 0,
  queue = [],
  held = new Set(),
  choice = 0,
  feedUntil = 0,
  hitUntil = 0;
const seed =
  Number(new URLSearchParams(location.search).get("seed") || 1813) >>> 0;
const named = () => info?.title || "Trial by Error";
const status = (text) => {
  $("status").textContent = text;
};
const pauseAudio = () => audio.pause();
function size() {
  if (!engine) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width * devicePixelRatio);
  const height = Math.max(1, rect.height * devicePixelRatio);
  const limit = engine.surface_limit();
  const maxWidth = $("resolution").value === "performance" ? Math.min(limit, 1280) : limit;
  const scale = Math.min(1, maxWidth / width, limit / height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  engine.resize(w, h);
}
new ResizeObserver(size).observe(canvas);
document.addEventListener("fullscreenchange", size);
$("resolution").addEventListener("change", size);
function watchScale() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", () => {
    size();
    watchScale();
  }, { once: true });
}
watchScale();
async function actors() {
  if (!actorPack) {
    const response = await fetch("actors.pk3");
    if (!response.ok) throw Error("Character download failed. Click Play to retry.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pack = new Packages();
    try { pack.mount("temblor-actors.pk3", bytes); }
    catch (e) { pack.free(); throw e; }
    actorPack = pack;
  }
  return actorPack;
}
function clearInput() {
  held.clear();
  queue = [];
  choice = 0;
  $("board").hidden = true;
}
function pause(message = "Click Resume to capture the mouse.") {
  if (active && state?.winner == null) engine.release_controls();
  active = false;
  clearInput();
  pauseAudio();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  $("menu").hidden = false;
  $("hud").hidden = true;
  $("menu").classList.toggle("paused", hasMap);
  if (hasMap) {
    const ended = state?.winner != null;
    $("title").textContent = ended
      ? state.winner === 0
        ? "You win"
        : "Bot wins"
      : "Paused";
    $("subtitle").textContent = ended
      ? named() + "  /  Final score " + state.scores.join(" – ")
      : named() + "  /  " + state.scores.join(" – ");
    $("play").firstChild.textContent = ended ? "Rematch " : "Resume ";
  }
  status(message);
}
async function probe() {
  try {
    if (!isSecureContext)
      throw Error("WebGPU requires a secure connection. Open Temblor on HTTPS or localhost.");
    if (!navigator.gpu)
      throw Error("WebGPU is unavailable in this browser. Open Temblor in desktop Chromium.");
    await init();
    engine = await Engine.create(canvas);
    size();
    status("");
  } catch (e) {
    status(String(e));
  } finally {
    $("play").disabled = false;
  }
}
probe();
function resetPresentation() {
  events = [];
  frames = [];
  hitUntil = 0;
  feedUntil = 0;
  $("feed").textContent = "";
  $("reticle").classList.remove("hit");
}
function begin() {
  engine.set_bot_level(Number(lobbyLevel.value));
  active = true;
  clearInput();
  last = simWall = performance.now();
  $("menu").hidden = true;
  $("hud").hidden = false;
  $("mapname").textContent = named();
  state = JSON.parse(engine.snapshot());
  drawHUD();
}
async function play(local = false) {
  if (loading) return;
  loading = true;
  $("play").disabled = true;
  $("enter").disabled = true;
  let pack = null;
  const wasEnded = state?.winner != null;
  try {
    if (!engine) {
      await probe();
      if (!engine) return;
    }
    if (local) $("files").close();
    let lock = canvas.requestPointerLock();
    const unlock = audio.unlock().catch(() => {});
    await lock;
    await unlock;
    if (document.pointerLockElement !== canvas)
      throw Error("Mouse capture was denied. Click Play or Resume to retry.");
    if (local || !hasMap) {
      status("Loading arena…");
      await new Promise(requestAnimationFrame);
      let name;
      if (local) {
        pack = pending;
        name = $("maps").value;
      } else {
        pack = new Packages();
        const r = await fetch("arena.pk3");
        if (!r.ok) throw Error("Arena download failed. Click Play to retry.");
        pack.mount("temblor-arena.pk3", new Uint8Array(await r.arrayBuffer()));
        name = "maps/oa_rpg3dm2.bsp";
      }
      const speakers = JSON.parse(pack.speakers(name));
      const sounds = await audio.prepare(speakers, pack);
      info = JSON.parse(engine.load(pack, await actors(), name, seed));
      info.speakers = speakers;
      peek.clear();
      $("peekButton").disabled = false;
      $("details").hidden = false;
      audio.replace(sounds);
      hasMap = true;
      resetPresentation();
      if (local) {
        pending = null;
        $("archives").value = "";
        $("maprow").hidden = true;
      }
    } else if (wasEnded) {
      engine.rematch();
      resetPresentation();
    }
    if (document.pointerLockElement !== canvas || document.hidden)
      throw Error("Mouse capture ended. Click Resume to continue.");
    begin();
  } catch (e) {
    pause(String(e) + "  Click " + (hasMap ? "Resume" : "Play") + " to retry.");
    if (local) {
      $("importStatus").textContent = String(e);
      $("files").showModal();
    }
  } finally {
    if (pack && pack !== pending) pack.free();
    loading = false;
    $("play").disabled = false;
    $("enter").disabled = !pending;
  }
}
$("details").onclick = () => {
  $("inventoryText").textContent = JSON.stringify(info, null, 2);
  $("inventory").showModal();
};
$("play").onclick = () => play();
$("help").onclick = () => $("controls").showModal();
function openPeek() {
  if (!hasMap || $("peek").open) return;
  resumeAfterPeek = active;
  if (active) pause();
  $("peekMapName").textContent = named();
  $("peek").showModal();
  peek.open(engine, JSON.parse(engine.snapshot()));
  $("peekCanvas").focus();
}
function closePeek() {
  if (!$("peek").open) return;
  $("peek").close();
  if (resumeAfterPeek) {
    resumeAfterPeek = false;
    // Request mouse capture inside the closing key or button gesture.
    void play();
  } else {
    $("peekButton").focus();
  }
}
$("peekButton").onclick = openPeek;
$("closePeek").onclick = closePeek;
$("peek").addEventListener("cancel", e => {
  e.preventDefault();
  closePeek();
});
$("import").onclick = () => $("files").showModal();
$("enter").onclick = () => play(true);
$("archives").onchange = async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  const token = ++selection;
  pending?.free();
  pending = null;
  $("enter").disabled = true;
  $("maprow").hidden = true;
  let packs;
  try {
    if (!engine)
      throw Error(
        "WebGPU initialization is required. Close this dialog and retry Play.",
      );
    packs = new Packages();
    let sum = 0;
    for (const f of files) {
      sum += f.size;
      if (f.size > 600e6 || sum > 850e6)
        throw Error("Selected files exceed the local memory budget.");
      $("importStatus").textContent = "Reading " + f.name + "…";
      packs.mount(f.name, new Uint8Array(await f.arrayBuffer()));
    }
    if (token !== selection) return;
    const maps = JSON.parse(packs.maps()).filter(
      (m) => m === "maps/q3dm1.bsp" || m === "maps/oa_rpg3dm2.bsp",
    );
    if (!maps.length)
      throw Error(
        "No supported map found. Select the archives containing maps/q3dm1.bsp or maps/oa_rpg3dm2.bsp.",
      );
    $("maps").replaceChildren(...maps.map((m) => new Option(m, m)));
    pending = packs;
    packs = null;
    $("maprow").hidden = false;
    $("enter").disabled = false;
    $("importStatus").textContent = "Ready to check map dependencies.";
  } catch (e) {
    if (token === selection) $("importStatus").textContent = String(e);
  } finally {
    packs?.free();
  }
};
$("files").addEventListener("close", () => {
  selection++;
  if (!loading) {
    pending?.free();
    pending = null;
    $("archives").value = "";
    $("maprow").hidden = true;
    $("enter").disabled = true;
    $("importStatus").textContent = "";
  }
});
document.addEventListener("pointerlockchange", () => {
  if (active && document.pointerLockElement !== canvas) pause();
});
document.addEventListener("pointerlockerror", () => {
  if (!loading) pause("Mouse capture was denied. Click Resume to retry.");
});
addEventListener("blur", () => {
  if (active) pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && active) pause();
});
function input(e) {
  if (active) queue.push({ t: performance.now(), ...e });
}
addEventListener("keydown", (e) => {
  if (e.code === "KeyP" && hasMap && (active || $("peek").open || $("controls").open)) {
    e.preventDefault();
    if (!e.repeat) {
      if ($("peek").open) closePeek();
      else openPeek();
    }
    return;
  }
  if (!active) return;
  if (
    ["Space", "Tab", "Escape", "KeyW", "KeyA", "KeyS", "KeyD", "KeyC"].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Escape") {
    pause();
    return;
  }
  if (e.code === "Tab") $("board").hidden = false;
  input({ key: e.code, down: true });
});
addEventListener("keyup", (e) => {
  if (e.code === "Tab") $("board").hidden = true;
  input({ key: e.code, down: false });
});
document.addEventListener("mousemove", (e) => {
  if (active) {
    const s = Number($("sensitivity").value) * 0.0022;
    input({ dx: -e.movementX * s, dy: -e.movementY * s });
  }
});
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) input({ key: "Fire", down: true });
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) input({ key: "Fire", down: false });
});
canvas.oncontextmenu = (e) => e.preventDefault();
canvas.addEventListener(
  "wheel",
  (e) => {
    if (!active) return;
    e.preventDefault();
    input({ wheel: Math.sign(e.deltaY) });
  },
  { passive: false },
);
function step(t) {
  let dx = 0,
    dy = 0,
    pressed = 0;
  while (queue.length && queue[0].t <= t) {
    const e = queue.shift();
    if (e.key) {
      if (e.down) {
        held.add(e.key);
        if (e.key === "Fire") pressed |= 4;
        if (e.key === "Space") pressed |= 1;
        if (/^Digit[1-9]$/.test(e.key)) choice = Number(e.key.slice(-1));
      } else held.delete(e.key);
    }
    if (e.dx !== undefined) {
      dx += e.dx;
      dy += e.dy;
    }
    if (e.wheel) {
      const guns = state.owned.flatMap((x, i) => (x ? [i] : []));
      choice =
        guns[
          (guns.indexOf(choice || state.gun) + e.wheel + guns.length) %
            guns.length
        ];
    }
  }
  engine.tick(
    Number(held.has("KeyW")) - Number(held.has("KeyS")),
    Number(held.has("KeyD")) - Number(held.has("KeyA")),
    dx,
    dy,
    pressed |
      (held.has("Space") ? 1 : 0) |
      (held.has("KeyC") ? 2 : 0) |
      (held.has("Fire") ? 4 : 0),
    choice,
  );
  if (choice && state.gun === choice) choice = 0;
}
function drawHUD() {
  const values = {
    hp: state.health,
    armor: state.armor,
    ammo: state.gun === 1 ? "∞" : state.ammo,
    weapon: state.weapon,
    you: state.scores[0],
    bot: state.scores[1],
    timer:
      Math.floor(state.ms / 60000) +
      ":" +
      String(Math.floor(state.ms / 1000) % 60).padStart(2, "0"),
    board: "You  " + state.scores[0] + "     /     Bot  " + state.scores[1],
  };
  for (const [id, v] of Object.entries(values)) {
    const el = $(id);
    if (el.textContent !== String(v)) el.textContent = v;
  }
  $("death").hidden = state.health > 0;
  $("reticle").classList.toggle("hit", state.ms < hitUntil);
  if (state.ms >= feedUntil) $("feed").textContent = "";
}
function frame(t) {
  if (active) {
    try {
      const delta = t - last;
      if (delta > 0) {
        frames.push(delta);
        if (frames.length > 24000) frames.splice(0, 12000);
      }
      last = t;
      if (t - simWall > 120) simWall = t - 120;
      while (simWall + 8 <= t) {
        simWall += 8;
        step(simWall);
      }
      engine.frame(Math.min(1, Math.max(0, (t - simWall) / 8)));
      state = JSON.parse(engine.snapshot());
      audio.position(state, +$("volume").value);
      const batch = JSON.parse(engine.events());
      for (const e of batch) {
        audio.play(e, state, +$("volume").value);
        events.push(e);
        if (e.kind === "pain" && e.actor === 1) hitUntil = e.ms + 150;
        if (e.kind === "frag" || (e.kind === "pickup" && e.actor === 0)) {
          $("feed").textContent =
            e.kind === "frag"
              ? e.actor === 0
                ? "You fragged the bot"
                : "Bot fragged you"
              : e.detail
                  .replace(/^(item_|weapon_|ammo_)/, "")
                  .replaceAll("_", " ");
          feedUntil = e.ms + 1500;
        }
      }
      if (events.length > 12000) events.splice(0, 6000);
      drawHUD();
      if (state.winner !== null) pause("First to five frags.");
    } catch (e) {
      pause(String(e));
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Read-only telemetry for replay inspection. Simulation accepts ordinary DOM input only.
Object.defineProperty(window, "temblorReport", {
  value: Object.freeze({
    get active() {
      return active;
    },
    get state() {
      return structuredClone(state);
    },
    get info() {
      return structuredClone(info);
    },
    get events() {
      return structuredClone(events);
    },
    get frames() {
      return [...frames];
    },
    seed,
    get resolution() {
      return [canvas.width, canvas.height];
    },
    get display() { return {mode: $("resolution").value, css: [canvas.clientWidth, canvas.clientHeight], limit: engine?.surface_limit(), fovY: 76}; },
    get dpr() {
      return devicePixelRatio;
    },
  }),
});

export const inspectRoute = (p) => JSON.parse(engine.route(...p));
export const inspectItems = () => JSON.parse(engine.items());
