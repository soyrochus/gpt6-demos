import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RULES as R } from "../rules/constants";
import { pos, solids, seat, type Point } from "../table/layout";
import { buildTable, type Indicator } from "./tableMesh";
import type { World } from "../sim/world";

const capColors = [0x3c7dff, 0x3ddc6a, 0xffd23a, 0xff3b3b];
export class TableView {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly root = new T.Group();
  readonly camera = new T.PerspectiveCamera(28, 1, 0.01, 8);
  readonly staticParts = new Map<T.Material, T.BufferGeometry[]>();
  readonly materials = new Map<string, T.MeshStandardMaterial>();
  readonly composer: EffectComposer;
  readonly environment: T.Texture;
  readonly movingTargets = new Map<number, T.Mesh>();
  readonly spinners: T.Mesh[] = [];
  readonly slings: T.Mesh[] = [];
  readonly anchors: Indicator[];
  readonly fixtures: T.InstancedMesh;
  readonly tint = new T.Color();
  readonly post: T.Mesh;
  readonly ball: T.Mesh;
  readonly shadow: T.Mesh;
  readonly bats: T.Group[] = [];
  readonly plunger: T.Mesh;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setClearColor(0x000000);
    this.scene.add(this.root);
    this.camera.up.set(0, 1, 0);
    const env = new RoomEnvironment(),
      gen = new T.PMREMGenerator(this.renderer);
    this.environment = gen.fromScene(env, 0.04).texture;
    env.dispose();
    gen.dispose();
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.scene.add(new T.HemisphereLight(0xe1ecff, 0x384767, 0.92));
    const key = new T.DirectionalLight(0xffebd6, 1.75);
    key.position.set(-0.7, 0.4, 1.0);
    this.scene.add(key);
    const mid = pos(0, 0.5);
    this.box(mid, R.width + 0.036, R.length + 0.036, 0.031, -0.023, "#34404a");
    this.box(mid, R.width + 0.014, R.length + 0.014, 0.014, -0.009, "#121721");
    this.box(mid, R.width, R.length, 0.006, -0.004, "#071433");
    for (const s of solids)
      if (!s.event) this.rail(s.a, s.b, s.radius + 0.001, 0.009, "#b5bfcd");
    this.rail(pos(0.97, 0.07), pos(0.97, 0.9), 0.009, 0.006, "#975227");
    this.rail(pos(0.81, 0.06), pos(0.81, 0.87), 0.007, 0.007, "#b57542");
    this.plunger = new T.Mesh(
      new T.CylinderGeometry(0.011, 0.012, 0.052, 20),
      this.mat("#be8249", 0.85),
    );
    this.plunger.position.set(seat.x, seat.y - 0.045, 0.011);
    this.root.add(this.plunger);
    for (const side of [-1, 1]) {
      const bat = new T.Group();
      bat.position.set(side * R.pivot, 0, 0.011);
      const blade = new T.Mesh(
        new T.CapsuleGeometry(R.batRadius, R.batLength, 6, 18),
        this.mat("#f7f8fb"),
      );
      blade.rotation.z = -Math.PI / 2;
      blade.position.x = R.batLength / 2;
      bat.add(blade);
      const tip = new T.Mesh(
        new T.SphereGeometry(R.tipRadius, 20, 10),
        this.mat("#cf383c"),
      );
      tip.position.x = R.batLength;
      tip.scale.z = 0.76;
      bat.add(tip);
      const pin = new T.Mesh(
        new T.SphereGeometry(0.004, 12, 8),
        this.mat("#b1c5cd", 0.8),
      );
      pin.position.z = 0.007;
      bat.add(pin);
      this.root.add(bat);
      this.bats.push(bat);
    }
    this.ball = new T.Mesh(
      new T.SphereGeometry(R.radius, 28, 20),
      new T.MeshStandardMaterial({
        color: 0xf4f8ff,
        metalness: 0.92,
        roughness: 0.18,
        envMap: this.environment,
        envMapIntensity: 1.1,
      }),
    );
    this.shadow = new T.Mesh(
      new T.CircleGeometry(R.radius * 1.25, 24),
      new T.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    this.root.add(this.ball, this.shadow);
    this.anchors = buildTable(this);
    this.fixtures = new T.InstancedMesh(
      new T.SphereGeometry(1, 16, 8),
      new T.MeshBasicMaterial(),
      this.anchors.length,
    );
    const dummy = new T.Object3D();
    this.anchors.forEach((l, i) => {
      dummy.position.set(l.p.x, l.p.y, l.z + 0.0009);
      dummy.scale.set(l.size, l.size * l.oval, l.size * 0.27);
      dummy.updateMatrix();
      this.fixtures.setMatrixAt(i, dummy.matrix);
      this.fixtures.setColorAt(i, this.tint.setHex(l.color));
    });
    this.root.add(this.fixtures);
    this.post = new T.Mesh(
      new T.SphereGeometry(R.postRadius, 16, 10),
      this.mat("#de8844", 0.72),
    );
    this.post.position.set(0, 0.02, 0.003);
    this.root.add(this.post);
    this.flush();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new T.Vector2(256, 512), 0.1, 0.16, 1.18),
    );
    this.composer.addPass(new OutputPass());
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }
  mat(color: string, metalness = 0.22) {
    const key = color + metalness;
    let m = this.materials.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({
        color,
        metalness,
        envMap: metalness > 0.6 ? this.environment : null,
        envMapIntensity: metalness > 0.6 ? 0.2 : 0.08,
        roughness: metalness > 0.6 ? 0.43 : 0.49,
      });
      this.materials.set(key, m);
    }
    return m;
  }
  bake(
    g: T.BufferGeometry,
    m: T.Material,
    x: number,
    y: number,
    z: number,
    q?: T.Quaternion,
  ) {
    if (q) g.applyQuaternion(q);
    g.translate(x, y, z);
    const flat = g.index ? g.toNonIndexed() : g;
    const list = this.staticParts.get(m);
    if (list) list.push(flat);
    else this.staticParts.set(m, [flat]);
    if (flat !== g) g.dispose();
  }
  box(p: Point, w: number, h: number, d: number, z: number, color: string) {
    this.bake(new T.BoxGeometry(w, h, d), this.mat(color), p.x, p.y, z);
  }
  rail(a: Point, b: Point, r: number, z: number, color: string) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len < 0.00001) return;
    const q = new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      new T.Vector3(dx / len, dy / len, 0),
    );
    this.bake(
      new T.CylinderGeometry(r, r, len, 12),
      this.mat(color, 0.78),
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      z,
      q,
    );
  }
  disc(p: Point, r: number, h: number, z: number, color: string, metal = 0.3) {
    const g = new T.CylinderGeometry(r, r, h, 36);
    g.rotateX(Math.PI / 2);
    this.bake(g, this.mat(color, metal), p.x, p.y, z);
  }
  flush() {
    for (const [mat, list] of this.staticParts) {
      const g = mergeGeometries(list);
      if (g) this.root.add(new T.Mesh(g, mat));
      list.forEach((geo) => geo.dispose());
    }
    this.staticParts.clear();
  }
  resize() {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return;
    // Keep the drawing buffer at cabinet resolution. The projection uses the
    // displayed aspect so the CSS fit never distorts the ball or the table.
    const bufferWidth = Math.round((h * 20.25) / 46);
    this.renderer.setSize(bufferWidth, h, false);
    this.composer.setSize(bufferWidth, h);
    this.camera.aspect = w / h;
    // Fit the projected cabinet corners including the near bevel. The trapezoid's
    // projected centre is slightly nearer the player than its geometric centre.
    const pitch = Math.PI / 10,
      mid = pos(0, 0.481);
    const corner = new T.Vector3();
    let near = 1,
      far = 4;
    for (let pass = 0; pass < 16; pass++) {
      const dist = (near + far) / 2;
      this.camera.position.set(
        0,
        mid.y - dist * Math.sin(pitch),
        dist * Math.cos(pitch),
      );
      this.camera.lookAt(0, mid.y, 0);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let extent = 0;
      for (const x of [-1, 1])
        for (const y of [0, 1]) {
          corner
            .set(
              (x * (R.width + 0.038)) / 2,
              pos(0, y).y + (y === 0 ? -0.019 : 0.019),
              0.002,
            )
            .project(this.camera);
          extent = Math.max(extent, Math.abs(corner.x), Math.abs(corner.y));
        }
      if (extent > 0.978) near = dist;
      else far = dist;
    }
  }
  draw(
    w: World,
    alpha: number,
    light?: (group: string, i: number) => number,
    reduced = false,
    levels: readonly number[] = [0, 0],
    dim = false,
  ) {
    if (light) {
      this.anchors.forEach((l, i) => {
        const intensity = light(l.group, l.index);
        let color = l.color;
        if (l.group === "cap") {
          const event = solids[l.index].event;
          if (event?.type === "bumper")
            color = capColors[levels[event.group === "engine" ? 1 : 0]];
        }
        this.fixtures.setColorAt(
          i,
          this.tint.setHex(color).multiplyScalar(intensity),
        );
      });
      this.fixtures.instanceColor!.needsUpdate = true;
    }
    for (const [i, mesh] of this.movingTargets) {
      const e = solids[i].event;
      if (e?.type === "target")
        mesh.visible = !w.switches.isDown(e.bank, e.index);
    }
    this.spinners.forEach((mesh, i) => {
      const target = w.spins[i] * Math.PI * 2;
      mesh.rotation.x += (target - mesh.rotation.x) * 0.16;
    });
    this.slings.forEach((mesh) => {
      const age = w.clock - w.flashes[mesh.userData.solid];
      mesh.position.z =
        w.flashes[mesh.userData.solid] > 0 && age < R.slingFlash
          ? -R.slingTravel * (1 - age / R.slingFlash)
          : 0;
    });
    this.renderer.toneMappingExposure = dim ? 0.83 : 1.03;
    this.post.visible = w.debugPost || w.switches.post;
    this.root.position.x = reduced
      ? 0
      : R.shake * (w.shakeLeft / R.shakeTime) * Math.sin(w.shakeLeft * 240);
    const x = T.MathUtils.lerp(w.prevX, w.x, alpha),
      y = T.MathUtils.lerp(w.prevY, w.y, alpha);
    const height = w.layer === "ramp" ? 0.018 : 0;
    this.ball.position.set(x, y, R.radius + height);
    this.shadow.position.set(x + 0.003, y - 0.003, 0.001 + height);
    this.ball.visible = this.shadow.visible = w.layer !== "captured";
    w.bats.forEach(
      (b, i) =>
        (this.bats[i].rotation.z = T.MathUtils.lerp(
          b.previous,
          b.angle,
          alpha,
        )),
    );
    this.plunger.position.y =
      seat.y - 0.045 - (R.plungerTravel * w.charge) / R.chargeTime;
    this.composer.render();
  }
}
