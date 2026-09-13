# Piața Alba Iulia data check

Area: a 600 m local metric square centered on OSM node 13765385634 at 44.4255759 N, 26.1290765 E. Projection: WGS84 local azimuthal equidistant, with east as X and south as Z. Bounds for the raw queries are approximately the same rectangle; conversion clips geometry to the metric square.

OSM snapshot: `2026-09-13T17:35:27Z`, downloaded from `https://overpass-api.de/api/interpreter` using the exact saved query in `data/raw/query.overpass`. The raw response contains 4,943 elements, including supporting nodes and relation members. The square's location was verified in the response itself.

| After conversion / filtering | OSM scene | Overture comparison |
| --- | ---: | ---: |
| Buildings | 349 | 371 |
| Buildings with explicit height | 1 | 1 |
| Buildings with floors used / available | 82 | 83 |
| Height estimated without floors | 266 | Not rendered |

Overture is release `2026-08-19.0`, downloaded through the official `overturemaps` Python client. Of the 371 retained features, 350 list OpenStreetMap and 21 list Microsoft ML Buildings as sources. Twenty-two have less than 20% of their area overlapping the union of the OSM scene's footprints. This is a coverage comparison heuristic, not confirmation that all 22 represent real missing buildings; the releases differ in age, and their geometry is not necessarily identical.

Recommendation for this area: use OSM for the first scene. It contains the main apartment blocks, roundabout, roads, footpaths, and many trees, while Overture mostly reproduces the same buildings and adds little height information. Inspect the additional footprints visually before merging them. No building polygons from Overture are currently in the playable scene.

OSM processing excludes one legacy CLC land-use feature that had been retagged `building=service` with a warning explaining it was hidden from rendering. It is not treated as a physical building. Polygons smaller than 8 m² after clipping are also omitted. Multi-ring polygons are preserved. Numeric heights use meters; floor-based heights use 3.1 m per tagged floor; untagged apartments default to 25 m and other untagged buildings to 7 m. These are assumptions, not measurements. Road widths also have class-based defaults.

The navigation grid has 200 × 200 cells at 3 m spacing, of which 24,046 are traversable. Two mapped building passages are considered when constructing obstacles, but clearance can close narrow passages. Open ground is traversable at higher cost than roads. Entrances are sampled exterior cells rather than surveyed doors.

Four routes to the initial stronghold, **Bl. i 1**, were checked against the rendered building polygons:

| Entry | Route length | Length intersecting buildings |
| --- | ---: | ---: |
| West | 398.0 m | 0 m |
| North | 240.8 m | 0 m |
| East | 266.9 m | 0 m |
| South | 458.5 m | 0 m |

This geometric check covers these four default routes. Unit checks also cover corner cutting, route preference, boundary coordinates, and blocked paths. It is not a guarantee that every possible target or future data snapshot has a usable route; the UI explicitly handles unreachable targets.

Sources and licenses: [OpenStreetMap copyright](https://www.openstreetmap.org/copyright), [Overture buildings schema](https://docs.overturemaps.org/schema/reference/buildings/building/), [Overture licensing](https://docs.overturemaps.org/attribution/), [Overture Python client](https://docs.overturemaps.org/getting-data/overturemaps-py/).

The raw OSM extract and derived level dataset are ODbL 1.0 data. Overture's building theme is also ODbL 1.0 and includes © OpenStreetMap contributors and Microsoft Global ML Building Footprints for the downloaded area. Preserve these notices when distributing the data. Stylized screenshot attribution appears within the application.


# Charles de Gaulle / Aviatorilor

A second 600 × 600 m scene centered at 44.466 N, 26.0867 E includes the square, nearby Aviatorilor streets, the park edge, and **Charles de Gaulle Plaza at Piața Charles de Gaulle 15**. The default stronghold is OSM [way 216673929](https://www.openstreetmap.org/way/216673929), exported as `way/216673929/0`. Its source tags supply the name, address, office use, glass facade material, 16 floors, and a height of 70 m. The renderer uses that tagged height; it has not been independently surveyed. Facade details are procedural.

OSM snapshot: `2026-09-13T18:24:21Z`. The saved query and 6,406-element response are in `data/raw/charles-de-gaulle/`. Converted output: `public/data/charles-de-gaulle.json`. Conversion uses the same projection, clipping, height assumptions, and navigation rules as Alba Iulia.

| Converted feature | Count |
| --- | ---: |
| Building polygons | 279 |
| Road/path features | 182 |
| Individually mapped trees | 1 |
| Buildings using a height tag | 1 |
| Buildings using floor counts | 25 |
| Buildings using default heights | 253 |
| Navigable grid cells | 26,943 |

The park boundary is mapped, but individual tree coverage is sparse. This reflects missing tree data, not an absence of trees in the real park. No Overture comparison was downloaded for this neighborhood.

All four initial approaches to Charles de Gaulle Plaza were checked against the rendered building polygons:

| Entry | Route length | Length intersecting buildings |
| --- | ---: | ---: |
| West | 388.2 m | 0 m |
| North | 409.5 m | 0 m |
| East | 256.0 m | 0 m |
| South | 182.5 m | 0 m |

These results describe the frozen snapshot and default target. Other targets may have different accessibility. Both scenes are covered by the navigation tests and browser interaction check.


# Procedural detail pass

Level format version 2 preserves the original building footprints, total building heights, inferred entrances, spawns, and navigation grid. Road records retain source lane counts, surface, sidewalk, one-way, and junction tags; area records retain the land-cover category. Sidewalk widths and lane placement remain approximations of centerline geometry.

Roof records distinguish `source: OSM roof:shape` from `source: procedural`. Gabled, hipped, and skillion roofs are reconstructed by splitting the footprint at changes in slope and triangulating each part, preserving concave outlines and holes. Roof rise and orientation are inferred; rise is deducted from wall height so the roof stays within the exported total building height. Unsupported mapped roof shapes retain their original tag but use a flat rendering fallback. Some untagged buildings below 14 m and 400 m² receive an inferred hipped roof. There are 183 rendered pitched roofs in Alba Iulia and 151 in Charles de Gaulle; these totals include inferred roofs.

Facade panel layouts, balconies, parapets, rooftop equipment, pavement details and contact shading are procedural. The Plaza has a glass-panel facade based on its mapped glass material, but the panel spacing and bands are stylized. Roof equipment sits within an inset of the footprint and is decorative; its small protrusions are additional to the building envelope.

Generated park planting is exported separately in `decorativeTrees`, with `source: procedural` on every record: 13 candidates for Alba Iulia and 251 for Charles de Gaulle. Seeds are stable for reproducible placement. Candidates stay inside park/garden/wooded polygons and away from buildings, road/path corridors, mapped trees, water, and playgrounds. Dense mapped tree coverage suppresses infill. The browser hides generated trees within 6 m of the active route and 9 m of towers; they neither change navigation nor prevent tower placement. The mapped tree count in the sidebar excludes this planting. No claim is made that the generated trees exist at these positions in reality.

`npm test` checks all default approaches. `scripts/check_scenery.py` checks roof coverage and height bounds, rooftop equipment placement, and tree clearances; it also checks default routes against buildings when the route files from `npm test` are available. The browser check covers selection, all four approaches, tower placement, combat, map switching and mobile layout.


The art pass adds runtime decorative parked cars, original pixel tree sprites, occasional blossom colors, striped storefront awnings, and a stronghold pennant. Facade rows are grouped for readability and are not an exact depiction of mapped floor counts; the original values remain in the sidebar and exported data. Car locations are inferred beside mapped residential/service roads, checked against the existing clearance grid and trees, and hidden near the active route and towers. They add no collision obstacles. Blossom colors and canopy shapes do not imply mapped tree species or a surveyed season. The pennant is a game objective marker. All source footprints, source height fields, and navigation cells remain unchanged.

Roof crease lines, contrasting caps, window sprites, balcony rails, and tree-crown variants are artistic treatments. Tree ground shadows follow the scene lighting rather than surveyed canopy extents. The enlarged objective pennant is a gameplay marker. These rendering refinements do not alter source footprints, heights, mapped floor counts, or navigation.
