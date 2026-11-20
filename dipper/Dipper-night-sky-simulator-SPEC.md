# Night Sky Simulator — Implementation Specification

**Status:** Implementation-ready specification  
**Date:** 19 November 2026  
**Target:** Browser-based, scientifically accurate, interactive night-sky simulator  
**Required stack:** Bun, TypeScript, Three.js  
**Intended reader:** Autonomous code-generation agent and reviewing software engineer

## 0. Implementation contract for the coding agent

Build a **working application** in which a user selects a location on Earth, chooses a date and time, and explores the astronomically correct sky from that location in an interactive Three.js scene. Accurate star positions, planetary ephemerides, horizon orientation, and time handling are the core of the product. The terrain may be generic. A photographic reconstruction of the selected place is not required.

**Non-negotiable rules:**

1. Use **Bun** for package management, scripts, and development commands. Use **TypeScript** throughout the application and data-processing tooling. Use **Three.js** for the 3D sky, with `WebGLRenderer` and custom shaders where needed.
2. Use **real astronomical source data**. Do not ship randomly generated stars, fabricated planetary positions, a hardcoded decorative sky, or a rotating panoramic photograph presented as an astronomical calculation.
3. Implement the actual vertical slice first: real catalogue → astronomical coordinates → local coordinates → Three.js sky → working location and time controls. Do not spend the first iterations building elaborate infrastructure or secondary UI.
4. Treat astronomical accuracy and visual realism as **different qualities**. Precise celestial direction is mandatory. Physically exact observed brightness, clouds, buildings, and terrain are not possible without additional local data and are outside the baseline.
5. Keep units, epochs, coordinate frames, and provenance explicit. Never silently assume that a right ascension expressed in hours is in degrees, or that catalogue coordinates from different epochs are interchangeable.
6. Provide automated mathematical and end-to-end tests. Check selected positions against an **independent** astronomical reference, not just a second invocation of the same calculation.
7. Do not use placeholders to satisfy acceptance criteria. If a catalogue download or asset is unavailable, expose the failure with a documented recovery path instead of replacing it with fake content.
8. Keep the system small. No microservices, database, cloud deployment, authentication, Python runtime, paid model/API, or server-side rendering is required for the initial release.

The first runnable milestone must already show the **real sky**. It is unacceptable to finish only an attractive shell around mocked celestial objects.

## 1. Product objective and experience

The application is a digital planetarium focused on one question: **What would an observer see in the sky from this place, looking in this direction, at this time?**

The user can:

- Choose a point by clicking on a world map or entering coordinates.
- Specify an observation date and time, with the geographical time zone handled correctly.
- Enter a full-screen or large-panel 3D view from the chosen position.
- Look around through a full 360° azimuth and from horizon to zenith, with a free-look mode that can also look below the horizon when requested.
- Change viewing direction and field of view without changing the astronomical positions.
- See real stars, including their relative brightness and approximate colour; the Sun, Moon and major planets; horizon, compass directions, and an optional reference grid.
- Advance, reverse, pause, or reset simulated time and observe the movement of the sky.
- Click or search for a prominent celestial object to show its name, current azimuth, altitude, brightness and other available information.
- Switch optional visual aids such as constellation lines, labels, coordinate grid and light-pollution presets.

This is an **Earth-based view into a 3D celestial dome**, not initially a free-flight spacecraft simulator. Stars are placed at an arbitrary but constant scene radius according to their observed angular directions. Actual distance-based galactic travel is a separate future feature.

### 1.1 Experience examples

- Choose Valencia, Spain, at 23:00 local time; the visible stars and planets must correspond to the exact UTC instant represented by the chosen date.
- Change to Cape Town at the same UTC instant; the visible hemisphere and horizon relationship change while the underlying astronomical catalogues remain the same.
- Turn to north: north is always aligned with azimuth 0°, east 90°, south 180°, west 270°.
- Advance time by four hours: the celestial sphere progresses by approximately four sidereal hours of rotation, while the Moon and planets follow their calculated motion.
- Zoom into the Moon: its position and illuminated fraction are calculated, not chosen from a fixed image sequence.

### 1.2 Accuracy terminology

The UI and documentation must distinguish:

- **Geometric sky:** angular direction of each object. The target is observational accuracy substantially finer than normal unaided visual resolution.
- **Visual sky:** apparent brightness, colour, sky glow, glare, extinction and the Milky Way. These are simulations with adjustable environmental assumptions.
- **Horizon:** initially an ideal geometric horizon with a generic silhouette. Local mountains, trees and buildings are not claimed to be accurate.

The application must not label an atmospheric or light-pollution setting as real-time weather unless it is connected to an actual, identified data source.

## 2. Technology and architectural decisions

| Concern | Decision | Rationale |
|---|---|---|
| Runtime, tooling, packages | **Bun** | Single JavaScript/TypeScript toolchain |
| Application | **React + TypeScript + Vite** | Small client application, predictable dev/build workflow |
| 3D scene | **Three.js `WebGLRenderer` (WebGL2)** | Mature shader and point-sprite support |
| Stars | Three.js `BufferGeometry` + `ShaderMaterial` | One/few draw calls with magnitude-dependent star sprites |
| Ephemerides and coordinate transforms | **`astronomy-engine`** JavaScript package | Topocentric Sun/Moon/planet calculations and reference-frame rotations |
| Initial star data | **HYG v4.1** curated real-star catalogue | Self-contained, practical starting dataset with visual magnitude and B−V colour index |
| Enrichment source | **ESA Gaia DR3**, with Hipparcos for bright-star completeness | Deeper zoom, photometry, proper motion and cross-checks |
| Map | **Leaflet** and a configurable standards-compatible tile provider | A location picker without a mandatory Google billing account |
| Google Maps | Optional provider adapter, enabled only when a user supplies an API key | Google Maps was an example, not a required dependency |
| Time-zone UI | A maintained IANA time-zone lookup and timezone-aware date library | Avoid DST and UTC mistakes |
| Tests | `bun test` plus **Playwright** browser tests | Mathematical and interaction verification |
| Deployment | Static build | No app backend required for core astronomy or catalogue queries |

**Renderer decision:** Start with WebGL, not Three.js WebGPU. Current Three.js documentation states that WebGPU point primitives are limited to one-pixel points unless sprite instancing is used. WebGL `ShaderMaterial` provides a direct path to properly sized star sprites. Do not implement two rendering backends in the first version.

**Mapping decision:** Leaflet uses an attribution-compliant public map configuration for development. Map tiles must be configurable. Do not build a commercial product assuming unlimited access to OpenStreetMap Foundation's public tile service. An optional Google Maps adapter may be added without changing the astronomical domain model.

## 3. Scope and priorities

### P0 — Mandatory functional release

P0 is complete only when all of the following work end to end:

1. A real, versioned bright-star catalogue is imported and rendered, with prominent named stars.
2. The observer can be placed at arbitrary valid latitude and longitude with an optional elevation.
3. Date/time controls change the **physical astronomical sky**, not a texture-only animation.
4. The Sun, Moon, Mercury, Venus, Mars, Jupiter and Saturn are placed with real topocentric ephemerides. Uranus and Neptune are supported if their calculations are available through the selected library; Pluto may be included but is not required.
5. The Moon's illumination and approximate angular diameter change correctly.
6. Stars below the effective horizon are hidden; north/east/south/west and zenith align correctly.
7. User can drag to look, zoom, reset heading, use a time slider, pause/play time, and open object details.
8. Time zones, coordinate frames, loading errors and resource cleanup are handled correctly.
9. Automated tests include independent reference fixtures and a real rendered browser test.

### P1 — Expected visual and exploration quality

Implement after P0 is verified:

- Smooth astronomical Milky Way background from an actual licensed sky map or documented astronomical density product, aligned to the same celestial coordinate frame as the stars.
- Constellation line overlay from a documented reference dataset, asterisms and selected labels.
- Brightness controls, a basic physically motivated atmospheric extinction/refraction mode and sky-glow presets.
- Deep zoom option with a **separate Gaia DR3 data tier**; only download the magnitude/sky-region data needed by the viewer.
- Search by common star name and prominent designation; point camera to object.
- Keyboard shortcuts, shareable URL, mobile layout, and visual quality refinements.

### P2 — Explicitly deferred

Accurate terrain horizon using digital elevation models, individual buildings, Street View/photogrammetry, live cloud forecasts, aurora prediction, meteor shower simulation, satellite passes, telescope control, detailed planet surface maps, telescope-grade tracking, true 3D galactic travel, user accounts and saved tours. None may delay P0.

## 4. Application layout and interaction design

### 4.1 Desktop arrangement

- The **sky viewport** occupies most of the screen. It may go full-screen.
- A compact, collapsible **control panel** contains Location, Date & Time, Time Flow, View, Visibility and Layers.
- A small interactive **map** opens as a panel/modal; clicking a point selects the observer position. Latitude and longitude input is available beside it.
- A narrow unobtrusive **HUD** shows location label, precise latitude/longitude, local civil time, UTC offset, facing azimuth, look altitude and current field of view.
- A **selection card** presents details for the selected object; it never covers the middle of the sky.
- There is a visible **Reset to Now** and **Face North** action.

Use a clean scientific-instrument aesthetic: dark neutral sky, restrained panels, legible typography, no extravagant dashboard, no decorative science-fiction controls. The renderer is the product.

### 4.2 Controls

| Interaction | Behaviour |
|---|---|
| Pointer drag | Change camera yaw and pitch; horizontal motion has stable compass semantics |
| Mouse wheel/trackpad | Adjust camera FOV continuously within configured bounds |
| Touch drag/pinch | Look and zoom without unintended page scrolling in the viewport |
| Arrow keys | Rotate heading or altitude when the sky viewport has focus |
| `N` | Face north at a useful default altitude |
| Space | Pause/resume simulated time, unless focus is inside a form field |
| `+` and `-` | Zoom in/out |
| Click object | Select object through raycast or angular hit test |
| Click empty sky | Deselect object; no artificial new star |
| Enter coordinates | Validate and move the observer, preserving current UTC instant |
| Change local time | Convert unambiguously to UTC at that location |

Minimum FOV: **10°**. Maximum: **100°**. Default: **75°** vertical FOV. Default camera direction: azimuth **180°**, altitude **35°**; users can reset to north. Preserve the actual selected azimuth across time and location changes.

### 4.3 Location

The location state is `{ latitudeDeg, longitudeDeg, elevationM, timeZoneId, label, elevationSource }`.

- Accept latitude in `[-90, +90]`, longitude in `[-180, +180]`, and finite elevation in metres.
- Longitude convention: positive east, negative west.
- Default elevation `0 m` with an explicit `assumed` marker; changing elevation must affect topocentric planetary positions.
- The user can override elevation manually. Elevation is **not inferred from map zoom or basemap imagery**.
- A map click returns numerical coordinates; reverse geocoding and labels are optional conveniences, not inputs to the astronomy engine.
- Resolve an IANA time-zone ID from the coordinates. If lookup fails or is ambiguous near a border, expose a user-editable time-zone selector. Persist both the IANA ID and UTC instant.
- Provide several demo locations only as observer presets, never as substitutes for a functional map or coordinates input: Valencia, Cape Town, Reykjavík, Sydney and the equator at 0° longitude.

### 4.4 Date and simulated time

- **Canonical time:** UTC ISO 8601 instant, e.g. `2026-11-19T22:00:00.000Z`.
- **Presentation:** date/time in the selected observer's IANA time zone, plus a secondary UTC display.
- Input ambiguity during DST fall-back must be resolved explicitly: offer first/second occurrence or show UTC offset. Non-existent local times during spring-forward must be rejected with explanation.
- Time speeds: paused, real-time 1×, ±10×, ±60×, ±600× and ±3600×. Reverse time is supported.
- Provide step buttons: ±1 minute, ±1 hour and ±1 day; the local-day step must preserve intended local civil time, including DST transitions, where possible.
- Keep simulated clock in one authoritative store; do **not** independently advance time in React, the astronomy service and the renderer.
- Show an indicator when the Sun is above the horizon; the sky must not pretend it is a dark night at noon.

## 5. Data model and units

Use a strict model rather than passing untyped `number` values without context. Suffix fields with units and document frames.

```typescript
type Observer = {
  latitudeDeg: number;
  longitudeDeg: number;       // East-positive
  elevationM: number;
  timeZoneId: string;         // IANA identifier
  label: string;
  elevationSource: "manual" | "service" | "assumed";
};

type SimulationClock = {
  instantUtcMs: number;       // Unix milliseconds
  rate: number;               // Simulated seconds / real second; signed
  paused: boolean;
};

type ViewState = {
  azimuthDeg: number;         // 0 N, 90 E, 180 S, 270 W
  altitudeDeg: number;        // Horizon 0, zenith 90
  verticalFovDeg: number;
};

type CelestialDirection = {
  azimuthDeg: number;
  geometricAltitudeDeg: number;
  apparentAltitudeDeg: number;
};

type StarRecord = {
  id: number;
  source: "hyg" | "hipparcos" | "gaia-dr3";
  sourceEpochJulianYear: number;
  raDeg: number;
  decDeg: number;
  pmRaStarMasPerYear: number | null; // mu_alpha* = mu_alpha cos(dec)
  pmDecMasPerYear: number | null;
  apparentMagnitudeV: number | null;
  apparentMagnitudeG: number | null;
  colorIndexBV: number | null;
  colorIndexBpRp: number | null;
  name?: string;
};

type SolarSystemObject = {
  key: "sun" | "moon" | "mercury" | "venus" | "mars" |
       "jupiter" | "saturn" | "uranus" | "neptune";
  direction: CelestialDirection;
  angularDiameterDeg: number | null;
  magnitude: number | null;
  illuminatedFraction: number | null;
};
```

The normalized data model distinguishes visual magnitude **V** and Gaia **G**. They are different photometric bands. Do not merge them numerically as if they were identical. Use a documented colour-dependent conversion or a calibrated visual model when combining catalogues.

## 6. Astronomical data ingestion

### 6.1 Initial catalogue: HYG v4.1

Use the HYG database, version **4.1**, as the bootstrap source. It is assembled from Hipparcos, the Yale Bright Star catalogue and nearby-star catalogues; it includes actual positions, proper motions, common names, visual magnitudes and B−V colour indices. Its published fields include `id`, `hip`, `ra`, `dec`, `pmra`, `pmdec`, `mag`, `ci`, `proper`, and designations.

Source: `https://github.com/astronexus/HYG-Database/tree/main/hyg/CURRENT`  
Schema: `https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md`  
Licence: **CC BY-SA 4.0**. Preserve attribution and evaluate derivative data redistribution obligations. Include a visible About/Data Credits area and a `docs/DATA_PROVENANCE.md` file.

The importer must:

1. Obtain an exact pinned HYG 4.1 source file or accept a manually placed official HYG file. Document canonical URL, pinned revision and checksum. Do not silently download whatever `main` points to without recording the revision and checksum.
2. Parse CSV robustly, including quoted names and missing fields. Use a streaming parser for the source file; do not treat CSV as a trivial comma split.
3. Validate source `ra` and `dec` units against the upstream schema and known star fixtures. HYG `ra` is conventionally represented in **hours**; the normalized catalogue is in **degrees**. Conversion is `raDeg = 15 * raHours`.
4. Use the source's stated epoch/equinox **J2000.0**. Confirm and document proper-motion convention before normalizing `pmra` to `mu_alpha*`.
5. Preserve legitimate duplicate components in multiple systems; do not globally deduplicate solely by angular proximity.
6. Filter initial rendering to `mag <= 8.0`, but retain configurable build-time magnitude cutoffs for later expansion. The catalogue may contain fainter stars; do not assume every record should be rendered at every zoom.
7. Reject invalid angles and magnitudes, record skipped-row counts and reasons, and fail on unexpected schema changes.
8. Generate versioned binary and metadata assets in `public/catalog/`. The application must work without contacting catalogue servers at runtime.

The exact `pmra` normalization deserves an explicit importer test. Catalogue systems sometimes represent right-ascension proper motion as `d(alpha)/dt` and sometimes as `d(alpha)/dt × cos(delta)`. Incorrect interpretation creates position errors at high declinations. Record which convention the upstream field uses and verify at least one high-proper-motion star.

### 6.2 Gaia DR3 enrichment

Gaia DR3 is the source for a **later deep-star tier**, not a reason to put 1.8 billion objects in the browser.

Source: `https://gea.esac.esa.int/archive/`  
Documentation: `https://gea.esac.esa.int/archive/documentation/GDR3/`  
Main table: `gaiadr3.gaia_source`; reference epoch **J2016.0**.

Proposed ADQL extraction, applied in bounded sky partitions or asynchronous TAP jobs:

```sql
SELECT
  source_id, ra, dec, ref_epoch,
  pmra, pmdec, parallax, radial_velocity,
  phot_g_mean_mag, bp_rp, ruwe
FROM gaiadr3.gaia_source
WHERE phot_g_mean_mag < 11.5
  AND ra IS NOT NULL
  AND dec IS NOT NULL
```

Do not issue a giant synchronous query without limits and recovery. Implement resumable partition extraction (e.g. declination bands or HEALPix bins), checkpoint completed chunks, save checksums, and validate each chunk before packing it. Missing `pmra`, `pmdec`, `bp_rp` and radial velocity are legitimate: use explicitly documented fallback behaviour rather than inventing values.

Use Gaia source IDs as **strings or BigInts** while parsing: they exceed the exact integer range of JavaScript `number`. The packed GPU record may use a local sequential `uint32` index, but source ID mapping must retain the original 64-bit identifier.

Gaia has a bright-star completeness limit; retain the bright-star catalogue. Cross-match by official cross-reference where possible, or by propagated sky positions and compatible magnitudes. Do not simply draw all Hipparcos/HYG and Gaia sources on top of each other.

Provide optional tiers such as `V <= 6.5`, `V <= 8.0` and Gaia to `G <= 11.5`; the viewer selects a tier using FOV, user magnitude limit and device performance. A deeper catalogue must enhance zoomed views, not cause the normal sky to become an unrealistic wall of bright points.

### 6.3 Catalogue binary format

Use a small, versioned little-endian format for the baseline bright-star asset. Do not read CSV from the browser during normal operation.

**Header: 24 bytes**

| Offset | Type | Field |
|---:|---|---|
| 0 | 4 ASCII bytes | Magic `SKY1` |
| 4 | `uint16` | Format version = `1` |
| 6 | `uint16` | Record size = `36` bytes |
| 8 | `uint32` | Record count |
| 12 | `uint32` | Flags; 0 for v1 |
| 16 | `float64` | Catalogue reference epoch as Julian year |

**Record: 36 bytes**

| Offset | Type | Field |
|---:|---|---|
| 0 | `uint32` | Local stable star index |
| 4 | `float64` | Right ascension, degrees |
| 12 | `float64` | Declination, degrees |
| 20 | `float32` | Proper motion RA*, mas/year; `NaN` if unavailable |
| 24 | `float32` | Proper motion Dec, mas/year; `NaN` if unavailable |
| 28 | `float32` | Apparent V magnitude; `NaN` if unavailable |
| 32 | `float32` | B−V colour index; `NaN` if unavailable |

Keep names, original source identifiers, and designations in a separate JSON lookup. This initial binary format is **for HYG/Hipparcos-style V-band catalogues**. Do not force Gaia G-band data into the V field. Gaia uses a separate versioned tier format or explicit metadata describing its photometric band and epoch.

Reader requirements: validate magic/version/record count/byte length; reject truncation; support only documented endianness; report a clear corruption error; expose manifest metadata with source, revision, checksum, magnitude cutoff, record count and build date.

### 6.4 Data provenance and credits

`docs/DATA_PROVENANCE.md` must identify for every shipped asset:

- Upstream organisation, catalogue/asset name, release and source URL.
- Retrieval date, pinned revision if applicable, SHA-256 checksum.
- Fields extracted, filters, transformations, resulting record count.
- Licence/attribution and any redistribution requirements.
- Any accuracy qualifications caused by missing fields or approximate transformations.

Avoid packaging images from arbitrary search results. A NASA webpage describing an astronomical image does **not** prove that the particular photographer's image is public domain.

## 7. Coordinate systems, epochs and astronomy calculations

This is the most important technical section. Implement it in a standalone `src/astro` module with pure, tested functions. The renderer must not contain ad-hoc celestial mathematics.

### 7.1 Terminology and conventions

| System | Definition |
|---|---|
| ICRS / catalogue equatorial | Catalogue right ascension and declination in a quasi-inertial celestial reference |
| J2000 EQJ | Astronomy Engine's J2000 mean equatorial frame |
| EQD | True equator of observation date, including precession and nutation |
| HOR | Astronomy Engine horizontal frame: X = north, Y = west, Z = zenith |
| Azimuth | Degrees clockwise from true north: N 0°, E 90°, S 180°, W 270° |
| Altitude | Degrees above ideal mathematical horizon; zenith = +90° |
| Three.js world | X = east, Y = up, Z = north |

Do not equate true north with magnetic north. No compass hardware correction is needed in the desktop version. The world is anchored to **true geographic north**.

### 7.2 Basic direction conversion

After finding a star's local azimuth `A` and apparent altitude `h` in radians, place it on a sphere of arbitrary radius `R`:

```typescript
const x = R * Math.cos(h) * Math.sin(A); // East
const y = R * Math.sin(h);               // Up
const z = R * Math.cos(h) * Math.cos(A); // North
```

If using Astronomy Engine's **HOR vector directly**, its axes are `[north, west, zenith]`, so the correct conversion is:

```typescript
const threeDirection = new THREE.Vector3(-hor.y, hor.z, hor.x);
```

Do **not** treat the horizontal matrix as a Three.js rotation without this basis conversion. That mistake would mirror east and west or rotate the dome incorrectly.

Required unit tests:

- azimuth 0°, altitude 0° → `(0, 0, +R)`
- azimuth 90°, altitude 0° → `(+R, 0, 0)`
- azimuth 180°, altitude 0° → `(0, 0, −R)`
- azimuth 270°, altitude 0° → `(−R, 0, 0)`
- altitude 90° → `(0, +R, 0)` for any azimuth.

### 7.3 Star propagation and rotation

Star catalogue positions refer to a particular reference epoch; star directions are not immutable over centuries. For normal contemporary views, stellar proper motion is small but must be accounted for when supplied.

For a source right ascension `α`, declination `δ`, and proper motions `μα*` and `μδ` (in **radians/year**):

```text
u       = (cosδ cosα, cosδ sinα, sinδ)
e_alpha = (−sinα, cosα, 0)
e_delta = (−sinδ cosα, −sinδ sinα, cosδ)
u(t)    = normalize(u + Δt × (μα* e_alpha + μδ e_delta))
```

Here `Δt` is the Julian-year difference from the source reference epoch and `1 mas = π / (180 × 3600 × 1000)` radians. This linear tangent-plane propagation is appropriate for ordinary stars over the baseline date range. For exceptional nearby/high-proper-motion stars, a fuller 3D propagation using distance and radial velocity may be added, with clearly documented handling of missing data. Do not silently apply the wrong sign to proper motion.

For each simulation instant/observer change:

1. Use the catalogue's stated source epoch and frame.
2. Propagate the catalogue direction for proper motion to the requested epoch.
3. Transform the resulting consistent J2000/equatorial direction to the observer's horizontal frame using Astronomy Engine's frame rotation, e.g. `Rotation_EQJ_HOR(time, observer)` and `RotateVector` where the input truly matches EQJ.
4. Convert HOR to Three.js basis and apply local horizon/refraction rendering rules.

**Precision caveat:** ICRS and mean J2000 are extremely close but not formally identical. For the defined visual tolerance a carefully documented near-equivalence can be acceptable; a higher-precision mode must apply the actual frame bias and stellar aberration/parallax corrections. Do not claim sub-arcsecond precision from the approximate path.

**Performance:** Store catalogue unit directions in an efficient typed array/GPU buffer. For normal time progression, apply one updated celestial-to-local rotation matrix or shader uniform to the entire star layer. Do not recompute or allocate 100,000 JavaScript star objects on every animation frame. Recompute long-term proper-motion offsets only on significant changes in simulation year or epoch.

### 7.4 Planetary and lunar ephemerides

Use the real `astronomy-engine` package, with its `Observer`, `Equator`, `Horizon`, `Illumination` and relevant Moon functions. A representative computation is:

```typescript
import * as Astronomy from "astronomy-engine";

function bodyDirection(
  body: Astronomy.Body,
  instant: Date,
  location: Astronomy.Observer,
) {
  const eq = Astronomy.Equator(body, instant, location, true, true);
  const hor = Astronomy.Horizon(
    instant, location, eq.ra, eq.dec, "normal"
  );
  return {
    azimuthDeg: hor.azimuth,
    apparentAltitudeDeg: hor.altitude,
    distanceAu: eq.dist,
  };
}
```

The precise import/type syntax must be checked against the **installed and locked library version**, but the semantics are mandatory:

- `Equator(..., ofdate=true, aberration=true)` returns topocentric apparent equatorial coordinates in the required of-date system.
- `Horizon(..., "normal")` returns azimuth and refraction-adjusted altitude.
- Do not feed raw catalogued J2000 RA/Dec into a function expecting the equator of date without transforming them.
- Apply observer elevation and local coordinates to the Moon. Using only Earth's centre creates a very noticeable lunar position error.
- Use UTC consistently. Never manually apply a timezone offset inside the ephemeris calculation.

Calculate the Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune. Objects with altitude below the visual horizon are hidden or optionally represented with an explicitly labelled below-horizon marker. No invented planetary positions or fixed orbital animations.

For the Moon:

- Calculate geocentric/topocentric direction and current distance.
- Calculate illuminated fraction or phase geometry from the library's phase/illumination functions.
- Calculate angular diameter from actual distance and known lunar physical radius; angular diameter must change slightly during the lunar orbit.
- Orient the illuminated portion **towards the projected Sun direction**. A fixed-left crescent or a texture chosen solely by lunar age is wrong in different hemispheres.
- Include the Moon as a rendered disc whose geometry is meaningful at high zoom. A subtle halo may be artistic, but the disc's position and phase must be correct.

For planets:

- Correct position is mandatory. Visual magnitude from `Illumination` is preferred for supported bodies.
- At normal naked-eye FOV, planets are approximately point sources, but visually distinguishable from stars by label/selection and non-twinkling treatment.
- Detailed planet textures and ring geometry are optional; do not make a large visible Jupiter disc at a 75° field of view. Angular size must be respected when zoomed.

### 7.5 Atmospheric refraction and horizon

Maintain **geometric** and **apparent** altitude separately. Default display refraction mode: standard atmosphere, using the astronomy library's `"normal"` behaviour or a carefully validated equivalent for stars.

- At high altitude, refraction is small; near the horizon, it becomes significant and weather-dependent.
- Do not add refraction twice: if `Horizon(..., "normal")` already returned refracted altitude, use that value directly.
- For a shader-based star field, implement an altitude bend close to the horizon or precompute it in a data-independent lookup. Compare the shader's output against the astronomy library at a sample of altitudes.
- The default horizon is a flat **apparent/visual horizon at altitude 0°**. A raised artificial terrain rim may hide objects but must not change astronomical coordinates.
- The Sun and Moon require disc-aware visible-limb clipping near the horizon, not simply hide their entire discs when centre altitude becomes negative.
- Atmosphere may be disabled in a `Geometric` mode for debugging and validation.

Above 10° altitude, the product targets object direction agreement within **2 arcminutes** of independent trusted reference outputs for normal dates. Near the horizon, do not promise this across unknown local temperature/pressure; label the standard-atmosphere assumption.

### 7.6 Supported dates

The primary validated interval is **1900–2100 inclusive**. Outside this interval, the application may support broader epochs only after tests establish the accuracy of selected ephemerides and star propagation. If the date is outside the validated interval, show a visible warning rather than silently promising equivalent accuracy. Do not advertise exact ancient skies based on this initial acceptance target.

## 8. Rendering specification

### 8.1 Three.js scene

Create a camera fixed at the local observer origin `(0, 0, 0)`; all sky components are directional. Use a perspective camera with adjustable vertical FOV. No arbitrary camera translation should occur in normal sky view.

Recommended render layers:

1. Sky background colour / twilight glow.
2. Milky Way celestial texture or density layer, if available.
3. Star point-sprite layer.
4. Sun, Moon and planet billboards/discs.
5. Constellation lines, grid, ecliptic, celestial labels.
6. Horizon silhouette/ground masking layer and compass labels.
7. Screen-space UI and object details.

Scene object radii are **rendering conveniences**, not physical distances: e.g. stars at `R=1000`, background at `R=1100`, celestial discs projected to stable angular sizes. Ensure depth and render order avoid masking valid objects incorrectly. The horizon should hide below-horizon objects consistently.

### 8.2 Star rendering

Use `THREE.BufferGeometry` with typed GPU attributes. Use `THREE.ShaderMaterial` to render star sprites with at least:

- Source direction/position (equatorial or horizontal as chosen by design).
- Apparent magnitude.
- Colour (RGB derived from B−V or documented spectral approximation).
- Optional ID/index for picking.

Brightness model should begin with astronomical relative flux:

\[
F/F_0 = 10^{-0.4m}
\]

Avoid mapping apparent magnitude linearly to sprite diameter or visible brightness. Rendered luminance requires display exposure and tone mapping; implement a perceptual mapping, gamma-correct output, exposure control and a minimum screen-size treatment for bright stars. Distinguish a physically meaningful relative intensity from the deliberate stylisation needed to keep a bright star visibly larger than a dim one on a pixel display.

Use a radial point-sprite fragment profile with bright centre and soft falloff. Avoid rendering all stars as identical large white dots or excessive lens flares. B−V approximates star colour: blue-white, neutral-white, yellow/orange/red. Document colour mapping and clamp implausible values. Missing colour uses a neutral white fallback, marked as a photometric default rather than a measured fact.

Magnitude limit depends on mode:

- Naked-eye default: around `V <= 6.5` under dark-sky assumptions; add an adjustable limiting magnitude.
- Brighter urban preset: show fewer and less prominent faint stars.
- Zoomed/deep-catalogue mode: select additional stars without falsely increasing their naked-eye visibility.

Implement culling/LOD on GPU or at catalogue-chunk level. Star field should not cause thousands of Three.js draw calls. Disable unnecessary lighting on stars; they are emissive visual elements.

### 8.3 Moon, Sun and planets

The Sun and Moon need correct apparent angular size as the camera zooms. Use directional billboards or small spheres with apparent radius derived from geometry, with a stable projected orientation.

- Moon: phase shading determined by Sun/Moon/observer geometry, optional licensed albedo texture, subtle earthshine only if modelled and identified as an aesthetic approximation.
- Sun: avoid eye-damaging claims or a physically correct HDR solar luminance target; render an appropriately bright disc and sky daytime transition.
- Planets: points at wide FOV; optional small discs at sufficiently narrow FOV. Saturn's rings are a stretch goal and must not be shown with a fixed orientation if implemented.

### 8.4 The Milky Way

The dense Milky Way is a **diffuse sky-brightness feature**, not adequately reconstructed from a few thousand point stars. P1 should include a real, correctly oriented all-sky product or panorama with documented licensing.

Implementation requirements:

1. Prefer a source whose celestial projection and frame are explicitly documented (equirectangular equatorial/galactic, HEALPix, etc.). Record that metadata.
2. Transform it into the same world orientation as the catalogues, including galactic-to-equatorial rotation where required.
3. Draw the image on an inward-facing celestial sphere with no ground landmarks or fixed screen coordinates.
4. Make it faint in a normal sky; dark-sky visibility and light-pollution presets affect it differently from individual bright stars.
5. Prevent double-counting: if a photographic mosaic includes many bright stars, control its brightness/processing so catalogued bright stars are not visibly duplicated.
6. Do not equate an arbitrary artist-painted galactic band with astronomically sourced sky data.

If an appropriately licensed all-sky map is not available in the initial iteration, omit this layer temporarily and **report the omission**. It must not block the accurate P0 sky; it must block a claim that P1 Milky Way rendering is complete.

### 8.5 Atmospheric appearance and light pollution

Use explicit presets such as `Dark rural`, `Suburban` and `Urban`, plus sliders for star visibility, sky-glow intensity and background exposure. These presets are **visual assumptions**, not measured Bortle classes at the selected location. A future layer may source actual calibrated light-pollution data.

Approximate atmospheric extinction as a function of airmass and an adjustable extinction coefficient; enforce sensible bounds near the horizon. For Moonlit nights, reduce visible faint stars and brighten the background in a controlled way based on lunar altitude/illumination. Daylight/twilight transitions should visibly differ from full darkness.

Never use renderer exposure adjustments that alter the star positions. Geometry and photometry remain separate subsystems.

### 8.6 Constellation overlays and grids

P1 may overlay constellation line segments from a sourced definition that maps specific star IDs. Because constellation figures are cultural conventions, label the chosen sky-culture dataset; do not present them as objective physical connections.

Optional overlays:

- Horizontal grid (azimuth and altitude) in the observer frame.
- Celestial equator and ecliptic.
- Equatorial RA/Dec reference coordinates.
- Constellation names and lines.

Use labels sparingly and scale their density with FOV. Labels must not rotate with a panorama or overlap excessively.

## 9. Camera, selection and time flow

### 9.1 Camera semantics

Represent camera orientation in geographic azimuth and altitude. Avoid storing arbitrary accumulated Euler rotations as the only source of truth; they are harder to reason about and easy to invert at the poles. Build a unit look vector in the defined Three.js basis and use a stable `lookAt`/quaternion orientation.

- Clamp normal look altitude between −10° and +90°; optionally provide an unconstrained debug mode.
- Preserve field of view while changing observer location or time.
- Changing time rotates celestial directions but **does not rotate the viewer's chosen terrestrial heading**.
- A compass widget must always correspond to true geographic directions, regardless of camera orientation.

### 9.2 Object picking

GPU point primitives may be extremely small. Use an angular-nearest-neighbour hit test against visible bright objects within a configurable pixel/angular tolerance, or a dedicated picking buffer. Choosing the nearest candidate must respect depth-independent sky angle and exclude objects behind the horizon. Avoid invisible giant Three.js spheres around stars that accidentally intercept clicks across the sky.

Selection card fields:

- Name or source identifier; object kind (star/planet/Moon/Sun).
- Current azimuth and altitude in degrees.
- Equatorial coordinates and frame/epoch when useful.
- Apparent magnitude with correct photometric band identifier.
- Optional distance for stars (only when valid), Moon phase and angular size.
- Catalogue/ephemeris provenance label.

### 9.3 Scheduling calculations

The renderer may run at display refresh rate, but astronomical calculations should be scheduled by scientific need:

- Star field: celestial-to-local orientation update as simulated time moves; GPU matrix transform avoids per-star CPU recalculation each frame.
- Solar System positions: recompute on clock jumps and at bounded intervals in simulated time; interpolate smoothly between valid samples if needed.
- Moon phase/lighting: update coherently with the Moon position; no stale illumination when time jumps.
- UI values: update at a readable rate (e.g. several times per second at most), not on every GPU frame.
- On tab hidden: pause GPU work or reduce activity; when visible again, reconcile elapsed real time according to the chosen simulation rate.

No interval timer may create a second independent `Date.now()` time source. Use one clock and elapsed real-frame duration.

## 10. Application boundaries and repository structure

Suggested repository:

```text
night-sky-simulator/
├── package.json
├── bun.lock
├── tsconfig.json
├── vite.config.ts
├── index.html
├── README.md
├── .env.example
├── public/
│   ├── catalog/
│   │   └── v1/{manifest.json,bright-stars.bin,bright-names.json}
│   └── sky/                 # only sourced and credited assets
├── scripts/
│   └── catalog/
│       ├── download-hyg.ts
│       ├── build-hyg.ts
│       ├── validate-catalog.ts
│       └── build-gaia.ts   # P1, optional
├── src/
│   ├── main.tsx
│   ├── app/{App.tsx,store.ts,config.ts}
│   ├── astro/
│   │   ├── types.ts
│   │   ├── frames.ts
│   │   ├── stars.ts
│   │   ├── ephemerides.ts
│   │   ├── atmosphere.ts
│   │   └── time.ts
│   ├── catalogs/{loader.ts,parser.ts,types.ts}
│   ├── renderer/
│   │   ├── SkyRenderer.ts
│   │   ├── StarLayer.ts
│   │   ├── BodyLayer.ts
│   │   ├── HorizonLayer.ts
│   │   ├── OverlayLayer.ts
│   │   └── shaders/
│   ├── components/
│   │   ├── SkyViewport.tsx
│   │   ├── LocationPicker.tsx
│   │   ├── TimeControls.tsx
│   │   ├── ViewControls.tsx
│   │   └── ObjectDetails.tsx
│   └── styles/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
└── docs/
    ├── ACCURACY.md
    ├── DATA_PROVENANCE.md
    ├── TEST_PLAN.md
    └── IMPLEMENTATION_NOTES.md
```

The layout is advisory; preserve separation between `astro`, `catalogs`, `renderer` and React controls. The astronomy module must be usable from Bun tests without mounting a browser or Three.js canvas.

### 10.1 APIs between modules

Prefer small pure functions and a single orchestration service:

```typescript
type SkySnapshot = {
  instantUtcMs: number;
  observer: Observer;
  bodies: SolarSystemObject[];
  starOrientation: Float32Array; // documented 3x3 or 4x4 basis transform
  sunGeometricAltitudeDeg: number;
  moonIllumination: number;
};

interface AstronomyService {
  calculate(observer: Observer, instantUtcMs: number): SkySnapshot;
  getStarDirection(starId: number, observer: Observer,
                   instantUtcMs: number): CelestialDirection;
}

interface CatalogRepository {
  loadBrightCatalog(): Promise<Readonly<CatalogData>>;
  getStar(starId: number): StarRecord | undefined;
}
```

`CatalogData` may use typed arrays rather than `StarRecord[]` to avoid unnecessary objects. Clearly define the layout, lifetime and transfer policy. All numerical calculation methods should be deterministic for fixed inputs.

### 10.2 State management

One application store owns observer, UTC instant, rate, camera orientation, magnitude limit, visual settings, selected object, active layers and asset-load status. React components observe this state; the renderer receives authoritative updates through an adapter rather than owning a duplicate uncontrolled React-like state.

Avoid excessive event buses, dependency injection frameworks, services with remote network requirements, and state synchronization ceremonies. The initial application is a single-page local computation tool.

### 10.3 Runtime external dependencies

At runtime the application needs only its bundled scripts and star assets, plus a map tile network request when the map panel is used. Astronomy must keep working if mapping tiles are unavailable. Catalogue ingestion should happen at build/preparation time, not on every application start.

Google Maps optional mode requires user-supplied API key and appropriate billing configuration. Do not commit keys. `VITE_`-prefixed browser configuration is **public client configuration**, never a place to store secrets.

## 11. Performance, browser support and accessibility

### 11.1 Performance targets

Development reference: desktop-class laptop with current Chrome/Firefox/Safari and functional WebGL2.

- Initial 3D scene should become interactive within approximately **4 seconds** after required local static assets are available on a typical broadband desktop. Measure rather than assume.
- Aim for **60 FPS** while looking around with the bright catalogue at 1920×1080 on a reasonable desktop GPU; **30 FPS** is acceptable as a mobile fallback.
- A changing time slider must remain interactive; calculation work should not block pointer interaction for hundreds of milliseconds.
- Load the compact bright catalogue only once per session and share typed arrays where possible.
- Avoid repeated shader compilation, geometries created on every React render, and unbounded texture/geometry accumulation.
- On component unmount or view change, dispose WebGL resources and listeners deterministically.
- Gracefully adapt to lower-performance devices by reducing faint-star density, label density and post-processing, **without changing bright-star geometric positions**.

These are engineering targets, not claims about every browser or hardware combination.

### 11.2 Browser constraints

- Target current evergreen Chrome, Firefox and Safari on desktop; test at least one mobile browser.
- WebGL2 detection and readable unsupported-device message are mandatory.
- Respect device pixel ratio with a configurable performance cap.
- Use `ResizeObserver` or an equivalent robust canvas sizing mechanism and update camera projection on resize.
- Do not assume pointer lock is available; drag-to-look works without it.

### 11.3 Accessibility

Controls must have accessible labels, logical keyboard navigation, visible focus outlines and contrast appropriate for dark backgrounds. Provide numeric direction, date/time and object metadata in accessible DOM elements. The WebGL canvas alone is not an accessible representation of the astronomical information.

## 12. Error handling and recoverability

| Failure | Required behaviour |
|---|---|
| Bright catalogue missing/corrupt | Stop astronomical star rendering, explain problem, show retry; no fake fallback |
| Map tiles unavailable | Numeric latitude/longitude entry remains functional |
| Google API key absent | Use default map provider; no Google-only blocker |
| Time zone cannot be resolved | Allow explicit time-zone selection and UTC mode |
| Invalid date or DST gap | Explain precise validation problem; preserve last valid instant |
| WebGL2 unavailable/context lost | Explain support issue; attempt controlled context restoration where possible |
| Gaia enrichment unavailable | Continue with bright-star catalogue and indicate deeper tier unavailable |
| Milky Way image unavailable | Continue with accurate stars and identify missing optional layer |
| Out-of-range astronomical date | Show an accuracy warning or reject unsupported range explicitly |

Never swallow exceptions into an empty or static sky. Log technical diagnostics in development; show concise user-facing messages without exposing irrelevant stack traces.

## 13. Validation and acceptance tests

### 13.1 Independent astronomical ground truth

Create **committed reference fixtures** for selected bodies and stars using a source independent of the implementation:

- NASA JPL Horizons for Sun/Moon/planet topocentric apparent azimuth and elevation, with recorded query settings, observer elevation, reference date, refraction mode and source URL/API response metadata.
- Astropy/ERFA or equivalent established astronomical transformations for sampled stellar coordinates, generated during fixture preparation only. The shipped application does **not** require Python.

Do not generate reference fixtures by calling the application implementation itself. Fixture files must list units, frame, whether atmospheric refraction was enabled and the source. Avoid live remote API dependency in the ordinary CI test run.

Test locations should include approximately:

- Valencia or Madrid, mid-northern latitude.
- Cape Town, southern hemisphere.
- Reykjavík, high northern latitude.
- Equator near longitude 0°.
- A longitude near ±180° to expose date-line mistakes.

For every location test at least two seasons, including a UTC date near equinox/solstice where appropriate. Test multiple times of day and near-horizon visibility where the chosen reference allows a meaningful comparison.

### 13.2 Quantitative thresholds

| Property | Acceptance threshold |
|---|---|
| Cardinal coordinate mapping | Error below floating-point test tolerance |
| Bright named stars above 10° altitude, 1900–2100 | Angular error ≤ 2 arcminutes vs independent reference |
| Sun/planets above 10° altitude, 1900–2100 | Angular error ≤ 2 arcminutes vs independent reference |
| Moon centre above 10° altitude, 1900–2100 | Angular error ≤ 5 arcminutes vs independent reference |
| Moon illuminated fraction | Agreement with independent ephemeris within 0.02 absolute fraction |
| UTC/local conversion | Exact instant and offset across documented DST cases |
| Star catalogue geometry | All visible entries finite; normalized direction vectors within 1e−5 of unit length |
| Horizon clipping | No stars below selected apparent horizon visible in normal mode, except justified refracted boundary cases |
| Angular separation under camera movement | Same for all camera headings, within numerical tolerance |

The tolerances define **initial observable correctness**, not an excuse to produce crude approximations. Errors should be measured and documented. In particular, **lunar parallax** must be applied, and the same location/time must produce repeatable positions.

### 13.3 Mandatory scenario tests

1. **North/east orientation:** a known object with azimuth approximately 90° is on the east side, not the west side; pitch above zero increases Y.
2. **Hemispheres:** the southern sky in Cape Town differs substantially from Valencia. Circumpolar north stars must not remain visible everywhere.
3. **Earth rotation:** advance time at fixed position and verify sidereal motion direction and scale; no globe-wide fixed rotation texture.
4. **Moon parallax:** compare a true topocentric Moon to geocentric reference in a fixture where the difference is significant.
5. **DST:** test the spring gap and repeated autumn hour in Europe/Madrid, confirming UTC remains unambiguous.
6. **Date line:** longitude ±179.9° does not swap celestial orientation incorrectly or invent a 24-hour offset.
7. **Catalogue import:** assert known names, record count range, correct Sirius RA/Dec quadrant, magnitude order and high-proper-motion star behaviour.
8. **Horizon:** a star at −5° geometric altitude is not visible in the normal sky; near-horizon atmospheric mode produces the documented refraction behaviour.
9. **Camera vs sky:** turning the camera changes what is visible, not object celestial coordinates; moving the observer changes local positions without editing catalogued RA/Dec.
10. **Deep zoom:** selected object stays at the same sky direction as FOV decreases.
11. **Time reverse:** negative simulation rate reverses motion coherently and does not cause jumps or stale planet samples.
12. **Asset error:** corrupted catalogue produces a comprehensible error rather than a black canvas misrepresented as an empty sky.

### 13.4 Browser end-to-end tests

Use Playwright to launch the built app. Assert:

- The application loads the real catalogue and shows a nonzero `renderedStarCount` diagnostic in development/test mode.
- A visible Three.js canvas and renderer diagnostics indicate successful WebGL draw.
- Selecting a different coordinate updates the observer label and calculated reference object details.
- Date/time edits update UTC instant and object azimuth/altitude.
- Reset, zoom, selection and controls work.
- A screenshot captures a non-empty astronomical scene, and the test reads numerical diagnostics; **screenshot comparison alone is insufficient**.

Do not make tests depend on actual map tile availability or fresh JPL API responses. Stub the **map tiles only** when necessary. Never stub the astronomy engine in the integration test.

### 13.5 Performance verification

Include a small benchmark or test page reporting catalog parsing time, star count, draw calls, frame duration and GPU resource counts where measurable. Record representative hardware and browser in `docs/TEST_PLAN.md`. A claim such as “60 FPS” without an actual run is not a test result.

## 14. Build, scripts and developer experience

The repository must support these commands without requiring a global Node installation:

```bash
bun install
bun run dev
bun run build
bun run preview
bun test
bun run test:e2e
bun run catalog:build
bun run catalog:validate
```

`package.json` must define every command. Dependencies must be pinned through `bun.lock`. The README must explain the supported Bun version, initial data download or bundled asset, optional map configuration, how to run the tests and any platform-specific requirements for the Playwright browsers.

No mandatory database migrations, Docker setup or remote secrets. There may be an optional `catalog:download` command to fetch data reproducibly, with checksum verification and a clear error message on network failure. Do not have `bun run dev` launch a multi-gigabyte Gaia download.

Recommended configuration values:

```env
VITE_MAP_PROVIDER=osm
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_GOOGLE_MAPS_API_KEY=
VITE_DEFAULT_LAT=39.4699
VITE_DEFAULT_LON=-0.3763
VITE_DEFAULT_ELEVATION_M=0
VITE_DEFAULT_TIME_ZONE=Europe/Madrid
```

Read `.env.example` for optional settings; do not commit `.env` with user values. The default location is only a UI convenience, **not** a claim about the user's current location.

### 14.1 Suggested implementation sequence

Each milestone must compile, run and leave an integrated result. Avoid isolated scaffolding that does not expose its functionality.

**Milestone 1 — Real star dome:** Bun/Vite/React app; HYG catalogue importer and binary loader; Three.js WebGL canvas; star positions transformed for a fixed real location/time; camera drag; cardinal labels; catalogue provenance. The initial result must already display recognizable real constellations.

**Milestone 2 — Observer and clock:** clickable location selector and coordinate inputs, IANA time zone, date/time controls and time flow; independent reference tests for star positions. Correct hemisphere and orientation errors before advancing.

**Milestone 3 — Solar System:** real topocentric Sun/Moon/planets, lunar phase/size, selected-object card, horizon clipping and refraction. Add independent Horizons fixtures.

**Milestone 4 — Product hardening:** full-screen responsive UI, failure states, catalogue checksum, URL share state, Playwright, profiling and documentation. P0 acceptance gate.

**Milestone 5 — Visual enrichment:** sourced Milky Way asset, constellation overlays, atmospheric appearance and advanced search. P1 acceptance gate.

**Milestone 6 — Optional deeper catalogue:** Gaia DR3 importer, bounded tiers, brightness-band conversion, LOD and deduplication; no requirement to load more stars than useful for the chosen FOV.

At each milestone, run the existing tests and document any known scientific or visual limitations. Do not mark a later milestone done because an empty feature panel exists.

## 15. Definition of done

The release is accepted only when a reviewer can clone the project and:

1. Run `bun install`, `bun run dev`, and see a real three-dimensional, freely navigable stellar sky without supplying paid credentials.
2. Select two locations in different hemispheres and immediately see the correct change in visible sky.
3. Select a local date/time, see its UTC interpretation, move through time and verify that the stars and planets move correctly.
4. Find Sirius, Polaris or another named bright star; see plausible, tested azimuth/altitude and visual magnitude.
5. Find the Moon; see correct topocentric position and visibly correct illuminated side relative to the Sun.
6. Change camera heading and FOV without corrupting astronomical coordinates.
7. Read visible source attribution and exact data-provenance documentation.
8. Run all unit, integration and end-to-end tests successfully, including independent astronomical fixtures.
9. Recover sensibly from a missing map service or optional Milky Way asset; never receive a fake star field.
10. Inspect a codebase with clear boundaries between scientific calculations, data ingestion and rendering, with no unnecessary backend or infrastructure.

For a claim that **P1** is complete, additionally require a sourced and correctly oriented Milky Way map and functioning constellation/atmospheric controls. For **P0**, the star field and celestial bodies must already be scientifically grounded and visually coherent.

## 16. Authoritative references and implementation notes

Consult the **current official documentation** and pin dependency versions before coding; API signatures and package behaviour may evolve.

1. **Astronomy Engine (TypeScript/JavaScript)** — calculations, coordinates, observer, refraction and ephemerides: https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md
2. **Astronomy Engine licence (MIT)** — https://github.com/cosinekitty/astronomy/blob/master/LICENSE
3. **ESA Gaia DR3 archive** — https://gea.esac.esa.int/archive/ and https://gea.esac.esa.int/archive/documentation/GDR3/
4. **ESA Gaia DR3 schema** — https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html
5. **ESA Hipparcos catalogue** — https://hipparcos-tools.cosmos.esa.int/HIPcatalogueSearch.html
6. **HYG database and field descriptions** — https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md
7. **JPL Horizons manual and API** — https://ssd.jpl.nasa.gov/horizons/manual.html and https://ssd-api.jpl.nasa.gov/doc/horizons.html
8. **Three.js `BufferGeometry` and shader materials** — https://threejs.org/docs/pages/BufferGeometry.html and https://threejs.org/docs/pages/ShaderMaterial.html
9. **Three.js WebGPU point limitations** — https://threejs.org/docs/pages/PointsNodeMaterial.html
10. **Google Maps click-to-coordinates example** — https://developers.google.com/maps/documentation/javascript/examples/event-click-latlng
11. **OpenStreetMap tile policy** — https://operations.osmfoundation.org/policies/tiles/
12. **US Naval Observatory refraction/rise-set notes** — https://aa.usno.navy.mil/faq/RST_defs

### Final instruction to the coding agent

Implement the scientifically correct **end-to-end vertical slice first**, with real data and a usable 3D view. Treat milestones and quantitative tests as acceptance gates. If a feature is genuinely blocked by unavailable licensed data, disclose the blocker and keep the completed core functional. Do not substitute fake astronomical content, inflate the architecture, or claim accuracy that has not been checked against reference data.
