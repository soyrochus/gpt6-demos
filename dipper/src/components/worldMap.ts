import L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import worldJson from "../assets/world.geojson?raw";

type Country = {
  name: string;
  minZoom: number;
  rank: number;
  anchor: [number, number];
};

const world: FeatureCollection<Polygon | MultiPolygon, Country> =
  JSON.parse(worldJson);
const countries = world.features
  .map((f) => f.properties)
  .sort((a, b) => a.rank - b.rank);
export const worldMaxZoom = 8;

// Both panes stay behind street tiles, so gaps always reveal local geography.
export function addWorldMap(map: L.Map) {
  map.createPane("worldLand").style.zIndex = "180";
  map.createPane("worldNames").style.zIndex = "190";
  L.geoJSON(world, {
    pane: "worldLand",
    interactive: false,
    style: {
      className: "map-country",
      color: "#769397",
      weight: 0.8,
      fillColor: "#476166",
      fillOpacity: 1,
    },
    attribution:
      '<a href="https://www.naturalearthdata.com/">Natural Earth</a>',
  }).addTo(map);

  const labels = L.layerGroup().addTo(map);
  function labelCountries() {
    labels.clearLayers();
    const size = map.getSize(),
      zoom = map.getZoom();
    const occupied: L.Bounds[] = [];
    for (const country of countries) {
      if (zoom < country.minZoom) continue;
      const point = map.latLngToContainerPoint(country.anchor);
      const halfWidth = country.name.length * 3.2 + 4;
      const box = L.bounds(
        point.subtract([halfWidth, 8]),
        point.add([halfWidth, 8]),
      );
      if (
        !L.bounds([0, 0], size).contains(box) ||
        occupied.some((other) => other.intersects(box))
      )
        continue;
      const text = document.createElement("span");
      text.textContent = country.name;
      L.marker(country.anchor, {
        pane: "worldNames",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "map-country-label",
          html: text,
          iconSize: [0, 0],
        }),
      }).addTo(labels);
      occupied.push(box);
    }
  }
  labelCountries();
  map.on("moveend resize", labelCountries);
}
