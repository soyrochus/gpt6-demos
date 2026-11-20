# Verification

Run `bun test`, `bun run catalog:validate`, and `bun run test:e2e` from Dipper. Run `bun test tests/launcher.test.ts` from the repository root for portal coverage.

## Scientific fixtures

The offline suite stores 150 independent stellar directions and 225 independent Solar System records. The quantitative accuracy gate applies above 10° altitude. Fixture generation is separate from an application build.

- `scripts/horizons.ts` queries JPL Horizons sequentially for each site and body, using geodetic Earth coordinates, site elevation, discrete UT Julian dates, airless apparent azimuth and altitude, illuminated percentage and angular diameter. Each group records its exact query URL and API signature. The generated file is `tests/fixtures/horizons.json`.
- `scripts/reference-stars.py` is an optional external oracle, run with Astropy 8.0.3 against the pinned HYG CSV. It propagates the six named stars with Astropy/ERFA to a WGS84 AltAz frame at zero pressure. Earth-orientation extrapolation warnings at the date extremes are expected. Only the generated JSON is needed for tests.
- Other checks cover the SKY1 binary header, checksum and truncation, Gaia source IDs, cardinal axes, normalized catalogue vectors, proper-motion convention, hemisphere visibility, sidereal rotation, the date line, lunar parallax and elevation, signed playback, DST gap/fold and calendar-day steps.

## Browser coverage

Playwright starts the static build on an isolated local port. It verifies an actual WebGL draw, visible-star diagnostics, camera orientation, zoom, object picking, location and UTC changes, reverse playback, reset, sharing, catalogue error recovery and on-demand Gaia loading. The lunar lighting test samples rendered pixels on either side of the lunar centre along the projected solar direction. A mobile Chromium context uses a 390 × 844 viewport, touch input and 2× pixel density. The location-picker tests check map geometry, marker alignment, and coordinate selection across dialog reopens and viewport resizing. They exercise delayed and failed street tiles with the bundled map active.

## Performance sample

On 19 November 2026, Apple M4 Pro, macOS 27.2.1, Bun 1.4.4 and Chromium 159.0.8154.6:

| Measurement | Observed |
| --- | ---: |
| First visible local production sky, 1440 × 900, SwiftShader | 1.10 s |
| Catalogue parsing and indexing | 10.5 ms |
| Initial HYG stars in the viewport after visibility filters | 1,196 |
| Initial draw calls / geometries / density textures | 4 / 4 / 1 |
| Panning, 1920 × 1080, SwiftShader, median / 95th percentile frame interval | 33.3 / 50.1 ms |
| Panning, 1920 × 1080, ANGLE Metal on Apple M4 Pro, median / 95th percentile | 16.7 / 16.8 ms |

Each panning sample measures 60 animation-frame intervals while changing heading. The Metal run used the shared launcher. The production Playwright test prints the software-rendered sample on each run. A paused scene redraws on changes or resize. The tests cover Chromium desktop and mobile emulation. Physical mobile devices, Safari and Firefox still need hardware acceptance.
