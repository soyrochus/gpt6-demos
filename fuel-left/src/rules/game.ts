import { RULES as R } from "./constants";
import { World, type Switches } from "../sim/world";
import { colors, type Event, type Bank } from "../table/layout";
import { bankMask, lights, rotate } from "./lights";
import {
  initialMission,
  missionReducer,
  type MissionEvent,
  type Signal,
} from "./missions";
import { bonusValue, endBonus, jackpot, points, skillShot } from "./score";
export type Phase =
  "attract" | "ballHeld" | "simulating" | "tiltDrain" | "ballEnd" | "gameOver";
export type Cue =
  | "up"
  | "down"
  | "plunge"
  | "charge"
  | "bumper"
  | "sling"
  | "target"
  | "spin"
  | "ramp"
  | "hole"
  | "accept"
  | "complete"
  | "rank"
  | "tilt"
  | "drain"
  | "jackpot";
function player() {
  return {
    score: 0,
    ball: 1,
    extra: 0,
    time: 0,
    mission: initialMission(),
    lights: lights(),
  };
}
export class Game implements Switches {
  players = [player()];
  index = 0;
  count = 1;
  phase: Phase = "attract";
  paused = false;
  tilted = false;
  tilt = 0;
  foul = false;
  world: World;
  seed: number;
  reduced = false;
  idle = 0;
  saveUntil = 0;
  saveUsed = false;
  relaunch = false;
  message = "";
  messageUntil = 0;
  bonus = 0;
  bonusTime = 0;
  private fuelTime = 0;
  nudgeHolds = [-1, -1, -1];
  onCue: (cue: Cue, x?: number, level?: number) => void = () => {};
  constructor(seed: number = R.seed) {
    this.seed = seed;
    this.world = new World((e) => this.handle(e), this, seed);
  }
  get p() {
    return this.players[this.index];
  }
  get l() {
    return this.p.lights;
  }
  get post() {
    return this.p.time < this.l.postEnd;
  }
  get well() {
    return !this.tilted && this.p.time < this.l.wellEnd;
  }
  get open() {
    return this.l.open;
  }
  get exit() {
    return this.l.exit;
  }
  isDown(bank: string, i: number) {
    return (
      (bank === "medal" || bank === "booster" || bank === "multiplier") &&
      this.l.drops[bank][i] > this.p.time
    );
  }
  kicker(i: number) {
    return !this.tilted && Boolean(this.l.kickers & (1 << i));
  }
  get multiplier() {
    return R.multipliers[this.l.multiIndex];
  }
  get pendingBonus() {
    return Math.round(
      this.bonus *
        (1 - this.bonusTime / (this.reduced ? R.reducedCount : R.countTime)),
    );
  }
  start(count = this.count) {
    this.count = Math.max(1, Math.min(R.players, Math.trunc(count)));
    this.players = Array.from({ length: this.count }, player);
    this.index = 0;
    this.paused = false;
    this.idle = 0;
    this.world = new World((e) => this.handle(e), this, this.seed);
    this.serve(false);
  }
  private serve(continuation: boolean, replay = continuation) {
    this.phase = "ballHeld";
    this.world.serve();
    this.tilt = this.fuelTime = 0;
    this.tilted = this.foul = false;
    this.nudgeHolds.fill(-1);
    this.relaunch = replay;
    this.saveUntil = 0;
    this.saveUsed = continuation;
    this.message = continuation ? "Ball saved" : "Ready for launch";
    this.messageUntil = this.p.time + R.messageTime;
  }
  pressPlunger() {
    if (this.paused || this.phase === "gameOver") return;
    if (this.phase === "attract") this.start();
    if (this.phase === "ballHeld") {
      this.world.charging = true;
      this.onCue("charge");
    }
  }
  releasePlunger() {
    if (!this.world.charging || this.phase !== "ballHeld" || this.paused)
      return;
    this.world.plunge();
    this.phase = "simulating";
    this.message = "";
    this.onCue("plunge");
  }
  flip(index: number, down: boolean) {
    if (this.paused) return;
    if (down && this.phase === "ballEnd") {
      this.finishBall();
      return;
    }
    if (this.tilted) return;
    if (this.phase !== "simulating" && this.phase !== "ballHeld") return;
    const b = this.world.bats[index];
    if (b.down === down) return;
    b.down = down;
    this.onCue(down ? "up" : "down", b.side);
    if (down) {
      this.l.reentry = rotate(this.l.reentry, index === 0);
      this.l.launch = rotate(this.l.launch, index === 0);
    }
  }
  nudge(index: number, down: boolean) {
    if (!down) {
      this.nudgeHolds[index] = -1;
      return;
    }
    if (
      this.paused ||
      this.tilted ||
      !["ballHeld", "simulating"].includes(this.phase) ||
      this.nudgeHolds[index] >= 0
    )
      return;
    this.nudgeHolds[index] = 0;
    this.world.nudge(
      index === 0 ? -1 : index === 1 ? 1 : 0,
      index === 2 ? 1 : 0,
    );
    this.tilt += R.tiltImpulse;
    this.checkTilt();
  }
  private checkTilt() {
    if (this.tilt >= R.foul) this.foul = true;
    if (this.tilt >= R.tilt && !this.tilted) {
      if (this.world.held) {
        this.world.charge = 0;
        this.world.plunge();
      }
      this.tilted = true;
      this.l.replay = false;
      this.phase = "tiltDrain";
      this.world.bats.forEach((b) => (b.down = false));
      this.onCue("tilt");
      this.say("TILT · Flippers offline");
    } else if (this.tilt >= R.warning && !this.tilted)
      this.say("Nudge warning");
  }
  private say(s: string) {
    this.message = s;
    this.messageUntil = this.p.time + R.messageTime;
  }
  private pay(base: number, multiplied = true) {
    const prev = this.p.score;
    this.p.score += points(base, this.multiplier, multiplied);
    if (prev < R.clockScore && this.p.score >= R.clockScore)
      this.say("Score rolled around the clock");
  }
  private mission(e: MissionEvent) {
    const before = this.p.mission,
      after = missionReducer(before, e);
    this.p.mission = after;
    this.pay(after.awards - before.awards, false);
    if (after.revision !== before.revision) {
      this.say(after.notice);
      if (before.active && after.completed) {
        this.onCue(after.rank > before.rank ? "rank" : "complete");
        if (after.completed === "maelstrom") {
          this.l.extraLit = true;
          this.l.postEnd = this.p.time + R.timed;
        }
      } else if (after.active && !before.active) this.onCue("accept");
    }
  }
  private shot(signal: Signal, count = 1) {
    this.mission({ type: "shot", signal, count, boosted: this.l.mode > 0 });
  }
  tick(dt: number = R.dt) {
    if (this.paused) return;
    if (this.phase === "attract") {
      this.idle += dt;
      return;
    }
    if (this.phase === "gameOver") return;
    if (this.phase === "ballEnd") {
      this.bonusTime -= dt;
      if (this.bonusTime <= 0) this.finishBall();
      return;
    }
    let keys = false,
      held = false;
    for (let i = 0; i < this.nudgeHolds.length; i++)
      if (this.nudgeHolds[i] >= 0) {
        keys = true;
        this.nudgeHolds[i] += dt;
        if (this.nudgeHolds[i] > R.tiltHold) held = true;
      }
    if (!this.tilted) {
      if (held) {
        this.tilt += R.tiltRate * dt;
        this.checkTilt();
      } else if (!keys) this.tilt = Math.max(0, this.tilt - R.tiltDecay * dt);
    }
    if (this.phase !== "ballHeld") {
      this.p.time += dt;
      this.expire();
      if (this.p.mission.active) {
        this.fuelTime += dt;
        if (this.fuelTime >= 0.1 - 1e-10) {
          this.mission({ type: "time", seconds: this.fuelTime });
          this.fuelTime = 0;
        }
      }
    }
    this.world.step(dt);
  }
  private expire() {
    const l = this.l,
      now = this.p.time;
    for (let i = 0; i < 2; i++)
      if (l.level[i] && now >= l.levelEnd[i]) {
        l.level[i]--;
        l.levelEnd[i] = now + R.timed;
        if (i === 1) this.shot("engineDecay");
      }
    if (l.hyper && now >= l.hyperEnd) {
      l.hyper--;
      l.hyperEnd = now + R.timed;
    }
    if (l.multiIndex && now >= l.multiEnd) l.multiIndex = 0;
    if (l.medal && now >= l.medalEnd) l.medal = 0;
  }
  handle(e: Event) {
    if (e.type === "drain") {
      this.drain();
      return;
    }
    if (this.tilted || this.phase === "ballEnd" || this.phase === "gameOver")
      return;
    const l = this.l,
      now = this.p.time;
    switch (e.type) {
      case "deploy": {
        const amount = skillShot(e.highest, e.crest, this.relaunch);
        if (amount) {
          this.pay(amount);
          this.say("Skill shot · " + amount.toLocaleString("en-US"));
        }
        if (!this.saveUsed) {
          this.saveUntil = now + R.saveTime;
          this.saveUsed = true;
        }
        break;
      }
      case "bumper": {
        const level = l.level[e.group === "engine" ? 1 : 0];
        this.pay(R.bumper[e.group === "attack" ? 0 : 1][level]);
        if (e.group !== "engine") this.shot(e.group);
        this.onCue("bumper", this.world.x / (R.width / 2), level);
        break;
      }
      case "sling":
      case "rebound":
        this.pay(R.sling);
        this.shot("rebound");
        this.onCue("sling");
        break;
      case "target":
        this.target(e.bank, e.index);
        this.onCue("target");
        break;
      case "spin":
        this.pay(e.count * (l.mode ? R.boostedSpin : R.spin));
        if (l.open) l.exit = (l.exit + 1) % colors.length;
        this.shot("spin", e.count);
        this.onCue("spin", 0, e.count);
        break;
      case "lane":
        this.lane(e.lane, e.index);
        break;
      case "rampSensor":
        this.reflex();
        this.pay(R.rampSensor);
        this.onCue("ramp");
        this.shot("rampSensor");
        break;
      case "hole":
        this.pay(
          !l.open
            ? R.closedHole
            : e.color === colors[l.exit]
              ? R.matchedHole
              : R.otherHole,
        );
        if (l.open) {
          if (e.color === colors[l.exit]) {
            l.replay = true;
            this.say("Replay armed");
          }
          this.shot(e.color);
        }
        this.onCue("hole");
        break;
      case "hyper": {
        this.reflex();
        l.hyper++;
        this.pay(R.hyperAwards[l.hyper - 1], false);
        l.hyperEnd = now + R.timed;
        this.say("Hyperspace bonus");
        if (l.hyper === 2 && l.mode >= 2) {
          this.pay(jackpot(l.mode), false);
          this.say("Jackpot collected");
          this.onCue("jackpot");
        }
        if (l.hyper === 3) l.postEnd = now + R.timed;
        if (l.hyper === 4) {
          l.extraLit = true;
          this.say("Extra ball lanes lit");
        }
        if (l.hyper === 5) {
          l.wellEnd = now + R.wellTime;
          l.hyper = 0;
          this.say("Gravity well active");
        }
        this.shot("hyper");
        break;
      }
      case "hyperEject":
        l.reflexEnd = now + R.reflexTime;
        break;
      case "black":
        this.pay(R.blackHole);
        this.shot("black");
        this.onCue("hole");
        break;
      case "well":
        this.pay(R.gravityWell);
        l.wellEnd = 0;
        this.say("Gravity restored");
        this.onCue("hole");
        break;
    }
  }
  private reflex() {
    if (this.l.reflexEnd > this.p.time) {
      this.pay(R.reflex);
      this.l.reflexEnd = 0;
      this.say("Reflex shot");
    }
  }
  private target(bank: Bank, i: number) {
    const l = this.l,
      bit = 1 << i,
      now = this.p.time;
    if (bank === "booster" || bank === "medal" || bank === "multiplier") {
      if (this.isDown(bank, i)) return;
      const drops = l.drops[bank];
      drops[i] = now + R.dropReset;
      const complete = drops.every((t) => t > now);
      this.pay(
        bank === "booster"
          ? complete
            ? R.boosterComplete
            : R.boosterDrop
          : R.drop,
      );
      this.shot("drop");
      if (!complete) return;
      drops.fill(0);
      if (bank === "multiplier") {
        l.multiIndex = Math.min(R.multipliers.length - 1, l.multiIndex + 1);
        l.multiEnd = now + R.timed;
      }
      if (bank === "medal") {
        if (l.medal === R.medalSteps) {
          l.extraLit = true;
          l.medal = 0;
          this.say("Extra ball lanes lit");
        } else l.medal++;
        l.medalEnd = now + R.medalTime;
      }
      if (bank === "booster") {
        l.mode++;
        l.bonus = bonusValue(l.mode);
        this.shot("boost");
      }
      return;
    }
    const playing = !!this.p.mission.active;
    this.pay(bank === "warp" ? R.warpTarget : R.spot);
    this.shot("spot");
    if (bank === "mission") {
      if (!playing) this.mission({ type: "select", index: i });
    } else if (bank === "warp") {
      if (l.open) l.exit = (l.exit + 1) % colors.length;
      else l.open = true;
    } else {
      l.hazards[bank] |= bit;
      if (l.hazards[bank] === bankMask) {
        l.hazards[bank] = 0;
        if (bank === "fuel") this.mission({ type: "fuel" });
        else {
          l.kickers |= bank === "hazardL" ? 1 : 2;
          this.shot(bank);
        }
      }
    }
  }
  private lane(lane: Extract<Event, { type: "lane" }>["lane"], i: number) {
    const l = this.l,
      bit = 1 << i;
    switch (lane) {
      case "reentry":
      case "launch": {
        this.pay(lane === "launch" ? R.launchLane : R.reentry);
        l[lane] ^= bit;
        if (lane === "reentry") this.shot("reentry");
        if (l[lane] === bankMask) {
          const n = lane === "launch" ? 1 : 0;
          l[lane] = 0;
          l.level[n] = Math.min(R.levelMax, l.level[n] + 1);
          l.levelEnd[n] = this.p.time + R.timed;
          this.say(n ? "Engine bumpers upgraded" : "Attack bumpers upgraded");
          this.shot(n ? "engineUp" : "attackUp");
        }
        break;
      }
      case "out":
        this.pay(R.outlane);
        this.shot("out");
        l.kickers &= ~bit;
        break;
      case "return":
        this.pay(l.returns & bit ? R.litReturn : R.returnLane);
        l.returns &= ~bit;
        this.shot("return");
        break;
      case "bonus":
        this.pay(R.bonusLane);
        this.mission({ type: "fuel" });
        this.shot("bonus");
        break;
      case "fuel":
        this.pay(
          i === R.fuelSeconds.length - 1 && !(this.p.mission.fuel & bit)
            ? R.darkTopFuel
            : R.fuelLane,
        );
        this.mission({ type: "fuel", index: i });
        if (i === R.fuelSeconds.length - 1) this.shot("fuelTop");
        break;
      case "warp":
        this.pay(R.spaceWarp);
        l.returns = 3;
        this.shot("warpLane");
        break;
      case "extra":
        if (l.extraLit) {
          l.extraLit = false;
          this.p.extra++;
          this.say("Extra ball collected");
        }
        break;
    }
  }
  drain() {
    if (this.phase === "ballEnd" || this.phase === "gameOver") return;
    this.onCue("drain");
    if (!this.tilted && (this.saveUntil > this.p.time || this.l.replay)) {
      const replay = this.saveUntil <= this.p.time;
      if (replay) this.l.replay = false;
      this.serve(true, replay);
      return;
    }
    this.phase = "ballEnd";
    this.bonus = endBonus(this.l.bonus, this.tilted);
    this.bonusTime = this.reduced ? R.reducedCount : R.countTime;
    this.world.bats.forEach((b) => (b.down = false));
    this.message = this.tilted ? "Tilt · no bonus" : "End of ball bonus";
    this.l.replay = this.l.extraLit = false;
    this.l.returns = 0;
    if (this.bonus && this.l.mode < 4) this.l.bonus = R.bonusBase;
  }
  finishBall() {
    if (this.phase !== "ballEnd") return;
    this.pay(this.bonus, false);
    this.bonus = this.bonusTime = 0;
    if (this.p.extra > 0) {
      this.p.extra--;
      this.serve(false);
      return;
    }
    this.p.ball++;
    if (this.players.every((p) => p.ball > R.balls)) {
      this.phase = "gameOver";
      return;
    }
    this.index = (this.index + 1) % this.count;
    this.serve(false);
  }
  clearInputs() {
    this.world.bats.forEach((b) => (b.down = false));
    this.world.charging = false;
    this.world.charge = 0;
    this.nudgeHolds.fill(-1);
  }
}
