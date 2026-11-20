import {
  useState,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  MapPin,
  Clock3,
  Layers,
  Search,
  ChevronRight,
  ChevronDown,
  PanelLeft,
  Maximize,
  Share2,
  Info,
  Compass,
  Minus,
  Plus,
  Play,
  Pause,
  SlidersHorizontal,
  CalendarDays,
  ChevronLeft,
  RotateCcw,
  X,
  Sun,
  Moon,
  Map as MapIcon,
  MousePointer2,
  Check,
} from "lucide-react";
import { loadCatalogue, starName, type Catalogue } from "./catalog/catalog";
import {
  altitude,
  bodyNames,
  clamp,
  compass,
  snapshot,
  starDirection,
  wrap,
  type Observer,
  type View,
} from "./astro/sky";
import {
  presets,
  location,
  localDate,
  clockAt,
  stepDay,
  validInstant,
  supportedStart,
  supportedEnd,
  type Clock,
} from "./astro/time";
import {
  defaults,
  type Layers as Settings,
  type ObjectId,
} from "./renderer/scene";
import { Viewport } from "./components/Viewport";
import { Dialog } from "./components/Dialog";
import { TimeEditor } from "./components/TimeEditor";
const LocationPicker = lazy(() =>
  import("./components/LocationPicker").then((m) => ({
    default: m.LocationPicker,
  })),
);
const initialView: View = {
  azimuthDeg: 180,
  altitudeDeg: 35,
  verticalFovDeg: 75,
};
function starting() {
  let site = presets[0],
    ms = Date.parse("2026-01-15T22:00:00Z"),
    view = { ...initialView };
  let saved = "";
  try {
    saved = localStorage.getItem("dipper.observation.v1") || "";
  } catch {
    /* Storage may be disabled. */
  }
  const q = new URLSearchParams(window.location.search || saved);
  try {
    if (q.has("lat") && q.has("lon")) {
      site = location(
        q.get("place") || "Shared location",
        Number(q.get("lat")),
        Number(q.get("lon")),
        Number(q.get("m") || 0),
        q.get("zone") || undefined,
        q.get("elevation") === "manual",
      );
    } else {
      const env = import.meta.env;
      if (env.VITE_DEFAULT_LAT && env.VITE_DEFAULT_LON)
        site = location(
          "Default observer",
          +env.VITE_DEFAULT_LAT,
          +env.VITE_DEFAULT_LON,
          +(env.VITE_DEFAULT_ELEVATION_M || 0),
          env.VITE_DEFAULT_TIME_ZONE,
        );
    }
    const t = Date.parse(q.get("utc") || "");
    if (validInstant(t)) ms = t;
    for (const [key, field, min, max] of [
      ["az", "azimuthDeg", 0, 360],
      ["alt", "altitudeDeg", -10, 90],
      ["fov", "verticalFovDeg", 10, 100],
    ] as const) {
      if (q.has(key) && Number.isFinite(Number(q.get(key))))
        view[field] = clamp(Number(q.get(key)), min, max);
    }
  } catch {
    site = presets[0];
  }
  return { site, ms, view };
}
function IconButton({
  label,
  children,
  act,
}: {
  label: string;
  children: ReactNode;
  act: () => void;
}) {
  return (
    <button className="icon" aria-label={label} title={label} onClick={act}>
      {children}
    </button>
  );
}
function Logo() {
  return (
    <svg
      className="brand-mark"
      width="39"
      height="34"
      viewBox="0 0 44 36"
      aria-hidden="true"
    >
      <path
        d="m3 28 9-10 8-1 6-8 12 3-3 12-14-3-1-4"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
      {[
        [3, 28],
        [12, 18],
        [20, 17],
        [26, 9],
        [38, 12],
        [35, 24],
        [21, 21],
      ].map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === 3 ? 2.4 : 1.7}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
function Toggle({
  name,
  on,
  change,
}: {
  name: string;
  on: boolean;
  change: () => void;
}) {
  return (
    <button
      className="toggle-row"
      role="switch"
      aria-checked={on}
      onClick={change}
    >
      <span>{name}</span>
      <span className="switch" />
    </button>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  change: (n: number) => void;
}) {
  return (
    <label className="range-label">
      <span>
        {label}
        <output>{value.toFixed(step < 1 ? 1 : 0)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => change(+e.target.value)}
      />
    </label>
  );
}
function signedCoord(n: number, pos: string, neg: string) {
  return Math.abs(n).toFixed(4) + "° " + (n < 0 ? neg : pos);
}
const headings = [
  "Northern",
  "Northeastern",
  "Eastern",
  "Southeastern",
  "Southern",
  "Southwestern",
  "Western",
  "Northwestern",
];
const rates = [-3600, -600, -60, -10, 1, 10, 60, 600, 3600];
export default function App() {
  const [initial] = useState(starting),
    [site, setSite] = useState(initial.site),
    [view, move] = useState(initial.view);
  const [clock, setClock] = useState<Clock>(() => ({
      anchorUtcMs: initial.ms,
      anchorRealMs: performance.now(),
      rate: 1,
      paused: true,
    })),
    [ms, setMs] = useState(initial.ms);
  const [layers, setLayers] = useState({ ...defaults }),
    [id, select] = useState<ObjectId | null>(null),
    [panel, setPanel] = useState(() => innerWidth >= 800),
    [tab, setTab] = useState("observe");
  const [dialog, setDialog] = useState(""),
    [query, setQuery] = useState(""),
    [focused, setFocused] = useState(false),
    [activeHit, setActiveHit] = useState(0),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(false);
  const [catalog, setCatalog] = useState<Catalogue | null>(null),
    [loadError, setLoadError] = useState(""),
    [retry, setRetry] = useState(0);
  const [condition, setCondition] = useState("Dark rural");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const ac = new AbortController();
    setLoadError("");
    loadCatalogue(ac.signal)
      .then((c) => {
        if (!ac.signal.aborted) setCatalog(c);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setLoadError(e.message);
      });
    return () => ac.abort();
  }, [retry]);
  useEffect(() => {
    if (clock.paused) return;
    const tick = () => {
      const now = clockAt(clock, performance.now());
      if (!validInstant(now)) {
        jump(clamp(now, supportedStart, supportedEnd));
        setNotice("Simulation stopped at the supported date boundary.");
      } else setMs(now);
    };
    const timer = window.setInterval(() => {
      if (!document.hidden) tick();
    }, 200);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [clock]);
  useEffect(() => {
    function save() {
      const time = clamp(
        clockAt(clock, performance.now()),
        supportedStart,
        supportedEnd,
      );
      try {
        localStorage.setItem(
          "dipper.observation.v1",
          new URLSearchParams({
            place: site.label,
            lat: String(site.latitudeDeg),
            lon: String(site.longitudeDeg),
            m: String(site.elevationM),
            zone: site.timeZoneId,
            elevation: site.elevationSource,
            utc: new Date(time).toISOString(),
          }).toString(),
        );
      } catch {
        /* The URL still supports sharing. */
      }
    }
    save();
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [site, clock]);
  const [stepUnit, setStepUnit] = useState(60);
  function step(sign: number) {
    jump(
      stepUnit === 1440
        ? stepDay(ms, site.timeZoneId, sign)
        : ms + sign * stepUnit * 60000,
    );
  }
  const sky = useMemo(() => snapshot(site, ms), [site, ms]),
    local = localDate(ms, site.timeZoneId);
  function setTime(t: number, paused: boolean, rate = clock.rate) {
    if (!validInstant(t)) {
      setNotice("The supported date range is 1900–2100.");
      return;
    }
    setMs(t);
    setClock({ anchorUtcMs: t, anchorRealMs: performance.now(), paused, rate });
  }
  function jump(t: number) {
    setTime(t, true);
  }
  function toggle() {
    setTime(clockAt(clock, performance.now()), !clock.paused);
  }
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setLayers((l) => ({ ...l, [key]: value }));
  const searchIndex = useMemo(
    () =>
      catalog?.names.map((n) => ({
        id: n[0],
        name: starName(n),
        desc: n[4] + " · Star",
        match: [
          n[1],
          n[3],
          "HYG " + n[0],
          n[2] && "HIP " + n[2],
          n[5] && "HD " + n[5],
        ]
          .filter(Boolean)
          .join("|")
          .toLowerCase(),
      })) || [],
    [catalog],
  );
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bodies = bodyNames
      .filter((n) => n.toLowerCase().includes(q))
      .map((n) => ({ id: n, name: n, desc: "Solar System" }));
    const stars = q
      ? searchIndex
          .filter((n) => n.match.includes(q))
          .sort(
            (a, b) =>
              Number(b.name.toLowerCase() === q) -
              Number(a.name.toLowerCase() === q),
          )
          .slice(0, 8)
      : searchIndex.filter((n) =>
          ["Sirius", "Polaris", "Betelgeuse"].includes(n.name),
        );
    return q
      ? [...bodies, ...stars].slice(0, 8)
      : [
          ...stars,
          ...bodies.filter((b) => ["Moon", "Jupiter"].includes(b.name)),
        ];
  }, [query, searchIndex]);
  function objectDetails(key: ObjectId | null) {
    if (key === null) return null;
    if (typeof key === "object") {
      const s = key.star;
      return {
        ...s,
        ...starDirection(s, sky.matrix, sky.years - 16),
        title: "Gaia DR3 " + key.sourceId,
        kind: "Star",
        source: "Gaia DR3 · J2016.0",
        extra: key.g.toFixed(2) + " G · estimated V",
      };
    }
    if (typeof key === "string") {
      const b = sky.bodies.find((b) => b.name === key);
      return b
        ? {
            ...b,
            title: b.name,
            kind:
              b.name === "Sun"
                ? "Star"
                : b.name === "Moon"
                  ? "Natural satellite"
                  : "Planet",
            source: "Astronomy Engine · equator of date",
            extra:
              b.name === "Moon"
                ? Math.round(b.illuminatedFraction * 100) +
                  "% lit · " +
                  (b.angularDiameterDeg * 60).toFixed(1) +
                  "′ diameter"
                : b.distanceAu.toFixed(3) + " AU",
          }
        : null;
    }
    const s = catalog?.byId.get(key),
      n = catalog?.names.find((n) => n[0] === key);
    if (!s || !n) return null;
    return {
      ...s,
      ...starDirection(s, sky.matrix, sky.years),
      title: starName(n),
      kind: "Star",
      source: "HYG v4.1 · J2000.0",
      extra: n[2] ? "HIP " + n[2] : "HYG " + s.id,
    };
  }
  const selected = objectDetails(id);
  function find(key: ObjectId) {
    select(key);
    const obj = objectDetails(key);
    if (obj)
      move((v) => ({
        ...v,
        azimuthDeg: obj.azimuthDeg,
        altitudeDeg: clamp(
          altitude(obj, layers.refraction),
          layers.free ? -90 : -10,
          90,
        ),
      }));
    setFocused(false);
    setQuery("");
    search.current?.blur();
    if (innerWidth < 800) setPanel(false);
  }
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      document.documentElement
        .requestFullscreen?.()
        .catch(() => setNotice("Fullscreen is unavailable in this browser."));
  }
  async function share() {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      place: site.label,
      lat: String(site.latitudeDeg),
      lon: String(site.longitudeDeg),
      m: String(site.elevationM),
      zone: site.timeZoneId,
      elevation: site.elevationSource,
      utc: new Date(ms).toISOString(),
      az: view.azimuthDeg.toFixed(3),
      alt: view.altitudeDeg.toFixed(3),
      fov: view.verticalFovDeg.toFixed(2),
    }).toString();
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("The address bar now contains your shareable observation.");
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.key === " " &&
        !e.defaultPrevented &&
        !dialog &&
        !(e.target as HTMLElement).closest(
          "input,select,textarea,button,a,canvas,[contenteditable=true]",
        )
      ) {
        e.preventDefault();
        toggle();
        return;
      }
      if (
        e.key === "/" &&
        !dialog &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, clock]);
  const sunAlt = sky.bodies[0].geometricAltitudeDeg,
    skyPhase =
      sunAlt >= 0 ? "Daylight" : sunAlt > -18 ? "Twilight" : "Night sky";
  const state = { sky, view, layers, selected: id };
  const coord =
    signedCoord(site.latitudeDeg, "N", "S") +
    "   " +
    signedCoord(site.longitudeDeg, "E", "W");
  const dayStart = local.startOf("day"),
    dayEnd = dayStart.plus({ days: 1 }),
    dayLength = +dayEnd - +dayStart;
  function north() {
    move((v) => ({ ...v, azimuthDeg: 0, altitudeDeg: 35 }));
  }
  function zoom(delta: number) {
    move((v) => ({
      ...v,
      verticalFovDeg: clamp(v.verticalFovDeg + delta, 10, 100),
    }));
  }
  return (
    <div className="instrument">
      <header className="mast">
        <div className="identity">
          <Logo />
          <h1>Dipper</h1>
          <span className="subtitle">Night sky simulator</span>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Search sky objects"
            placeholder="Find a star or planet"
            ref={search}
            value={query}
            aria-autocomplete="list"
            aria-controls={focused ? "sky-results" : undefined}
            aria-activedescendant={
              focused && hits[activeHit] ? "sky-hit-" + activeHit : undefined
            }
            onFocus={() => {
              setActiveHit(0);
              setFocused(true);
            }}
            onBlur={() => setFocused(false)}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveHit(0);
              setFocused(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setFocused(false);
                search.current?.blur();
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (hits.length)
                  setActiveHit(
                    (i) =>
                      (i + (e.key === "ArrowDown" ? 1 : -1) + hits.length) %
                      hits.length,
                  );
              }
              if (e.key === "Enter" && hits[activeHit])
                find(hits[activeHit].id);
            }}
          />
          <kbd>/</kbd>
          {focused && (
            <div
              className="results"
              id="sky-results"
              role="listbox"
              aria-label="Matching objects"
              onMouseDown={(e) => e.preventDefault()}
            >
              {hits.length ? (
                hits.map((h, i) => (
                  <button
                    key={h.id}
                    role="option"
                    id={"sky-hit-" + i}
                    aria-selected={i === activeHit}
                    tabIndex={-1}
                    onClick={() => find(h.id)}
                  >
                    {h.name}
                    <small>{h.desc}</small>
                  </button>
                ))
              ) : (
                <p>No matching objects</p>
              )}
            </div>
          )}
        </div>
        <div className="mast-actions">
          <button
            className="plain share"
            aria-label="Share view"
            onClick={share}
          >
            {copied ? <Check /> : <Share2 />}
            <span>{copied ? "Copied" : "Share view"}</span>
          </button>
          <IconButton label="Fullscreen" act={fullscreen}>
            <Maximize />
          </IconButton>
        </div>
      </header>
      <div className={"workspace" + (panel ? " panel-open" : "")}>
        {panel && (
          <aside>
            <div className="side-top">
              <h2>Observatory</h2>
              <IconButton label="Hide controls" act={() => setPanel(false)}>
                <PanelLeft />
              </IconButton>
            </div>
            <div className="tabs">
              <button
                aria-pressed={tab === "observe"}
                onClick={() => setTab("observe")}
              >
                <Compass />
                Observe
              </button>
              <button
                aria-pressed={tab === "layers"}
                onClick={() => setTab("layers")}
              >
                <Layers />
                Layers
              </button>
            </div>
            <div className="scroll-panel">
              {tab === "observe" ? (
                <>
                  <section>
                    <h3>
                      <MapPin />
                      Observer location
                    </h3>
                    <button
                      className="field city"
                      onClick={() => setDialog("location")}
                    >
                      {site.label}
                      <ChevronDown />
                    </button>
                    <p className="coordinates">{coord}</p>
                    <button
                      className="text-link"
                      onClick={() => setDialog("location")}
                    >
                      <MapIcon />
                      Open world map
                      <ChevronRight />
                    </button>
                  </section>
                  <section>
                    <h3>
                      <Clock3 />
                      Date &amp; time
                    </h3>
                    <button className="field" onClick={() => setDialog("time")}>
                      <CalendarDays />
                      {local.toFormat("dd LLL yyyy")}
                      <span className="field-right">
                        {local.toFormat("HH:mm")}
                      </span>
                    </button>
                    <p className="hint">
                      {site.timeZoneId} · UTC{local.toFormat("ZZ")}
                    </p>
                    <button
                      className="text-link"
                      onClick={() => jump(Date.now())}
                    >
                      <RotateCcw />
                      Reset to now
                    </button>
                  </section>
                  <section>
                    <h3>
                      <Layers />
                      Sky layers
                    </h3>
                    <Toggle
                      name="Constellation lines"
                      on={layers.lines}
                      change={() => set("lines", !layers.lines)}
                    />
                    <Toggle
                      name="Object labels"
                      on={layers.labels}
                      change={() => set("labels", !layers.labels)}
                    />
                    <Toggle
                      name="Coordinate grid"
                      on={layers.grid}
                      change={() => set("grid", !layers.grid)}
                    />
                    <button
                      className="text-link"
                      onClick={() => setTab("layers")}
                    >
                      <SlidersHorizontal />
                      All layer settings
                      <ChevronRight />
                    </button>
                  </section>
                </>
              ) : (
                <>
                  <section>
                    <h3>
                      <Layers />
                      Display
                    </h3>
                    {(
                      [
                        ["lines", "Constellation lines"],
                        ["asterisms", "Dipper & triangle asterisms"],
                        ["labels", "Object labels"],
                        ["grid", "Coordinate grid"],
                        ["dust", "Milky Way density"],
                        ["refraction", "Standard refraction"],
                        ["free", "Look below horizon"],
                        ["deep", "Gaia deep fields"],
                      ] as const
                    ).map(([k, n]) => (
                      <Toggle
                        key={k}
                        name={n}
                        on={layers[k]}
                        change={() => {
                          set(k, !layers[k]);
                          if (k === "free" && layers.free)
                            move((v) => ({
                              ...v,
                              altitudeDeg: Math.max(-10, v.altitudeDeg),
                            }));
                        }}
                      />
                    ))}
                    {layers.deep && (
                      <p className="hint">
                        Gaia DR3 covers the Orion belt field at 25° FOV and
                        closer.
                      </p>
                    )}
                  </section>
                  <section>
                    <h3>
                      <SlidersHorizontal />
                      Visibility
                    </h3>
                    <label>
                      Sky preset
                      <select
                        value={condition}
                        onChange={(e) => {
                          setCondition(e.target.value);
                          const i = e.target.selectedIndex;
                          setLayers((l) => ({
                            ...l,
                            limit: [6.5, 5.2, 3.8][i],
                            glow: [0.1, 0.5, 1][i],
                          }));
                        }}
                      >
                        {["Dark rural", "Suburban", "Urban"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <Range
                      label="Limiting V magnitude"
                      value={layers.limit}
                      min={1}
                      max={8}
                      step={0.1}
                      change={(n) => set("limit", n)}
                    />
                    <Range
                      label="Sky glow"
                      value={layers.glow}
                      min={0}
                      max={1}
                      step={0.1}
                      change={(n) => set("glow", n)}
                    />
                    <Range
                      label="Exposure"
                      value={layers.exposure}
                      min={0.4}
                      max={2}
                      step={0.1}
                      change={(n) => set("exposure", n)}
                    />
                    <Range
                      label="Extinction (mag/airmass)"
                      value={layers.extinction}
                      min={0}
                      max={0.5}
                      step={0.05}
                      change={(n) => set("extinction", n)}
                    />
                  </section>
                </>
              )}
            </div>
            <button className="credits" onClick={() => setDialog("credits")}>
              <Info />
              Data &amp; credits
              <ChevronRight />
            </button>
          </aside>
        )}
        <main>
          <div className="sky-area">
            {catalog ? (
              <Viewport
                catalog={catalog}
                state={state}
                move={move}
                select={select}
                toggle={toggle}
                onNotice={setNotice}
              />
            ) : (
              <div className="sky-error" role="status">
                {loadError || "Loading HYG star catalogue…"}
                {loadError && (
                  <button onClick={() => setRetry((n) => n + 1)}>
                    Retry catalogue
                  </button>
                )}
              </div>
            )}
            <div className="chart-title">
              {!panel && (
                <button className="plain reveal" onClick={() => setPanel(true)}>
                  <PanelLeft />
                  Controls
                </button>
              )}
              <h2>
                {headings[Math.round(wrap(view.azimuthDeg) / 45) % 8]} sky
              </h2>
              <span>
                {site.label} <b>·</b> {local.toFormat("dd LLL yyyy")}
              </span>
            </div>
            <div className="phase">
              {sunAlt >= 0 ? <Sun /> : <Moon />}
              {skyPhase}
            </div>
            {selected && (
              <article className="detail">
                <div className="detail-head">
                  <span>{selected.kind}</span>
                  <IconButton label="Clear selection" act={() => select(null)}>
                    <X />
                  </IconButton>
                </div>
                <h2>{selected.title}</h2>
                <p>{selected.extra}</p>
                <div className="object-data">
                  <span>
                    Azimuth <b>{selected.azimuthDeg.toFixed(2)}°</b>
                  </span>
                  <span>
                    Altitude{" "}
                    <b>{altitude(selected, layers.refraction).toFixed(2)}°</b>
                  </span>
                  <span>
                    Visual magnitude <b>{selected.magnitudeV.toFixed(2)} V</b>
                  </span>
                </div>
                <small>
                  {altitude(selected, layers.refraction) < 0
                    ? "Below horizon · "
                    : ""}
                  {layers.refraction ? "Standard atmosphere" : "Geometric"}
                  <br />
                  {selected.source} · RA {(selected.raDeg / 15).toFixed(2)} h /
                  Dec {selected.decDeg.toFixed(2)}°
                </small>
              </article>
            )}
            <div className="chart-tools">
              <IconButton label="Face north" act={north}>
                <Compass />
              </IconButton>
              <span />
              <IconButton label="Zoom in" act={() => zoom(-5)}>
                <Plus />
              </IconButton>
              <IconButton label="Zoom out" act={() => zoom(5)}>
                <Minus />
              </IconButton>
            </div>
            <div className="view-hud">
              <span>
                AZ{" "}
                <b>
                  {view.azimuthDeg.toFixed(1)}° {compass(view.azimuthDeg)}
                </b>
              </span>
              <span>
                ALT <b>{view.altitudeDeg.toFixed(1)}°</b>
              </span>
              <span>
                FOV <b>{view.verticalFovDeg.toFixed(0)}°</b>
              </span>
            </div>
          </div>
          <div className="timeline">
            <div className="time-read">
              <span>Local time</span>
              <strong>{local.toFormat("HH:mm:ss")}</strong>
            </div>
            <div className="transport">
              <button
                className="play"
                aria-label={clock.paused ? "Play time" : "Pause time"}
                onClick={toggle}
              >
                {clock.paused ? <Play /> : <Pause />}
              </button>
              <select
                aria-label="Time rate"
                value={clock.rate}
                onChange={(e) =>
                  setTime(
                    clockAt(clock, performance.now()),
                    false,
                    +e.target.value,
                  )
                }
              >
                {rates.map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </div>
            <div className="scrub">
              <label htmlFor="day-slider">
                Time of day <span>{local.toFormat("dd LLL")}</span>
              </label>
              <input
                id="day-slider"
                type="range"
                min="0"
                max={dayLength - 1}
                value={ms - +dayStart}
                step="60000"
                onChange={(e) => jump(+dayStart + +e.target.value)}
              />
              <div>
                <span>00h</span>
                <span>06h</span>
                <span>12h</span>
                <span>18h</span>
                <span>24h</span>
              </div>
            </div>
            <div className="steps">
              <label htmlFor="step">Step time</label>
              <div className="step-controls">
                <IconButton label="Step backward" act={() => step(-1)}>
                  <ChevronLeft />
                </IconButton>
                <select
                  id="step"
                  value={stepUnit}
                  onChange={(e) => setStepUnit(+e.target.value)}
                >
                  <option value={1}>1 min</option>
                  <option value={60}>1 hour</option>
                  <option value={1440}>1 day</option>
                </select>
                <IconButton label="Step forward" act={() => step(1)}>
                  <ChevronRight />
                </IconButton>
              </div>
            </div>
          </div>
        </main>
      </div>
      <footer>
        <span className="status-dot" />
        <span>
          {catalog
            ? catalog.stars.length.toLocaleString("en-US") + " catalogue stars"
            : "Catalogue loading"}{" "}
          <i>·</i> HYG v4.1
        </span>
        <span className="instruction">
          <MousePointer2 />
          Drag to look <i>·</i> Scroll to zoom
        </span>
        <time dateTime={new Date(ms).toISOString()}>
          {new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC
        </time>
        {!panel && (
          <IconButton label="Data and credits" act={() => setDialog("credits")}>
            <Info />
          </IconButton>
        )}
      </footer>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <IconButton label="Dismiss notice" act={() => setNotice("")}>
            <X />
          </IconButton>
        </div>
      )}
      {dialog && (
        <Dialog
          title={
            dialog === "location"
              ? "Observer location"
              : dialog === "time"
                ? "Observation time"
                : "Data & credits"
          }
          close={() => setDialog("")}
        >
          {dialog === "location" ? (
            <Suspense fallback={<p>Loading map…</p>}>
              <LocationPicker
                site={site}
                onSave={(s: Observer) => {
                  setSite(s);
                  setDialog("");
                }}
              />
            </Suspense>
          ) : dialog === "time" ? (
            <TimeEditor
              ms={ms}
              zone={site.timeZoneId}
              save={(n) => {
                jump(n);
                setDialog("");
              }}
            />
          ) : (
            <div className="credit-content">
              <h3>Star catalogue</h3>
              <p>
                HYG v4.1 by David Nash / Astronexus, CC BY-SA 4.0. Dipper uses
                J2000 positions, proper motion, visual magnitudes and B−V
                colours. The Milky Way layer maps the density of fainter HYG
                stars.
              </p>
              <h3>Solar system &amp; sky figures</h3>
              <p>
                Astronomy Engine by Don Cross computes topocentric directions.
                Western constellation figures come from Olaf Frohn’s
                D3-Celestial. Deep fields use ESA Gaia DR3, processed by DPAC.
              </p>
              <h3>Observing conditions</h3>
              <p>
                The horizon is ideal. Refraction assumes a standard atmosphere.
                Sky glow, extinction and exposure are visual settings. Observer
                elevation is {site.elevationM} m ({site.elevationSource}).
              </p>
              <p>
                <a
                  href="./data-provenance.txt"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read source revisions, transformations and licences ↗
                </a>
              </p>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
