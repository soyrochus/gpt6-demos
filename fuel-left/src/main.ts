import "./ui/style.css";
import { Game } from "./rules/game";
import { RULES as R } from "./rules/constants";
import { readScores } from "./rules/score";
import { TableView } from "./render/scene";
import { lampIntensity } from "./render/lamps";
import { AudioDesk } from "./audio/sfx";
import { Hud, byId } from "./ui/hud";
import { icon } from "./ui/icons";
import {
  Inputs,
  defaults,
  names,
  keyName,
  store,
  type Action,
} from "./input/keys";
import { installTouch } from "./ui/touch";
const game = new Game(),
  audio = new AudioDesk(),
  hud = new Hud(game);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
game.reduced = reduced.matches;
reduced.addEventListener("change", () => (game.reduced = reduced.matches));
game.onCue = (cue, x, level) => audio.play(cue, x, level);
document
  .querySelectorAll<HTMLElement>("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon!)));
const canvas = byId<HTMLCanvasElement>("table"),
  dialog = byId<HTMLDialogElement>("dialog"),
  body = byId("dialog-body");
let view: TableView | undefined;
try {
  view = new TableView(canvas);
} catch (error) {
  byId("render-error").hidden = false;
  console.error("Unable to initialize table", error);
}
let saved: string | null = null;
try {
  saved = localStorage.getItem(R.scoreKey);
} catch {}
let scores = readScores(saved),
  leaders: string[] = [];
function refreshLeaders() {
  leaders = scores.map(
    (r, i) =>
      i + 1 + ". " + (r.name || "Player") + " · " + r.score.toLocaleString(),
  );
}
refreshLeaders();
let restorePause = false,
  editing: Action | null = null,
  qualifiers: number[] = [],
  recording = false;
const inputs = new Inputs(action);
function clear() {
  inputs.clear();
  game.clearInputs();
  audio.releaseSpring();
}
function show(title: string, html: string) {
  clear();
  if (!dialog.open) {
    restorePause = game.paused;
    game.paused = true;
  }
  byId("dialog-title").textContent = title;
  body.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function close() {
  if (dialog.open) dialog.close();
}
dialog.addEventListener("close", () => {
  editing = null;
  game.paused = restorePause;
  if (recording) {
    recording = false;
    nextScore();
  }
});
byId("close").onclick = close;
function pause() {
  if (dialog.open || game.phase === "gameOver") return;
  clear();
  game.paused = !game.paused;
}
function keyLabels() {
  document
    .querySelectorAll<HTMLElement>("[data-key]")
    .forEach(
      (el) => (el.textContent = keyName(inputs.keys[el.dataset.key as Action])),
    );
}
function controls() {
  show(
    "Controls",
    '<p>Hold the plunger to charge and release to launch. A partial plunge can earn a skill shot. Three quick nudges tilt the table.</p><div id="bindings"></div><p id="key-hint">Select a binding to change it. The left and right Shift keys also operate the flippers.</p><button id="restore" class="dialog-button">Restore defaults</button><small>An original homage to 1990s desktop pinball. Not affiliated with the original publishers.</small>',
  );
  const bindings = byId("bindings");
  for (const a of Object.keys(names) as Action[]) {
    const row = document.createElement("div"),
      button = document.createElement("button");
    row.className = "mapping";
    row.append(names[a], button);
    button.textContent = keyName(inputs.keys[a]);
    button.setAttribute("aria-label", "Remap " + names[a]);
    button.onclick = () => {
      editing = a;
      byId("key-hint").textContent =
        "Press a key for " + names[a].toLowerCase() + ". Escape cancels.";
      button.textContent = "Press key";
    };
    bindings.append(row);
  }
  byId("restore").onclick = () => {
    inputs.keys = { ...defaults };
    store(R.keyKey, inputs.keys);
    editing = null;
    controls();
    keyLabels();
  };
}
function newGame() {
  if (game.phase === "attract") {
    game.start();
    return;
  }
  show(
    "Start a new game?",
    '<p>The current round will end for all players.</p><button id="restart" class="primary">Start new game</button>',
  );
  byId("restart").onclick = () => {
    restorePause = false;
    close();
    game.start();
  };
}
function players() {
  let chosen = game.count;
  show(
    "Players",
    '<p>Take turns on the same table. Each player gets three balls and keeps their own mission, rank and score.</p><div class="selections"></div><button id="start-game" class="primary">Start game</button>',
  );
  const list = body.querySelector(".selections")!;
  for (let i = 1; i <= R.players; i++) {
    const b = document.createElement("button");
    b.className = "dialog-button";
    b.textContent = String(i);
    b.setAttribute("aria-label", i + " player" + (i === 1 ? "" : "s"));
    b.setAttribute("aria-pressed", String(i === chosen));
    b.onclick = () => {
      chosen = i;
      for (const item of list.children)
        item.setAttribute("aria-pressed", String(item === b));
    };
    list.append(b);
  }
  byId("start-game").onclick = () => {
    restorePause = false;
    close();
    game.start(chosen);
  };
}
function nextScore() {
  while (qualifiers.length) {
    const i = qualifiers.shift()!,
      score = game.players[i].score;
    if (scores.length >= R.scores && score <= scores[scores.length - 1].score)
      continue;
    recording = true;
    show(
      "High score",
      '<form id="record"><p id="result"></p><label for="callsign">Player name</label><input id="callsign" maxlength="12" autocomplete="off"><button class="primary" type="submit">Save score</button></form>',
    );
    byId("result").textContent =
      "Player " + (i + 1) + " · " + score.toLocaleString() + " points";
    const input = byId<HTMLInputElement>("callsign");
    input.focus();
    byId("record").onsubmit = (e) => {
      e.preventDefault();
      scores = readScores(
        JSON.stringify([
          ...scores,
          { name: input.value.trim() || "Player " + (i + 1), score },
        ]),
      );
      store(R.scoreKey, scores);
      refreshLeaders();
      close();
    };
    return;
  }
  game.start(game.count);
  game.phase = "attract";
  game.idle = 0;
  game.paused = false;
  restorePause = false;
}
function action(a: Action, down: boolean) {
  if (dialog.open) return;
  switch (a) {
    case "left":
    case "right":
      game.flip(a === "left" ? 0 : 1, down);
      break;
    case "plunger":
      if (down) game.pressPlunger();
      else game.releasePlunger();
      break;
    case "nudgeLeft":
    case "nudgeRight":
    case "nudgeUp":
      game.nudge(a === "nudgeLeft" ? 0 : a === "nudgeRight" ? 1 : 2, down);
      break;
    case "pause":
      if (down) pause();
      break;
    case "controls":
      if (down) controls();
      break;
    case "newGame":
      if (down) newGame();
      break;
  }
}
byId("sound").onclick = () => {
  audio.unlock();
  audio.setSound(!audio.sound);
  byId("sound").setAttribute("aria-pressed", String(audio.sound));
};
byId("music").onclick = () => {
  audio.unlock();
  audio.setMusic(!audio.music);
  byId("music").setAttribute("aria-pressed", String(audio.music));
};
byId("controls").onclick = controls;
byId("players").onclick = players;
byId("new").onclick = newGame;
byId("pause").onclick = pause;
byId("resume").onclick = pause;
keyLabels();
installTouch(canvas, inputs, () => audio.unlock());
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (dialog.open) {
    if (editing) {
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === "Escape" || inputs.remap(editing, e.code)) {
        editing = null;
        controls();
        keyLabels();
      }
    }
    return;
  }
  if (e.code === "KeyP" && new URLSearchParams(location.search).has("debug")) {
    game.world.debugPost = !game.world.debugPost;
    return;
  }
  if (
    e.target instanceof HTMLButtonElement &&
    (e.code === "Space" || e.code === "Enter")
  )
    return;
  const a = inputs.key(e.code);
  if (!a) return;
  e.preventDefault();
  if (e.repeat) return;
  audio.unlock();
  inputs.hold("k" + e.code, a);
});
addEventListener("keyup", (e) => inputs.release("k" + e.code));
function away() {
  clear();
  if (
    !dialog.open &&
    (game.phase === "simulating" || game.phase === "tiltDrain")
  )
    game.paused = true;
}
addEventListener("blur", away);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) away();
  last = performance.now();
  acc = 0;
});
let last = performance.now(),
  acc = 0;
function frame(now: number) {
  acc += Math.min(0.15, (now - last) / 1000);
  last = now;
  while (acc >= R.dt) {
    game.tick(R.dt);
    acc -= R.dt;
  }
  if (game.phase === "gameOver" && !recording && !dialog.open) {
    qualifiers = game.players
      .map((_, i) => i)
      .sort((a, b) => game.players[b].score - game.players[a].score);
    nextScore();
  }
  view?.draw(
    game.world,
    acc / R.dt,
    lights,
    game.reduced,
    game.l.level,
    game.phase === "attract" && game.idle > R.attractTime,
  );
  hud.update(scores[0]?.score ?? 0, leaders);
  audio.update(game.paused);
  requestAnimationFrame(frame);
}
const lights = (group: string, i: number) => lampIntensity(game, group, i);
requestAnimationFrame(frame);
