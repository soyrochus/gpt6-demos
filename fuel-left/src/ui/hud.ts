import { Game } from "../rules/game";
import { RULES as R } from "../rules/constants";
import { missions, objective } from "../rules/missions";
import { scoreFace } from "./lettering";
export function byId<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
const fmt = new Intl.NumberFormat("en-US");
export class Hud {
  private score = -1;
  private nodes = new Map<string, HTMLElement>();
  private fuel: HTMLElement[];
  private progress: HTMLElement[];
  private lastCharge = -1;
  constructor(readonly game: Game) {
    for (const el of document.querySelectorAll<HTMLElement>("[id]"))
      this.nodes.set(el.id, el);
    const pips = (id: string, count: number) =>
      Array.from({ length: count }, () =>
        byId(id).appendChild(document.createElement("i")),
      );
    this.fuel = pips("fuel", R.fuelSeconds.length);
    this.progress = pips("progress", R.progressLamps);
  }
  private set(id: string, value: string) {
    const el = this.nodes.get(id)!;
    if (el.textContent !== value) el.textContent = value;
  }
  update(high: number, leaders: string[]) {
    const g = this.game,
      p = g.p,
      m = p.mission,
      w = g.world;
    const score = p.score + (g.phase === "ballEnd" ? g.pendingBonus : 0);
    if (score !== this.score) {
      const d = byId("score");
      d.innerHTML = scoreFace(score);
      d.setAttribute("aria-label", "Score " + fmt.format(score));
      this.score = score;
    }
    this.set("player", "Player " + String(g.index + 1).padStart(2, "0"));
    this.set(
      "ball",
      "Ball " +
        Math.min(R.balls, p.ball) +
        " / " +
        R.balls +
        (p.extra ? " •" : ""),
    );
    this.set("high", fmt.format(high));
    this.set("rank", R.ranks[m.rank]);
    this.set("rank-level", String(m.rank + 1).padStart(2, "0") + " / 09");
    let title = m.active
        ? missions[m.active].name
        : m.armed
          ? missions[m.armed].name + " armed"
          : "Choose a mission",
      line = objective(m);
    if (g.phase === "attract" || g.phase === "ballHeld") {
      title = w.charging ? "Charging plunger" : "Awaiting launch";
      if (g.relaunch) title = "Ball saved";
    }
    if (g.phase === "attract" && g.idle > R.attractTime) {
      const slot =
        Math.floor((g.idle - R.attractTime) / 3) % (2 + leaders.length);
      title =
        slot === 0
          ? "Fuel Left"
          : slot === 1
            ? "Press Space to launch"
            : leaders[slot - 2];
    }
    if (g.phase === "simulating" && g.message && p.time < g.messageUntil)
      title = g.message;
    if (g.tilted) {
      title = "TILT";
      line = "Flippers offline until the next ball.";
    }
    if (g.phase === "ballEnd") {
      title = g.message;
      line = "Bonus " + fmt.format(g.bonus) + " · Flip to continue.";
    }
    if (g.paused) {
      title = "Paused";
      line = "Resume to return to the table.";
    }
    this.set("mission-title", title);
    this.set("objective", line);
    this.set("multi", g.multiplier + "×");
    byId("multi").hidden = g.multiplier === 1;
    let lit = 0;
    this.fuel.forEach((el, i) => {
      const on = !!(m.fuel & (1 << i));
      if (on) lit++;
      el.classList.toggle("on", on);
    });
    this.set("fuel-amount", lit + " / 6");
    this.progress.forEach((el, i) => el.classList.toggle("on", i < m.progress));
    byId("progress").setAttribute(
      "aria-label",
      m.progress + " of " + R.progressLamps + " rank lights",
    );
    const charge = Math.round((w.charge / R.chargeTime) * 100);
    if (charge !== this.lastCharge) {
      byId("plunger").style.setProperty("--charge", charge + "%");
      this.lastCharge = charge;
    }
    this.set(
      "launch-label",
      w.charging
        ? "Release to launch"
        : g.phase === "tiltDrain"
          ? "Tilt"
          : g.phase === "simulating"
            ? "Ball in play"
            : "Launch ball",
    );
    byId<HTMLButtonElement>("plunger").disabled =
      g.paused || !(g.phase === "attract" || g.phase === "ballHeld");
    byId("table-overlay").hidden =
      !g.paused || byId<HTMLDialogElement>("dialog").open;
    byId("pause").setAttribute("aria-label", g.paused ? "Resume" : "Pause");
  }
}
