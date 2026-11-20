"""Optional independent test-oracle preparation: uv run --with astropy python scripts/reference-stars.py hygdata_v41.csv"""
import csv, json, sys
import astropy
from astropy import units as u
from astropy.coordinates import SkyCoord, EarthLocation, AltAz
from astropy.time import Time
from astropy.utils import iers
iers.conf.auto_download = False
sites = [(39.4699,-0.3763,0),(-33.9249,18.4241,200),(64.1466,-21.9426,0),(0,0,0),(-17,179.9,50)]
dates = ['1900-03-20T06:00:00','2026-01-15T21:00:00','2026-06-21T12:00:00','2026-09-23T01:00:00','2100-12-21T18:00:00']
t = Time(dates, scale='utc')
rows = []
with open(sys.argv[1]) as src:
    for r in csv.DictReader(src):
        if r['proper'] not in {'Polaris','Sirius','Arcturus','Canopus','Vega','Groombridge 1830'}:
            continue
        s = SkyCoord(ra=float(r['ra'])*u.hourangle, dec=float(r['dec'])*u.deg,
                     distance=float(r['dist'])*u.pc, pm_ra_cosdec=float(r['pmra'])*u.mas/u.yr,
                     pm_dec=float(r['pmdec'])*u.mas/u.yr, radial_velocity=float(r['rv'] or 0)*u.km/u.s, obstime=Time('J2000'))
        for lat, lon, el in sites:
            loc = EarthLocation.from_geodetic(lon*u.deg, lat*u.deg, el*u.m)
            h = s.apply_space_motion(new_obstime=t).transform_to(AltAz(obstime=t,location=loc,pressure=0*u.hPa))
            for instant, az, alt in zip(dates,h.az.deg,h.alt.deg):
                rows.append(dict(id=int(r['id']),name=r['proper'],instant=instant+'Z',latitudeDeg=lat,longitudeDeg=lon,elevationM=el,azimuthDeg=round(az,8),altitudeDeg=round(alt,8)))
with open('tests/fixtures/stars.json','w') as dest:
    json.dump(dict(source='Astropy '+astropy.__version__+' / ERFA, HYG J2000 ICRS, apply_space_motion with distance and radial velocity, WGS84 AltAz, pressure=0 hPa, bundled IERS',rows=rows),dest,indent=2)
