import { RULES as R, mulberry32 } from "../rules/constants";
import {
  deckMouth,
  deckCrest,
  solids,
  sensors,
  seat,
  crest,
  skillGateY,
  ramp,
  hyper,
  center,
  black,
  colors,
  holes,
  leftFeed,
  rightFeed,
  type Layer,
  type Event,
  type Solid,
  type Point,
} from "../table/layout";
import { Flipper } from "./flipper";
import { sweptContact } from "./geom";
import { SpatialGrid } from "./spatial";

import { Track } from "./track";
const launchTrack = new Track(ramp),
  hyperTrack = new Track(hyper);
const entrances = [launchTrack, hyperTrack];

export interface Switches {
  isDown(bank: string, index: number): boolean;
  kicker(index: number): boolean;
  post: boolean;
  well: boolean;
  open: boolean;
  exit: number;
}
const inactive: Switches = {
  isDown: () => false,
  kicker: () => false,
  post: false,
  well: false,
  open: false,
  exit: 0,
};
export class World {
  x = seat.x;
  y = seat.y;
  prevX = this.x;
  prevY = this.y;
  vx = 0;
  vy = 0;
  layer: Layer = "plunger";
  held = true;
  charge = 0;
  charging = false;
  highest = 0;
  clock = 0;
  readonly bats = [new Flipper(-1), new Flipper(1)] as const;
  private sweep = { nx: 0, ny: 0, depth: 0 };
  private startX = 0;
  private startY = 0;
  private grid = new SpatialGrid(solids);
  private locks = new Float64Array(solids.length);
  private touched = new Uint8Array(solids.length);
  private nx = 0;
  private ny = 0;
  private depth = 0;
  private deck = false;
  private distance = 0;
  private trackSpeed = 0;
  private guided = false;
  private trackOffset = 0;
  private hyperEject = false;
  private captureTime = 0;
  private exitX = 0;
  private exitY = 0;
  private exitVX = 0;
  private exitVY = 0;
  private ignoreCaptureUntil = 0;
  flashes = new Float64Array(solids.length);
  spins = [0, 0];
  shakeLeft = 0;
  debugPost = false;
  nudge(dx: number, dy: number) {
    this.vx += dx * R.nudge;
    this.vy += dy * R.nudge;
    this.shakeLeft = R.shakeTime;
  }
  readonly rng: () => number;
  constructor(
    readonly emit: (e: Event) => void,
    public switches: Switches = inactive,
    seed: number = R.seed,
  ) {
    this.rng = mulberry32(seed);
  }
  serve() {
    this.x = this.prevX = seat.x;
    this.y = this.prevY = seat.y;
    this.vx = this.vy = 0;
    this.layer = "plunger";
    this.held = true;
    this.charging = false;
    this.charge = this.highest = 0;
    this.deck = false;
    this.hyperEject = false;
    this.captureTime = this.shakeLeft = this.ignoreCaptureUntil = 0;
    this.flashes.fill(0);
    this.locks.fill(0);
    this.bats.forEach((b) => (b.down = false));
  }
  plunge() {
    if (!this.held) return;
    this.held = this.charging = false;
    this.vy =
      R.plungeMin +
      R.plungeGain *
        (this.charge < R.tap ? 0 : Math.min(this.charge / R.chargeTime, 1));
    this.charge = 0;
  }
  step(dt: number = R.dt) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.clock += dt;
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    for (const b of this.bats) {
      b.previous = b.angle;
      b.update(dt);
    }
    if (this.held) {
      if (this.charging) this.charge = Math.min(R.chargeTime, this.charge + dt);
      return;
    }
    const n = Math.max(
      1,
      Math.ceil(
        ((Math.hypot(this.vx, this.vy) + R.gravity * dt) * dt) /
          (R.radius * R.subdivision),
      ),
    );
    for (let sub = 0; sub < n && !this.held; sub++) this.advance(dt / n);
  }
  private advance(dt: number) {
    if (this.layer === "captured") {
      this.captureTime -= dt;
      if (this.captureTime <= 0) {
        this.layer = "main";
        this.x = this.prevX = this.exitX;
        this.y = this.prevY = this.exitY;
        this.vx = this.exitVX;
        this.vy = this.exitVY;
        this.ignoreCaptureUntil = this.clock + R.closedHold;
        if (this.hyperEject) {
          this.hyperEject = false;
          this.emit({ type: "hyperEject" });
        }
      }
      return;
    }
    if (this.layer === "ramp" || this.layer === "hyper") {
      this.onTrack(dt);
      return;
    }
    if (this.layer === "plunger") {
      this.vy -= dt * (R.gravity + (this.vy > 0 ? R.sleeveBrake : 0));
      this.vy *= 1 - R.friction * dt;
      this.y += this.vy * dt;
      this.highest = Math.max(
        this.highest,
        Math.min(
          R.chargeLamps,
          Math.floor(
            ((this.y - seat.y) / (crest.y - seat.y)) * R.chargeLamps + 0.6,
          ),
        ),
      );
      const over = this.y >= crest.y && this.vy > R.crestSpeed;
      if (over || (this.vy <= 0 && this.y <= skillGateY)) {
        this.layer = "main";
        this.x = over ? 0.142 : 0.154;
        this.y = over ? crest.y : this.y;
        this.vx = over ? -0.82 : -0.35;
        this.vy = over ? -0.52 : -0.35;
        this.emit({
          type: "deploy",
          highest: Math.max(1, this.highest),
          crest: over,
        });
      } else if (this.y >= crest.y) this.vy = -0.15;
      return;
    }
    if (this.switches.well) {
      const dx = center.x - this.x,
        dy = center.y - this.y,
        d = Math.hypot(dx, dy);
      if (d > 0) {
        this.vx += (dt * R.wellGravity * dx) / d;
        this.vy += (dt * R.wellGravity * dy) / d;
      }
    }
    this.vy -= R.gravity * dt;
    const drag = 1 - R.friction * dt;
    this.vx *= drag;
    this.vy *= drag;
    this.limitSpeed();
    const oldX = this.x,
      oldY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.crossings(oldX, oldY);
    if (this.layer !== "main" || this.enterDevice(oldY)) return;
    this.startX = oldX;
    this.startY = oldY;
    this.resolveSolids();
    if (
      (this.switches.post || this.debugPost) &&
      this.contact(0, 0.02, R.postRadius)
    ) {
      this.x += this.nx * this.depth;
      this.y += this.ny * this.depth;
      const vn = this.vx * this.nx + this.vy * this.ny;
      if (vn < 0) {
        this.vx -= (1 + R.rubber) * vn * this.nx;
        this.vy -= (1 + R.rubber) * vn * this.ny;
      }
    }
    for (const bat of this.bats) {
      const dx = bat.tipX - bat.x,
        dy = bat.tipY;
      const t = Math.min(
        1,
        Math.max(0, ((this.x - bat.x) * dx + this.y * dy) / R.batLength ** 2),
      );
      const rx = t * dx,
        ry = t * dy;
      if (
        !this.contact(
          bat.x + rx,
          ry,
          R.batRadius + (R.tipRadius - R.batRadius) * t,
        )
      )
        continue;
      const sx = -bat.omega * ry,
        sy = bat.omega * rx;
      this.x += this.nx * this.depth;
      this.y += this.ny * this.depth;
      const relative = (this.vx - sx) * this.nx + (this.vy - sy) * this.ny;
      if (relative < 0) {
        const impulse =
            -(1 + (bat.down ? R.batBounce : R.deadBounce)) * relative,
          normal = sx * this.nx + sy * this.ny;
        this.vx += impulse * this.nx + sx - normal * this.nx;
        this.vy += impulse * this.ny + sy - normal * this.ny;
      }
      // The rubber and adjacent guide settle the ball into the heel of a raised bat.
      if (
        bat.progress === 1 &&
        t < 0.42 &&
        this.ny > 0.5 &&
        Math.hypot(this.vx, this.vy) < 0.55
      ) {
        this.vx = this.vy = 0;
      }
    }
    if (this.y < -0.09) {
      this.held = true;
      this.emit({ type: "drain" });
    }
  }
  private capture(hold: number, p: Point, vx: number, vy: number) {
    this.layer = "captured";
    this.captureTime = hold;
    this.exitX = p.x;
    this.exitY = p.y;
    this.exitVX = vx;
    this.exitVY = vy;
    this.vx = this.vy = 0;
  }
  private enterDevice(oldY: number) {
    if (
      oldY <= deckMouth.y &&
      this.y > deckMouth.y &&
      Math.abs(this.x - deckMouth.x) < 0.04 &&
      this.vy > R.rampEntry
    ) {
      this.deck = true;
      this.layer = "ramp";
      return true;
    }
    for (const track of entrances) {
      const p = track.points[0];
      if (oldY <= p.y && this.y > p.y && Math.abs(this.x - p.x) < 0.034) {
        if (this.vy < R.rampEntry) {
          this.y = oldY;
          this.vy = -Math.abs(this.vy) * R.wall;
          return true;
        }
        this.layer = track === launchTrack ? "ramp" : "hyper";
        this.distance = 0;
        this.guided = false;
        this.trackSpeed = Math.hypot(this.vx, this.vy);
        this.trackOffset = this.x - p.x;
        return true;
      }
    }
    if (this.clock < this.ignoreCaptureUntil) return false;
    for (const color of colors) {
      const p = holes[color];
      if (Math.hypot(this.x - p.x, this.y - p.y) > R.holeRadius) continue;
      const open = this.switches.open,
        exit = open ? holes[colors[this.switches.exit]] : p;
      const speed = open ? R.openSpeed : R.closedSpeed;
      const angle = open
        ? exit.x > 0
          ? -2.1
          : -1.04
        : Math.atan2(-this.vy, -this.vx);
      this.capture(
        open ? R.openHold : R.closedHold,
        exit,
        speed * Math.cos(angle),
        speed * Math.sin(angle),
      );
      this.emit({ type: "hole", color });
      return true;
    }
    if (Math.hypot(this.x - black.x, this.y - black.y) < R.holeRadius) {
      this.capture(R.blackHold, black, R.blackSpeed * 0.8, R.blackSpeed * 0.6);
      this.emit({ type: "black" });
      return true;
    }
    if (
      this.switches.well &&
      Math.hypot(this.x - center.x, this.y - center.y) < R.wellRadius &&
      Math.hypot(this.vx, this.vy) < R.wellLimit
    ) {
      const t = this.rng() * Math.PI;
      this.capture(
        R.wellHold,
        center,
        R.wellSpeed * Math.cos(t),
        R.wellSpeed * Math.sin(t),
      );
      this.emit({ type: "well" });
      return true;
    }
    return false;
  }
  private crossings(ox: number, oy: number) {
    for (const sensor of sensors) {
      const { a, b, direction, event } = sensor;
      if (sensor.layer !== this.layer || this.y === oy) continue;
      const up = oy < a.y && this.y >= a.y,
        down = oy > a.y && this.y <= a.y;
      if (!((direction >= 0 && up) || (direction <= 0 && down))) continue;
      const x = ox + ((this.x - ox) * (a.y - oy)) / (this.y - oy);
      if (x < a.x || x > b.x) continue;
      if (event.type === "spin") {
        const speed = Math.hypot(this.vx, this.vy);
        if (speed >= R.minSpin) {
          const count = Math.min(
            R.maxSpins,
            Math.max(1, Math.round(speed / R.minSpin)),
          );
          this.spins[event.index] += count;
          this.emit({ ...event, count });
        }
      } else {
        if (
          event.type === "lane" &&
          event.lane === "out" &&
          this.switches.kicker(event.index)
        ) {
          const speed = R.kickerSpeed[event.index];
          this.capture(
            R.kickerHold,
            event.index === 0 ? leftFeed : rightFeed,
            0,
            speed,
          );
        }
        this.emit(event);
      }
    }
  }
  private onTrack(dt: number) {
    if (this.deck) {
      this.onDeck(dt);
      return;
    }
    const launch = this.layer === "ramp",
      track = launch ? launchTrack : hyperTrack;
    const old = this.distance,
      ox = this.x,
      oy = this.y;
    if (!this.guided) this.trackSpeed -= (R.gravity + R.rampResistance) * dt;
    this.distance += this.trackSpeed * dt;
    track.place(this, this.distance, this.trackOffset);
    this.vx = (this.x - ox) / dt;
    this.vy = (this.y - oy) / dt;
    this.crossings(ox, oy);
    if (launch) {
      // The inside fork feeds the exposed engine deck at the second bend.
      // An outside shot stays in the guide and can roll back before the sensor.
      if (
        this.trackOffset < -0.009 &&
        old < track.lengths[2] &&
        this.distance >= track.lengths[2]
      ) {
        this.deck = true;
        this.vx = -this.trackSpeed * 0.75;
        this.vy = this.trackSpeed * 0.66;
        return;
      }
      if (old < track.lengths[5] && this.distance >= track.lengths[5]) {
        this.guided = true;
        this.trackSpeed = R.railSpeed;
        this.emit({ type: "rampSensor" });
      }
    }
    if (this.distance < 0) {
      this.layer = "main";
      this.vy = -Math.abs(this.trackSpeed);
      this.y = track.points[0].y - 0.002;
    } else if (this.distance >= track.length) {
      if (launch) {
        this.layer = "main";
        this.vx = 0;
        this.vy = -R.railSpeed;
        this.emit({ type: "lane", lane: "bonus", index: 0 });
      } else {
        this.hyperEject = true;
        this.capture(
          R.hyperHold,
          this,
          R.hyperSpeed * 0.32,
          -R.hyperSpeed * Math.sqrt(1 - 0.32 ** 2),
        );
        this.emit({ type: "hyper" });
      }
    }
  }
  private onDeck(dt: number) {
    const ox = this.x,
      oy = this.y;
    this.vy -= R.gravity * dt;
    this.vx *= 1 - R.friction * dt;
    this.vy *= 1 - R.friction * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.crossings(ox, oy);
    this.startX = ox;
    this.startY = oy;
    this.resolveSolids();
    // Only the deck has skirts. The raised purple guide passes over them.
    const left = deckMouth.x - 0.06,
      right = deckMouth.x + 0.052;
    if (this.x < left) {
      this.x = left;
      this.vx = Math.abs(this.vx) * R.rubber;
    }
    if (this.x > right) {
      this.x = right;
      this.vx = -Math.abs(this.vx) * R.rubber;
    }
    if (this.y < deckMouth.y) {
      this.layer = "main";
      this.deck = false;
    }
    if (this.y > deckCrest.y) {
      this.deck = false;
      this.guided = true;
      this.distance = launchTrack.lengths[5];
      this.trackSpeed = R.railSpeed;
      this.trackOffset = 0;
      this.emit({ type: "rampSensor" });
    }
  }
  private fire(i: number) {
    const event = solids[i].event;
    if (!event) return;
    this.flashes[i] = this.clock;
    this.locks[i] = this.clock + R.kickLock;
    this.emit(event);
  }
  private limitSpeed() {
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > R.maxSpeed) {
      this.vx *= R.maxSpeed / speed;
      this.vy *= R.maxSpeed / speed;
    }
  }
  private contact(x: number, y: number, r: number) {
    const dx = this.x - x,
      dy = this.y - y,
      dist = Math.hypot(dx, dy);
    this.depth = R.radius + r - dist;
    if (this.depth <= 0) return false;
    this.nx = dist ? dx / dist : 0;
    this.ny = dist ? dy / dist : 1;
    return true;
  }
  private shape(s: Solid) {
    const dx = s.b.x - s.a.x,
      dy = s.b.y - s.a.y;
    const t =
      dx || dy
        ? Math.max(
            0,
            Math.min(
              1,
              ((this.x - s.a.x) * dx + (this.y - s.a.y) * dy) /
                (dx * dx + dy * dy),
            ),
          )
        : 0;
    if (this.contact(s.a.x + t * dx, s.a.y + t * dy, s.radius)) return true;
    if (!sweptContact(s, this.startX, this.startY, this.x, this.y, this.sweep))
      return false;
    this.nx = this.sweep.nx;
    this.ny = this.sweep.ny;
    this.depth = this.sweep.depth;
    return true;
  }
  private resolveSolids() {
    const cell = this.grid.at(this.x, this.y);
    if (!cell) return;
    this.touched.fill(0);
    for (let iter = 0; iter < R.contacts; iter++) {
      let best = -1,
        deep = 0;
      for (const i of cell) {
        const s = solids[i];
        if (
          this.touched[i] ||
          s.layer !== this.layer ||
          (s.downGate && this.vy < 0)
        )
          continue;
        if (
          s.event?.type === "target" &&
          this.switches.isDown(s.event.bank, s.event.index)
        )
          continue;
        if (this.shape(s) && this.depth > deep) {
          best = i;
          deep = this.depth;
        }
      }
      if (best < 0) break;
      this.touched[best] = 1;
      const s = solids[best];
      this.shape(s);
      this.x += this.nx * this.depth;
      this.y += this.ny * this.depth;
      const vn = this.vx * this.nx + this.vy * this.ny;
      const e = s.event;
      if (e && this.clock >= this.locks[best] && vn <= 0) {
        this.fire(best);
        if (e.type === "bumper" || e.type === "sling") {
          const kick =
            e.type === "bumper"
              ? e.group === "attack"
                ? R.attackKick
                : R.engineKick
              : R.slingKick;
          const t = e.type === "sling" ? R.slingTangent : R.popTangent;
          this.vx = (this.vx - vn * this.nx) * t + kick * this.nx;
          this.vy = (this.vy - vn * this.ny) * t + kick * this.ny;
          continue;
        }
      }
      if (vn < 0) {
        this.vx =
          (this.vx - vn * this.nx) * R.tangent - vn * s.bounce * this.nx;
        this.vy =
          (this.vy - vn * this.ny) * R.tangent - vn * s.bounce * this.ny;
      }
    }
  }
}
