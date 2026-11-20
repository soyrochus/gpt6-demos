import * as T from "three";
import { Constellation } from "astronomy-engine";
import { estimateV, type GaiaRow, type GaiaTile } from "../catalog/gaia";
import {
  digest,
  readAsset,
  starName,
  type Catalogue,
  type Star,
} from "../catalog/catalog";
import {
  horizontal,
  equatorial,
  stellarMotion,
  altitude,
  starDirection,
  rad,
  clamp,
  compass,
  type View,
  type Vec,
  type Snapshot,
} from "../astro/sky";
import {
  localShader,
  starVertex,
  starFragment,
  skyVertex,
  skyFragment,
} from "./shaders";

export interface Layers {
  asterisms: boolean;
  lines: boolean;
  labels: boolean;
  grid: boolean;
  dust: boolean;
  refraction: boolean;
  free: boolean;
  limit: number;
  glow: number;
  exposure: number;
  extinction: number;
  deep: boolean;
}
export const defaults: Layers = {
  asterisms: false,
  lines: true,
  labels: true,
  grid: false,
  dust: true,
  refraction: true,
  free: false,
  limit: 6.5,
  glow: 0.1,
  exposure: 1,
  extinction: 0.16,
  deep: false,
};
export interface GaiaTarget {
  sourceId: string;
  g: number;
  star: Star;
}
export type ObjectId = number | string | GaiaTarget;
const tint = (bv: number): Vec => {
  if (!Number.isFinite(bv)) return [1, 1, 1];
  const t = clamp((bv + 0.25) / 1.85, 0, 1);
  return [
    Math.min(1, 0.68 + t * 0.7),
    1 - 0.23 * Math.abs(t - 0.38),
    Math.min(1, 1.25 - 0.65 * t),
  ];
};
const vector = (v: Vec) => new T.Vector3(...v);
const uniform = <V>(value: V) => ({ value });
function starGeometry(stars: Star[]) {
  const geo = new T.BufferGeometry(),
    pos: number[] = [],
    pm: number[] = [],
    colors: number[] = [];
  for (const s of stars) {
    pos.push(...equatorial(s.raDeg, s.decDeg));
    pm.push(...stellarMotion(s));
    colors.push(...tint(s.colorIndexBV));
  }
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("motion", new T.Float32BufferAttribute(pm, 3));
  geo.setAttribute(
    "magnitude",
    new T.Float32BufferAttribute(
      stars.map((s) => s.magnitudeV),
      1,
    ),
  );
  geo.setAttribute("tint", new T.Float32BufferAttribute(colors, 3));
  return geo;
}
function overlayGeometry(pairs: number[]) {
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pairs, 3));
  return geo;
}
function gridGeometry() {
  const pairs: number[] = [];
  for (let az = 0; az < 360; az += 30)
    for (let h = 0; h < 90; h += 3)
      pairs.push(...horizontal(az, h), ...horizontal(az, h + 3));
  for (let h = 0; h < 90; h += 15)
    for (let az = 0; az < 360; az += 3)
      pairs.push(...horizontal(az, h), ...horizontal(az + 3, h));
  return overlayGeometry(pairs);
}
type Figure = { id: string; geometry: { coordinates: number[][][] } };
export async function loadOverlays(signal: AbortSignal) {
  const [lines, density] = await Promise.allSettled([
    readAsset("sky/constellations.json", signal)
      .then((r) => r.json())
      .then((r) => r.features as Figure[]),
    readAsset("sky/hyg-density.bin", signal)
      .then((r) => r.arrayBuffer())
      .then((b) => {
        if (b.byteLength !== 256 * 128) throw Error("Invalid density map");
        return new Uint8Array(b);
      }),
  ]);
  return {
    figures: lines.status === "fulfilled" ? lines.value : [],
    density: density.status === "fulfilled" ? density.value : null,
  };
}
export interface DrawState {
  sky: Snapshot;
  view: View;
  layers: Layers;
  selected: ObjectId | null;
}
export function createSky(
  canvas: HTMLCanvasElement,
  overlay: HTMLElement,
  catalog: Catalogue,
  assets: Awaited<ReturnType<typeof loadOverlays>>,
  onNotice: (s: string) => void,
) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(75, 1, 0.1, 500);
  const orientation = uniform(new T.Matrix3()),
    refraction = uniform(1);
  const starsUniforms = {
    eqToWorld: orientation,
    refractOn: refraction,
    years: uniform(0),
    limitMag: uniform(6.5),
    exposure: uniform(1),
    extinction: uniform(0.16),
    pixelRatio: uniform(renderer.getPixelRatio()),
  };
  const starMat = new T.ShaderMaterial({
    uniforms: starsUniforms,
    vertexShader: starVertex,
    fragmentShader: starFragment,
    transparent: true,
    blending: T.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const stars = new T.Points(starGeometry(catalog.stars), starMat);
  stars.frustumCulled = false;
  stars.renderOrder = 3;
  scene.add(stars);
  const texture = new T.DataTexture(
    assets.density || new Uint8Array(256 * 128),
    256,
    128,
    T.RedFormat,
  );
  texture.wrapS = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  const su = {
    density: uniform(texture),
    worldToEq: uniform(new T.Matrix3()),
    forwardDir: uniform(new T.Vector3()),
    rightDir: uniform(new T.Vector3()),
    upDir: uniform(new T.Vector3()),
    sunDir: uniform(new T.Vector3()),
    moonDir: uniform(new T.Vector3()),
    aspect: uniform(1),
    tanHalfFov: uniform(1),
    day: uniform(0),
    twilight: uniform(0),
    glow: uniform(0),
    moonlight: uniform(0),
    showDust: uniform(1),
    phase: uniform(1),
    sunRadius: uniform(0.0046),
    moonRadius: uniform(0.0045),
    backgroundExposure: uniform(1),
  };
  const bg = new T.Mesh(
    new T.PlaneGeometry(2, 2),
    new T.ShaderMaterial({
      uniforms: su,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      depthTest: false,
      depthWrite: false,
    }),
  );
  bg.frustumCulled = false;
  bg.renderOrder = -5;
  scene.add(bg);
  const labels: {
    name: string;
    id?: ObjectId;
    eq?: Vec;
    fixed?: Vec;
    className: string;
  }[] = [];
  for (let a = 0; a < 360; a += 45)
    labels.push({
      name: compass(a),
      fixed: horizontal(a, 1.2),
      className: "cardinal",
    });
  const pairs: number[] = [];
  for (const f of assets.figures) {
    let center = new T.Vector3(),
      count = 0;
    for (const path of f.geometry.coordinates) {
      const vs = path.map(([ra, dec]) => equatorial(ra, dec));
      vs.forEach((p, i) => {
        center.add(vector(p));
        count++;
        if (i) pairs.push(...vs[i - 1], ...p);
      });
    }
    if (count) {
      center.normalize();
      const ra = Math.atan2(center.y, center.x) / rad,
        dec = Math.asin(center.z) / rad;
      const c = Constellation((ra / 15 + 24) % 24, dec);
      labels.push({
        name: c.symbol === f.id ? c.name : f.id,
        eq: center.toArray() as Vec,
        className: "figure-name",
      });
    }
  }
  const lineMat = new T.ShaderMaterial({
    uniforms: {
      eqToWorld: orientation,
      refractOn: refraction,
      opacity: uniform(0.6),
    },
    vertexShader:
      localShader +
      `
    varying float h;void main(){vec3 p=bend(normalize(eqToWorld*position));h=p.y;gl_Position=projectionMatrix*viewMatrix*vec4(p*100.,1.);}`,
    fragmentShader: `varying float h;uniform float opacity;void main(){if(h<0.)discard;gl_FragColor=vec4(.40,.59,.65,opacity);}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const lines = new T.LineSegments(overlayGeometry(pairs), lineMat);
  lines.renderOrder = 1;
  lines.frustumCulled = false;
  scene.add(lines);
  const figurePairs: number[] = [];
  const byHip = new Map(
    catalog.names.map((n) => [n[2], catalog.byId.get(n[0])!]),
  );
  // Conventional Big Dipper bowl and handle, Summer Triangle and Winter Triangle.
  for (const chain of [
    [67301, 65378, 62956, 59774, 54061, 53910, 58001, 59774],
    [91262, 102098, 97649, 91262],
    [32349, 37279, 27989, 32349],
  ]) {
    for (let i = 1; i < chain.length; i++) {
      const a = byHip.get(String(chain[i - 1])),
        b = byHip.get(String(chain[i]));
      if (a && b)
        figurePairs.push(
          ...equatorial(a.raDeg, a.decDeg),
          ...equatorial(b.raDeg, b.decDeg),
        );
    }
  }
  const asterisms = new T.LineSegments(overlayGeometry(figurePairs), lineMat);
  asterisms.frustumCulled = false;
  asterisms.renderOrder = 2;
  scene.add(asterisms);
  const grid = new T.LineSegments(
    gridGeometry(),
    new T.LineBasicMaterial({
      color: 0x688996,
      transparent: true,
      opacity: 0.24,
      depthTest: false,
    }),
  );
  grid.scale.setScalar(100);
  grid.renderOrder = 1;
  grid.frustumCulled = false;
  scene.add(grid);
  const planetGeo = new T.BufferGeometry(),
    planetPos = new T.Float32BufferAttribute(new Float32Array(7 * 3), 3);
  const planetSize = new T.Float32BufferAttribute(new Float32Array(7), 1);
  planetGeo.setAttribute("position", planetPos);
  planetGeo.setAttribute("size", planetSize);
  const planets = new T.Points(
    planetGeo,
    new T.ShaderMaterial({
      vertexShader: `attribute float size;void main(){gl_Position=projectionMatrix*viewMatrix*vec4(position*100.,1.);gl_PointSize=size;if(position.y<0.||size<.1)gl_Position=vec4(2.,2.,2.,1.);}`,
      fragmentShader: `void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.) discard;gl_FragColor=vec4(1.,.91,.74,exp(-r*r*5.));}`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  planets.frustumCulled = false;
  planets.renderOrder = 4;
  scene.add(planets);
  for (const n of catalog.names) {
    const s = catalog.byId.get(n[0])!;
    if (n[1] && s.magnitudeV < 1.8)
      labels.push({ name: starName(n), id: s.id, className: "star-name" });
  }
  for (const name of [
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
  ])
    labels.push({ name, id: name, className: "body-name" });
  const domLabels = labels.map((l) => {
    const el = document.createElement("span");
    el.className = l.className;
    el.textContent = l.name;
    overlay.append(el);
    return el;
  });
  let textSizes = domLabels.map((el) => [el.offsetWidth, el.offsetHeight]);
  document.fonts.ready.then(() => {
    if (!overlay.isConnected || !domLabels[0]?.isConnected) return;
    textSizes = domLabels.map((el) => {
      const hidden = el.hidden;
      el.hidden = false;
      const size = [el.offsetWidth, el.offsetHeight];
      el.hidden = hidden;
      return size;
    });
    if (latest) draw(latest);
  });
  const marker = document.createElement("span");
  marker.className = "selection-ring";
  overlay.append(marker);
  let width = 0,
    height = 0,
    latest: DrawState | undefined;
  const local = (s: Star, st: DrawState) => {
    const d = starDirection(s, st.sky.matrix, st.sky.years);
    return horizontal(d.azimuthDeg, altitude(d, st.layers.refraction));
  };
  function project(p: Vec) {
    const ndc = vector(p).multiplyScalar(100).project(camera);
    if (ndc.z > 1 || ndc.z < -1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1)
      return null;
    return [((ndc.x + 1) * width) / 2, ((1 - ndc.y) * height) / 2];
  }
  function bodyVec(b: Snapshot["bodies"][number], st: DrawState) {
    return horizontal(b.azimuthDeg, altitude(b, st.layers.refraction));
  }
  function selectedVec(id: ObjectId, st: DrawState) {
    if (typeof id === "object") {
      const d = starDirection(id.star, st.sky.matrix, st.sky.years - 16);
      return horizontal(d.azimuthDeg, altitude(d, st.layers.refraction));
    }
    if (typeof id === "number") {
      const s = catalog.byId.get(id);
      return s ? local(s, st) : null;
    }
    const b = st.sky.bodies.find((b) => b.name === id);
    return b ? bodyVec(b, st) : null;
  }
  const gaiaAbort = new AbortController();
  const tiles = new Map<string, { points: T.Points; targets: GaiaTarget[] }>();
  const requested = new Set<string>();
  let manifest: GaiaTile[] | undefined,
    manifestStarted = false;
  const gaiaMat = starMat.clone();
  gaiaMat.uniforms.eqToWorld = orientation;
  gaiaMat.uniforms.refractOn = refraction;
  function updateGaia(st: DrawState, forward: T.Vector3) {
    const active = st.layers.deep && st.view.verticalFovDeg <= 25;
    for (const tile of tiles.values()) tile.points.visible = false;
    canvas.dataset.gaiaSources = "0";
    if (!active) return;
    const options = gaiaMat.uniforms;
    options.years.value = st.sky.years - 16;
    options.limitMag.value = starsUniforms.limitMag.value + 3.5;
    options.extinction.value = starsUniforms.extinction.value;
    options.exposure.value = starsUniforms.exposure.value * 2.4;
    if (!manifestStarted) {
      manifestStarted = true;
      readAsset("catalog/gaia/manifest.json", gaiaAbort.signal)
        .then((r) => r.json())
        .then((m) => {
          if (m.version !== 1 || m.epoch !== 2016 || !Array.isArray(m.tiles))
            throw Error("Unsupported Gaia archive.");
          manifest = m.tiles;
          if (latest && !gaiaAbort.signal.aborted) draw(latest);
        })
        .catch(() => {
          if (!gaiaAbort.signal.aborted)
            onNotice(
              "Gaia deep fields unavailable. The HYG catalogue is active.",
            );
        });
    }
    let visibleSources = 0;
    // Half diagonal of the perspective frustum, plus the tile's angular bounding radius.
    const halfView = Math.atan(
      Math.tan((st.view.verticalFovDeg * rad) / 2) *
        Math.hypot(1, camera.aspect),
    );
    for (const tile of manifest || []) {
      const center = vector(
        equatorial(tile.ra + tile.size / 2, tile.dec + tile.size / 2),
      ).applyMatrix3(orientation.value);
      if (
        center.angleTo(forward) >
        halfView + (tile.size * rad) / Math.SQRT2 + 0.012
      )
        continue;
      const existing = tiles.get(tile.file);
      if (existing) {
        existing.points.visible = true;
        visibleSources += existing.targets.length;
        continue;
      }
      if (requested.has(tile.file)) continue;
      requested.add(tile.file);
      readAsset("catalog/gaia/" + tile.file, gaiaAbort.signal)
        .then((r) => r.arrayBuffer())
        .then(async (bytes) => {
          if ((await digest(bytes)) !== tile.sha256)
            throw Error("Gaia tile checksum mismatch");
          const rows: GaiaRow[] = JSON.parse(new TextDecoder().decode(bytes));
          if (rows.length !== tile.count) throw Error("Incomplete Gaia tile");
          if (gaiaAbort.signal.aborted) return;
          const targets: GaiaTarget[] = [];
          for (const [sourceId, raDeg, decDeg, ma, md, g, color] of rows) {
            const estimated = estimateV(g, color);
            if (estimated === null) continue;
            targets.push({
              sourceId,
              g,
              star: {
                id: targets.length,
                raDeg,
                decDeg,
                pmRaStarMasPerYear: ma ?? NaN,
                pmDecMasPerYear: md ?? NaN,
                magnitudeV: estimated,
                colorIndexBV: NaN,
              },
            });
          }
          const points = new T.Points(
            starGeometry(targets.map((t) => t.star)),
            gaiaMat,
          );
          points.renderOrder = 3;
          points.frustumCulled = false;
          scene.add(points);
          tiles.set(tile.file, { points, targets });
          if (latest) draw(latest);
        })
        .catch(() => {
          if (!gaiaAbort.signal.aborted)
            onNotice(
              "A Gaia tile is unavailable. Reload to retry. HYG stars remain visible.",
            );
        });
    }
    canvas.dataset.gaiaSources = String(visibleSources);
  }
  function draw(st: DrawState) {
    latest = st;
    if (document.hidden || !canvas.clientWidth || !canvas.clientHeight) return;
    const { view: v, sky, layers: l } = st;
    if (width !== canvas.clientWidth || height !== canvas.clientHeight) {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      renderer.setSize(width, height, false);
    }
    camera.aspect = width / height;
    camera.fov = v.verticalFovDeg;
    camera.updateProjectionMatrix();
    // The prescribed east/up/north scene basis is mirrored. Geographic east is on the right when facing north.
    camera.projectionMatrix.elements[0] *= -1;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const forward = vector(horizontal(v.azimuthDeg, v.altitudeDeg)),
      right = vector(horizontal(v.azimuthDeg + 90, 0)),
      up = new T.Vector3().crossVectors(forward, right).normalize();
    camera.up.copy(up);
    camera.lookAt(forward);
    camera.updateMatrixWorld();
    orientation.value.fromArray(sky.matrix);
    refraction.value = +l.refraction;
    const [sun, moon] = sky.bodies,
      sunAlt = sun.geometricAltitudeDeg;
    const daylight = clamp((sunAlt + 5) / 10, 0, 1),
      twilight = clamp((sunAlt + 18) / 14, 0, 1),
      moonlight =
        Math.max(0, Math.sin(moon.apparentAltitudeDeg * rad)) *
        moon.illuminatedFraction;
    starsUniforms.years.value = sky.years;
    starsUniforms.limitMag.value =
      Math.min(8, l.limit + (l.deep && v.verticalFovDeg <= 25 ? 1.5 : 0)) -
      (twilight * 4 + daylight * 9 + moonlight * 0.9);
    starsUniforms.extinction.value = l.extinction;
    starsUniforms.exposure.value = l.exposure;
    su.worldToEq.value.copy(orientation.value).transpose();
    su.forwardDir.value.copy(forward);
    su.rightDir.value.copy(right);
    su.upDir.value.copy(up);
    su.aspect.value = camera.aspect;
    su.tanHalfFov.value = Math.tan((v.verticalFovDeg * rad) / 2);
    su.sunDir.value.fromArray(bodyVec(sun, st));
    su.moonDir.value.fromArray(bodyVec(moon, st));
    su.phase.value = moon.illuminatedFraction;
    su.moonRadius.value = (moon.angularDiameterDeg * rad) / 2;
    su.sunRadius.value = (sun.angularDiameterDeg * rad) / 2;
    su.glow.value = l.glow;
    su.day.value = daylight;
    su.twilight.value = twilight;
    su.moonlight.value = moonlight;
    su.showDust.value = +l.dust;
    su.backgroundExposure.value = l.exposure;
    updateGaia(st, forward);
    grid.visible = l.grid;
    asterisms.visible = l.asterisms;
    lines.visible = l.lines;
    lineMat.uniforms.opacity.value = 0.45 * (1 - daylight * 0.85);
    sky.bodies.slice(2).forEach((b, i) => {
      planetPos.setXYZ(i, ...bodyVec(b, st));
      planetSize.setX(
        i,
        b.magnitudeV <= starsUniforms.limitMag.value
          ? renderer.getPixelRatio() * clamp(4.2 - b.magnitudeV * 0.64, 1.4, 9)
          : 0,
      );
    });
    planetPos.needsUpdate = true;
    planetSize.needsUpdate = true;
    const occupied: number[][] = [];
    labels.forEach((label, i) => {
      let p: Vec | null = null;
      if (label.fixed) p = label.fixed;
      else if (l.labels) {
        if (label.eq && l.lines)
          p = vector(label.eq).applyMatrix3(orientation.value).toArray() as Vec;
        if (label.id !== undefined) {
          const mag =
            typeof label.id === "number"
              ? catalog.byId.get(label.id)!.magnitudeV
              : sky.bodies.find((b) => b.name === label.id)!.magnitudeV;
          if (
            mag < starsUniforms.limitMag.value ||
            label.id === "Sun" ||
            label.id === "Moon"
          )
            p = selectedVec(label.id, st);
        }
      }
      const xy = p && p[1] >= 0 ? project(p) : null,
        el = domLabels[i];
      if (!xy) {
        el.hidden = true;
        return;
      }
      const [w, h] = textSizes[i];
      const left = xy[0] + (label.id !== undefined ? 6 : -w / 2),
        top =
          xy[1] +
          (label.id !== undefined ? 2 : label.eq ? -1.3 * h : -0.75 * h);
      const right = left + w,
        bottom = top + h;
      if (
        left < 5 ||
        right > width - 5 ||
        top < 5 ||
        bottom > height - 5 ||
        occupied.some(
          ([a, b, c, d]) =>
            left < c + 4 && right > a - 4 && top < d + 3 && bottom > b - 3,
        )
      ) {
        el.hidden = true;
        return;
      }
      occupied.push([left, top, right, bottom]);
      el.hidden = false;
      el.style.left = xy[0] + "px";
      el.style.top = xy[1] + "px";
    });
    const pos = st.selected === null ? null : selectedVec(st.selected, st),
      xy = pos && pos[1] >= 0 ? project(pos) : null;
    marker.hidden = !xy;
    if (xy) {
      marker.style.left = xy[0] + "px";
      marker.style.top = xy[1] + "px";
    }
    const start = performance.now();
    renderer.render(scene, camera);
    canvas.dataset.drawCalls = String(renderer.info.render.calls);
    canvas.dataset.catalogCount = String(catalog.stars.length);
    canvas.dataset.catalogParseMs = catalog.parseMs.toFixed(2);
    canvas.dataset.textures = String(renderer.info.memory.textures);
    canvas.dataset.cpuDrawMs = (performance.now() - start).toFixed(2);
    canvas.dataset.geometries = String(renderer.info.memory.geometries);
  }
  function pick(x: number, y: number, countOnly = false) {
    if (!latest) return null;
    const st = latest;
    let best: ObjectId | null = null,
      dist = 12,
      count = 0;
    const consider = (id: ObjectId, p: Vec) => {
      if (p[1] < 0) return;
      const xy = project(p);
      if (!xy) return;
      count++;
      const d = Math.hypot(x - xy[0], y - xy[1]);
      if (d < dist) {
        dist = d;
        best = id;
      }
    };
    for (const s of catalog.stars) {
      if (s.magnitudeV > starsUniforms.limitMag.value) continue;
      const p = local(s, st),
        h = Math.asin(clamp(p[1], 0, 1)) / rad;
      const air =
        1 /
        Math.max(0.025, Math.sin(h * rad) + 0.50572 * (h + 6.07995) ** -1.6364);
      if (
        s.magnitudeV + st.layers.extinction * (air - 1) <=
        starsUniforms.limitMag.value
      )
        consider(s.id, p);
    }
    if (!countOnly)
      for (const t of tiles.values())
        if (t.points.visible)
          for (const target of t.targets) {
            if (target.star.magnitudeV <= gaiaMat.uniforms.limitMag.value)
              consider(target, selectedVec(target, st)!);
          }
    canvas.dataset.renderedStarCount = String(count);
    if (!countOnly)
      for (const b of st.sky.bodies)
        if (
          b.name === "Sun" ||
          b.name === "Moon" ||
          b.magnitudeV <= starsUniforms.limitMag.value
        )
          consider(b.name, bodyVec(b, st));
    return best;
  }
  const resize = new ResizeObserver(() => {
    if (latest) draw(latest);
  });
  resize.observe(canvas);
  return {
    draw,
    pick,
    dispose() {
      gaiaAbort.abort();
      gaiaMat.dispose();
      resize.disconnect();
      overlay.replaceChildren();
      texture.dispose();
      scene.traverse((obj) => {
        if (
          obj instanceof T.Mesh ||
          obj instanceof T.Points ||
          obj instanceof T.LineSegments
        ) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
