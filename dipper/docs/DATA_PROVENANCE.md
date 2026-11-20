# Dipper data credits

Assets retrieved on 19 November 2026. The application serves these files locally. Only the optional map panel requests external tiles.

## HYG v4.1 stars and diffuse density

David Nash / Astronexus compiled HYG from Hipparcos, the Yale Bright Star Catalogue and nearby-star catalogues. Dipper redistributes its filtered star catalogue, names index and density derivative under Creative Commons Attribution-ShareAlike 4.0. Preserve attribution, this licence and indications of changes when redistributing these assets. [Source revision](https://github.com/astronexus/HYG-Database/tree/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT) · [Column definitions](https://github.com/astronexus/HYG-Database/blob/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/README.md) · [Licence](https://creativecommons.org/licenses/by-sa/4.0/)

The input is hygdata_v41.csv, SHA-256 d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd. The importer reads quoted CSV, converts RA hours to degrees, preserves signed declination, and encodes J2000.0 equatorial positions, tangent-plane proper motions in mas/year, visual magnitude and B−V. Missing optional binary measurements are NaN. The names sidecar carries HYG ID, common name, HIP, designation, constellation and HD. Solar-system calculations supply the Sun. The V ≤ 8 cut retains 41,487 rows and skips Sol and 78,138 fainter records. Multiple systems retain their catalogue identities.

Hipparcos pmRA is the component along increasing RA, μᵅ cos δ. For HIP 57939 (Groombridge 1830), HYG stores +4003.69 mas/year and −5813.00 mas/year. Dipper applies that RA value directly to the unit east tangent. The test projects the resulting motion back onto the tangent and the independent Astropy fixtures use pm_ra_cosdec. [Hipparcos catalogue field definitions](https://cdsarc.cds.unistra.fr/ftp/cats/I/239/ReadMe)

The diffuse layer uses a separate Dipper density product. It counts HYG stars with 8 < V ≤ 10 in 256 × 128 equal-solid-angle bins. The horizontal coordinate increases with J2000 RA and the vertical coordinate runs from the south pole to the north pole in sin(declination). The build smooths counts with a Gaussian kernel across the RA seam. The renderer samples the map with the inverse star orientation. This illustrates the distribution of unresolved catalogue stars, including the Milky Way. Survey selection and catalogue incompleteness affect its appearance. The density is uncalibrated and the layer contains no photographic stars.

The packaged SHA-256 hashes for the star binary, index and density are in public/catalog/v1/manifest.json. The little-endian SKY1 v1 layout follows §6.3 of the implementation specification.

## Solar System and time

Don Cross's Astronomy Engine 2.1.19 (MIT) supplies topocentric equatorial directions, horizontal rotations, lunar illumination, distances, visual magnitudes and standard refraction. Luxon uses browser IANA rules, with coordinate lookup provided by PhotoStructure's tz-lookup. [Astronomy Engine](https://github.com/cosinekitty/astronomy) · [tz-lookup](https://github.com/photostructure/tz-lookup)

## Western sky figures

The 89 J2000 GeoJSON figures (including the two parts of Serpens) are from Olaf Frohn's D3-Celestial, revision 7e720a3de062059d4c5400a379146a601d9010e0, data/constellations.lines.json. Upstream credits the IAU constellation charts and documents its modifications and equatorial degree convention. Dipper uses the supplied polyline vertices. The unmodified file's SHA-256 is 294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c. The BSD-3-Clause notice is in public/sky/D3-LICENSE.txt. [Upstream data and credits](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/readme.md)

The optional asterism overlay joins the conventional Big Dipper, Summer Triangle and Winter Triangle members using Hipparcos IDs in the bundled HYG catalogue. These are Western observing conventions.

## Gaia DR3 Orion field

This work uses data from the European Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). Funding for DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement. [Gaia mission](https://www.cosmos.esa.int/gaia) · [DPAC](https://www.cosmos.esa.int/web/gaia/dpac/consortium) · [Gaia DR3 release and credits](https://www.cosmos.esa.int/web/gaia/dr3)

Four non-overlapping 5° tiles cover 80° ≤ RA < 90° and −10° ≤ Dec < 0° at J2016.0. Each archive extraction is bounded at 15,001 rows with 7 < G ≤ 11.5. The manifest in public/catalog/gaia records each ADQL query, input and output SHA-256, matched-row count, output name and count. Dipper compares HYG directions propagated to 2016 within 3 arcseconds and, where available, 1.5 magnitudes of estimated V. The 80 inter-catalogue matches are excluded. Blends and close doubles can make positional matches uncertain. The 4,446 remaining sources retain their exact string IDs, G photometry, BP−RP and nullable proper motions. [Archive](https://gea.esac.esa.int/archive/) · [Release paper](https://doi.org/10.1051/0004-6361/202243940)

For the display only, the Johnson V estimate uses the G−V polynomial in BP−RP from the Gaia DR3 Johnson-Cousins photometric relationships. Original G remains available in object details. Sources lacking an applicable colour remain packed and are omitted from the V-limited rendering. Gaia points use a neutral tint. Missing motions contribute zero displacement. The deep field approximates ICRS axes by EQJ within the accuracy discussed in ACCURACY.md. [Photometric relationships](https://gea.esac.esa.int/archive/documentation/GDR3/Data_processing/chap_cu5pho/cu5pho_sec_photSystem/cu5pho_ssec_photRelations.html)

## Map, type and icons

Leaflet displays OpenStreetMap tiles with visible attribution. Custom providers require the matching attribution and usage conditions. [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) · [Tile usage](https://operations.osmfoundation.org/policies/tiles/)

DM Sans and Instrument Serif are distributed via Fontsource under the SIL Open Font License. The font notices ship in public/licenses. Interface icons are from Lucide (ISC). The portal image is a screenshot of the running simulator.
