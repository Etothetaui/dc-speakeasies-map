# DC Speakeasies Map

[Open the map](https://etothetaui.github.io/dc-speakeasies-map/)

**Current version: [v0.3.0-dev](VERSION)** · [Changelog](CHANGELOG.md)

An interactive guide to 16 hidden bars in Washington, DC and Alexandria, with entrance notes, secrecy scores, online ratings, sources, and walking directions.

- Food labels distinguish meals, snacks only, food in the parent restaurant/deli, and unverified service. Each bar's description includes published hours, kitchen cutoffs where available, source links, and the date checked. Conflicting or unavailable hours stay explicit.
- **DC only** limits the candidate bars to the 15 in the District.
- Toggle **Metro** to show the six color-coded rail lines and all 98 regional stations. Shared tracks show parallel colors and transfer stations show every line color; click a station for its lines and official station information. This display toggle is independent of route planning.
- **Start at Metro** and **Finish at Metro** independently accept no Metro, any line, or one line color. The planner automatically chooses qualifying stations together with the bar group and order. Transfer stations qualify for each line they serve; the same station may serve both ends. Chosen stations stay visible with the full network hidden.
- Choose the **shortest route**, **north to south**, **route by list sort**, or **pins only**.
- Set a maximum walking distance and circle radius. The planner checks every possible group to keep the most bars that satisfy both limits. Ties favor a shorter route, then a smaller containing circle.
- The walking limit includes both optional Metro legs. The circle's center is chosen automatically and contains bar locations; Metro stations and walking paths can be outside it. **DC only** restricts bars; eligible Metro stations remain regional.
- Sort the list independently by two metrics. When routing follows a sort that uses route order, a captured reference prevents circular updates.
- Search and secrecy filters narrow the list without removing route stops. Export saves the included bars as a KML file for Google My Maps.
- Changes preserve the map view. Use **Fit route** or **Fit pins** to move it deliberately.

**DC only** and **Metro** are off on a first visit; both Metro endpoint choices start at **No Metro**. Later visits remember these choices.

Venue research and review snapshots date to November 8, 2026. Walking-distance data dates to November 9, 2026. Check venue sources for current hours, entrance arrangements, and operation. [Read the research and sources](outputs/dc-speakeasies.md).

Food and bar hours were checked November 10, 2026. [Read the source notes](work/venue-service-research.md). These are planning details; the route planner does not schedule visits around opening hours.

Metro station locations are from [DC GIS / WMATA](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Rail_Bus_WebMercator/MapServer/51). Rail shapes, line assignments, and colors come from [WMATA Rider Tools](https://www.wmata.com/ridertools/lines), checked on November 10, 2026. Shared rail paths are offset slightly on screen so every color remains visible. Station points are not individual entrances or live service information.

## Run locally

No package installation is required to view the map:

```sh
python -m http.server 8000 --directory docs
```

Open `http://localhost:8000/`. An internet connection is needed for street tiles and any new walking directions. Existing saved directions and the selection calculation are bundled with the page.

## Build

```sh
python work/build_map.py
```

This builds `docs/index.html` for GitHub Pages and the local deliverable at `outputs/dc-speakeasies-map.html`. The source template, planner, sorting, provider adapter, bar data, and cached walking data are under `work/`.

The planner runs in a browser worker. It uses exact subset dynamic programming over directed walking-distance data for bar order and a spherical smallest-containing-circle calculation for the radius constraint. Eligible station-to-bar and bar-to-station minima become endpoint costs; station pairs and route combinations are not precomputed. The bundled Metro distance snapshot is November 10, 2026. Only up to four recent optimization tables per area and a small directions cache are retained.

Exact selection is against the working distance data, not a guarantee of globally shortest current sidewalk paths. New directions are checked before display: changed leg costs update the working data and trigger selection again, and an itinerary above the active cap is never marked ready. Repeatedly changing service costs produce a retry state. Approximate station centers, road snapping, and future service changes limit entrance-level accuracy; opening hours and time spent in bars are not included.

## Checks

```sh
python work/test_routes.py
python work/test_metro_geometry.py
node work/test-route-planner.cjs
node work/test-list-order.cjs
node work/test-sort-route.cjs
node work/test-metro-planner.cjs
```

These check subset selection against exhaustive enumeration, route order and distance, circle containment, sorting, walking-direction conversion, Metro eligibility and endpoint costs, unavailable/empty routes, distance revisions, bounded caching, and removal of short rail-shape backtracking artifacts.

## Hosting and attribution

GitHub Pages serves the `docs/` folder on `main`. Rebuild and commit `docs/index.html` when changing the source.

Map software: [Leaflet](https://leafletjs.com/) and [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster). Street maps: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Walking directions: [FOSSGIS/OSRM](https://map.project-osrm.org/about.html). Geocoding: [US Census Geocoder](https://geocoding.geo.census.gov/geocoder/).

The bundled map libraries' license notices are in [docs/third-party-notices.txt](docs/third-party-notices.txt).
