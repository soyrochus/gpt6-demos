# Astronomical accuracy

The supported civil-date interval is 1900–2100 inclusive. One UTC instant and one geodetic observer drive the entire sky. Local clock edits use IANA time zones. A repeated hour offers both offsets, and a missing spring-forward hour leaves the prior instant intact.

## Coordinate path

HYG positions are mean J2000 equatorial unit vectors. The star vertex shader applies the catalogue’s east and north proper-motion components in the tangent plane before normalizing. The observer rotation includes precession, nutation and diurnal rotation from Astronomy Engine. Its horizontal axes [north, west, up] become [east, up, north] in the scene. The camera projection accounts for the handedness of that specified basis. When facing north, east appears on the observer’s right.

The model approximates ICRS and EQJ axes as coincident. It omits stellar annual aberration, parallax and radial perspective acceleration from the rendering path. Gaia uses the same transform with an explicit J2016.0 motion epoch. The committed reference star directions include Astropy space motion, distances, radial velocities, aberration and the bundled Earth-orientation data.

Solar-system positions use the observer’s elevation and topocentric apparent equator of date. Airless horizontal altitude and standard-atmosphere altitude are retained separately. Refraction is applied once. Bodies use distance and mean physical radius for angular diameter. The Moon’s phase fraction sets the lighting angle and the projected Sun direction sets the orientation of its bright limb. Horizon masking clips the discs per pixel.

## Independent fixture results

The five sites span Valencia, Cape Town, Reykjavík, the equator at Greenwich, and longitude +179.9°. The fixtures sample 1900, 2026 and 2100, multiple times of day and both hemispheres. The comparison uses spherical angular separation and geometric altitude above 10°. These figures are sample maxima.

| Comparison | Maximum observed error | Acceptance limit |
| --- | ---: | ---: |
| Bright stars versus Astropy/ERFA | 0.397 arcmin | 2 arcmin |
| Sun and planets versus JPL Horizons | 0.264 arcmin | 2 arcmin |
| Moon centre versus JPL Horizons | 1.203 arcmin | 5 arcmin |
| Moon illuminated fraction versus JPL Horizons | 0.00483 | 0.02 |

The suite compared 57 stellar directions and 96 solar-system directions above 10°. The lunar parallax test independently checks that a geocentric calculation misses a reference case by more than half a degree. The browser test samples the bright and dark sides of the rendered crescent at 10° FOV. Historical and future Earth-orientation inputs include estimates, particularly near the ends of the interval.

## Visual assumptions

Atmospheric refraction follows Astronomy Engine’s normal Saemundsson prescription, including the −1° clamp and fade below it. Near-horizon weather can shift actual apparent positions. The flat visual horizon sits at 0°. The generic silhouette is drawn below it.

Star sprites start from relative V-band flux and compress their dynamic range for display. B−V drives a clamped blue-white to warm approximation, and missing colour uses neutral white. The shader dims low objects by extinction per airmass. Solar altitude, lunar illumination and lunar altitude affect background brightness and faint-star visibility. The sky presets describe observing assumptions. The diffuse HYG density layer has survey selection effects. Its orientation is astronomical, and its intensity is uncalibrated.
