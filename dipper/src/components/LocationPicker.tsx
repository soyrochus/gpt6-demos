import { useState, useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { location, presets } from "../astro/time";
import type { Observer } from "../astro/sky";
import { addWorldMap, worldMaxZoom } from "./worldMap";
export function LocationPicker({
  site,
  onSave,
}: {
  site: Observer;
  onSave: (s: Observer) => void;
}) {
  const [lat, setLat] = useState(String(site.latitudeDeg)),
    [lon, setLon] = useState(String(site.longitudeDeg)),
    [elev, setElev] = useState(String(site.elevationM));
  const [manual, setManual] = useState(site.elevationSource === "manual"),
    [label, setLabel] = useState(site.label),
    [zone, setZone] = useState(site.timeZoneId);
  const [error, setError] = useState(""),
    [streets, setStreets] = useState(false),
    [detailStatus, setDetailStatus] = useState<"loading" | "failed" | "idle">(
      "idle",
    ),
    [map, setMap] = useState<L.Map | null>(null);
  const div = useRef<HTMLDivElement>(null),
    mark = useRef<L.CircleMarker | null>(null);
  function point(lat: number, lon: number, name = "Custom location") {
    setLat(String(+lat.toFixed(5)));
    setLon(String(+lon.toFixed(5)));
    setLabel(name);
    setError("");
    try {
      setZone(location(name, lat, lon).timeZoneId);
    } catch {
      setZone("");
    }
  }
  useEffect(() => {
    const container = div.current!;
    let instance: L.Map | undefined;
    function resize() {
      // On a repeat open the lazy component may mount inside a still-closed dialog.
      if (!container.clientWidth || !container.clientHeight) return;
      if (instance) {
        instance.invalidateSize({ animate: false });
        return;
      }
      instance = L.map(container, {
        minZoom: 1,
        maxZoom: worldMaxZoom,
        maxBounds: [
          [-85.05113, -180],
          [85.05113, 180],
        ],
        maxBoundsViscosity: 1,
        scrollWheelZoom: false,
      }).setView([site.latitudeDeg, site.longitudeDeg], 2);
      addWorldMap(instance);
      mark.current = L.circleMarker([site.latitudeDeg, site.longitudeDeg], {
        color: "#142d27",
        fillColor: "#c7efcc",
        fillOpacity: 1,
        radius: 7,
        interactive: false,
        className: "observer-marker",
      }).addTo(instance);
      instance.on("click", (e) => point(e.latlng.lat, e.latlng.lng));
      setMap(instance);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      observer.disconnect();
      instance?.remove();
      mark.current = null;
    };
  }, []);
  useEffect(() => {
    if (!streets || !map) return;
    const tiles = L.tileLayer(
      import.meta.env.VITE_MAP_TILE_URL ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          import.meta.env.VITE_MAP_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        noWrap: true,
        opacity: 0,
      },
    );
    let failed = false;
    function fallback() {
      failed = true;
      setDetailStatus("failed");
      setStreets(false);
    }
    tiles
      .on("tileerror", fallback)
      .on("load", () => {
        if (failed) return;
        tiles.setOpacity(1);
        map.setMaxZoom(18);
        setDetailStatus("idle");
      })
      .addTo(map);
    return () => {
      if (map.hasLayer(tiles)) {
        tiles.remove();
        map.setMaxZoom(worldMaxZoom);
      }
      tiles.off();
    };
  }, [streets, map]);
  useEffect(() => {
    if (lat && lon && Math.abs(+lat) <= 90 && Math.abs(+lon) <= 180)
      mark.current?.setLatLng([+lat, +lon]);
  }, [lat, lon]);
  function editCoords(a: string, b: string) {
    setLat(a);
    setLon(b);
    setLabel("Custom location");
    if (a && b) {
      try {
        setZone(location("", +a, +b).timeZoneId);
      } catch {
        setZone("");
      }
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(location(label, +lat, +lon, +elev, zone || undefined, manual));
        } catch (e) {
          setError(String(e instanceof Error ? e.message : e));
        }
      }}
    >
      <div
        className="map"
        ref={div}
        aria-label="Click the map to select coordinates"
      />
      <label className="street-detail">
        <input
          type="checkbox"
          checked={streets}
          onChange={(e) => {
            setStreets(e.target.checked);
            setDetailStatus(e.target.checked ? "loading" : "idle");
          }}
        />
        Online street detail
      </label>
      {detailStatus !== "idle" && (
        <p className="map-status hint" role="status">
          {detailStatus === "loading"
            ? "Loading street detail…"
            : "Street detail is unavailable. The world map is ready to use."}
        </p>
      )}
      <label>
        Observer preset
        <select
          aria-label="Observer preset"
          value={presets.some((s) => s.label === label) ? label : ""}
          onChange={(e) => {
            const s = presets.find((s) => s.label === e.target.value);
            if (s) {
              point(s.latitudeDeg, s.longitudeDeg, s.label);
              setElev("0");
              setManual(false);
              map?.panTo([s.latitudeDeg, s.longitudeDeg]);
            }
          }}
        >
          <option value="">Custom location</option>
          {presets.map((s) => (
            <option key={s.label}>{s.label}</option>
          ))}
        </select>
      </label>
      <div className="two">
        <label>
          Latitude (°)
          <input
            required
            type="number"
            step="any"
            min="-90"
            max="90"
            value={lat}
            onChange={(e) => editCoords(e.target.value, lon)}
          />
        </label>
        <label>
          Longitude (°)
          <input
            required
            type="number"
            step="any"
            min="-180"
            max="180"
            value={lon}
            onChange={(e) => editCoords(lat, e.target.value)}
          />
        </label>
      </div>
      <div className="two">
        <label>
          Elevation (m)
          <input
            required
            type="number"
            step="any"
            value={elev}
            onChange={(e) => {
              setElev(e.target.value);
              setManual(true);
            }}
          />
        </label>
        <label>
          Time zone
          <input
            required
            list="zones"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          />
          <datalist id="zones">
            {["UTC", ...Intl.supportedValuesOf("timeZone")].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </datalist>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button className="primary">Apply location</button>
    </form>
  );
}
