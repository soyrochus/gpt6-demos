// SPDX-License-Identifier: GPL-2.0-or-later
// The inspection camera uses orthographic projection, independent of the match camera.
const stride = 14; // Three vertices, outward normal, perimeter-edge mask, inline model.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class PeekMap {
  constructor(canvas, you, bot) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.you = you;
    this.bot = bot;
    this.clear();
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (drag || e.button !== 0) return;
      canvas.focus();
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerId !== drag?.id) return;
      this.orbit((drag.x - e.clientX) * 0.008, (e.clientY - drag.y) * 0.006);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    canvas.addEventListener("lostpointercapture", () => {
      drag = null;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const units =
          e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
        this.zoomBy(Math.exp(clamp(-e.deltaY * units * 0.0015, -1, 1)));
      },
      { passive: false },
    );
    canvas.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowLeft":
          this.orbit(-0.12, 0);
          break;
        case "ArrowRight":
          this.orbit(0.12, 0);
          break;
        case "ArrowUp":
          this.orbit(0, 0.1);
          break;
        case "ArrowDown":
          this.orbit(0, -0.1);
          break;
        case "+":
        case "=":
          this.zoomBy(1.16);
          break;
        case "-":
          this.zoomBy(1 / 1.16);
          break;
        default:
          return;
      }
      e.preventDefault();
    });
    new ResizeObserver(() => this.schedule()).observe(canvas);
  }
  clear() {
    this.mesh = null;
    this.state = null;
  }
  orbit(azimuth, elevation) {
    this.angle += azimuth;
    this.tilt = clamp(this.tilt + elevation, 0.15, 1.47);
    this.schedule();
  }
  zoomBy(factor) {
    this.zoom = clamp(this.zoom * factor, 0.22, 6);
    this.schedule();
  }
  open(engine, state) {
    if (!this.mesh) {
      this.mesh = engine.peek_geometry();
      const count = this.mesh.length / stride;
      this.projected = new Float32Array(count * 9);
      this.depth = new Float32Array(count);
      this.order = Array.from({ length: count }, (_, i) => i);
    }
    this.offsets = engine.peek_offsets();
    this.state = state;
    this.center = state.pos.map((v, i) => (v + state.bot[i]) / 2);
    this.angle = -0.88;
    this.tilt = 0.72;
    this.zoom = 1;
    this.fitActors();
    this.draw();
  }
  fitActors() {
    // Fit the projected neighborhood, including both actors. A distant opponent
    // opens an arena overview; a nearby opponent opens a closer corridor view.
    const { state, center, mesh, offsets } = this;
    const ca = Math.cos(this.angle),
      sa = Math.sin(this.angle);
    const st = Math.sin(this.tilt),
      ct = Math.cos(this.tilt);
    const reach =
      Math.hypot(...state.pos.map((v, i) => v - state.bot[i])) / 2 + 550;
    let left = -145,
      right = 145,
      top = -110,
      bottom = 110;
    const include = (x, y, z) => {
      const u = -sa * x + ca * y,
        v = (ca * x + sa * y) * st - z * ct;
      left = Math.min(left, u);
      right = Math.max(right, u);
      top = Math.min(top, v);
      bottom = Math.max(bottom, v);
    };
    for (const pos of [state.pos, state.bot]) {
      include(pos[0] - center[0], pos[1] - center[1], pos[2] - center[2]);
    }
    for (let k = 0; k < mesh.length; k += stride) {
      const model = mesh[k + 13] * 4;
      for (let n = 0; n < 9; n += 3) {
        const x = mesh[k + n] + offsets[model] - center[0];
        const y = mesh[k + n + 1] + offsets[model + 1] - center[1];
        const z = mesh[k + n + 2] + offsets[model + 2] - center[2];
        if (Math.hypot(x, y) < reach && Math.abs(z) < reach) include(x, y, z);
      }
    }
    const u = (left + right) / 2,
      v = (top + bottom) / 2;
    center[0] += -sa * u + ca * st * v;
    center[1] += ca * u + sa * st * v;
    center[2] -= ct * v;
    this.fitWidth = right - left;
    this.fitHeight = bottom - top;
    this.span = Math.max(this.fitWidth, this.fitHeight);
  }
  schedule() {
    if (!this.state || this.pending || !this.canvas.clientWidth) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      if (this.canvas.clientWidth && this.state) this.draw();
    });
  }
  draw() {
    const {
      canvas,
      context: ctx,
      mesh,
      projected,
      order,
      depth,
      offsets,
      state,
    } = this;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    const w = Math.round(width * devicePixelRatio),
      h = Math.round(height * devicePixelRatio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const ca = Math.cos(this.angle),
      sa = Math.sin(this.angle);
    const ct = Math.cos(this.tilt),
      st = Math.sin(this.tilt);
    const scale =
      Math.min((width - 80) / this.fitWidth, (height - 40) / this.fitHeight) *
      this.zoom;
    const [cx, cy, cz] = this.center;
    const project = (x, y, z, out, j) => {
      const along = ca * x + sa * y;
      out[j] = width / 2 + (-sa * x + ca * y) * scale;
      out[j + 1] = height / 2 + (along * st - z * ct) * scale;
      out[j + 2] = along * ct + z * st;
    };
    for (let i = 0; i < order.length; i++) {
      const k = i * stride,
        j = i * 9,
        model = mesh[k + 13] * 4;
      const dx = offsets[model] - cx,
        dy = offsets[model + 1] - cy,
        dz = offsets[model + 2] - cz;
      for (let n = 0; n < 9; n += 3) {
        project(
          mesh[k + n] + dx,
          mesh[k + n + 1] + dy,
          mesh[k + n + 2] + dz,
          projected,
          j + n,
        );
      }
      depth[i] = (projected[j + 2] + projected[j + 5] + projected[j + 8]) / 3;
    }
    order.sort((a, b) => depth[a] - depth[b]);
    const top = Math.max(state.pos[2], state.bot[2]) + 65;
    ctx.lineWidth = 0.85;
    for (const i of order) {
      const k = i * stride,
        j = i * 9;
      const x = projected[j],
        y = projected[j + 1],
        u = projected[j + 3],
        v = projected[j + 4];
      const r = projected[j + 6],
        s = projected[j + 7];
      if (
        Math.max(x, u, r) < 0 ||
        Math.min(x, u, r) > width ||
        Math.max(y, v, s) < 0 ||
        Math.min(y, v, s) > height
      )
        continue;
      const nz = mesh[k + 11];
      const facing = (mesh[k + 9] * ca + mesh[k + 10] * sa) * ct + nz * st;
      // Cut away the near shell and fade upper decks to expose the route below.
      if (facing < -0.05) continue;
      const z =
        (mesh[k + 2] + mesh[k + 5] + mesh[k + 8]) / 3 +
        offsets[mesh[k + 13] * 4 + 2];
      const layer = z > top ? clamp(1 - (z - top) / 190, 0.12, 1) : 1;
      const fade =
        layer * clamp(1 - Math.abs(depth[i]) / (this.span * 1.2), 0.17, 1);
      const floor = nz > 0.92,
        ramp = !floor && nz > 0.15;
      ctx.fillStyle = floor ? "#8dcab7" : ramp ? "#e0b67b" : "#99b7bf";
      ctx.globalAlpha = fade * (floor ? 0.2 : ramp ? 0.32 : 0.09);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(u, v);
      ctx.lineTo(r, s);
      ctx.closePath();
      ctx.fill();
      const mask = mesh[k + 12];
      if (mask) {
        ctx.strokeStyle = floor ? "#b2e4cb" : ramp ? "#f3d6a3" : "#9db0ac";
        ctx.globalAlpha = fade * (floor || ramp ? 0.65 : 0.32);
        ctx.beginPath();
        if (mask & 1) {
          ctx.moveTo(x, y);
          ctx.lineTo(u, v);
        }
        if (mask & 2) {
          ctx.moveTo(u, v);
          ctx.lineTo(r, s);
        }
        if (mask & 4) {
          ctx.moveTo(r, s);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const place = (el, pos) => {
      const p = [];
      project(pos[0] - cx, pos[1] - cy, pos[2] - cz, p, 0);
      el.style.transform = `translate(${p[0]}px,${p[1]}px)`;
      return p;
    };
    const player = place(this.you, state.pos),
      opponent = place(this.bot, state.bot);
    const yaw = state.yaw - this.angle;
    const angle = Math.atan2(Math.cos(yaw) * st, Math.sin(yaw));
    this.you.firstElementChild.style.transform = `rotate(${angle}rad)`;
    this.bot.lastElementChild.style.top =
      Math.abs(player[0] - opponent[0]) < 62 &&
      Math.abs(player[1] - opponent[1]) < 25
        ? "12px"
        : "";
  }
}
