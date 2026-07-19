# Scene model sources v3

This inventory covers the immutable model payload originally published by `warm-craftsman-home` v3 and `forest-camp-evening` v3. Current home v5 reuses only the v3 wooden table; its former sofa and plant remain immutable for v3/v4 replay but are not bound or rendered by v5. Forest v5 reuses only the v3 campsite table and lantern while adding separately versioned Pine Forest prop derivatives documented here in a dedicated section. The v3 Kenney tent remains immutable for forest v1-v4 but is not bound or rendered by v5. Fixed-subject shadow/AO payloads are documented separately in `baked-lighting-v3.md`, while current composition/background changes are documented in `scene-assets.md`. This inventory does not claim that KTX2 textures, geometry-matched UV2 full-scene lightmaps or same-authored-scene panoramas exist.

## License and provenance

- Poly Haven states that its downloadable assets are released under **CC0**. Source pages and the API manifest were both checked on 2026-07-19: [Poly Haven license](https://polyhaven.com/license).
- Current home v5 uses Poly Haven's CC0 [Lythwood Lounge](https://polyhaven.com/a/lythwood_lounge) HDR/LDR environment; its exact public file records are in `scene-asset-manifest.md`. Lythwood Lounge and the inherited wooden table are separate authored assets.
- The forest v5 context uses selected derivatives from Poly Haven's official [Pine Forest complete scene](https://polyhaven.com/collections/pine_forest), also CC0. Its source archive is 2,746,288,533 bytes (published as 2.75 GB); the archive itself is private and is not loaded by the browser.
- Kenney's downloaded `Survival Kit (2.0)` archive contains `License.txt`, which identifies the pack as **Creative Commons Zero (CC0)** and permits commercial use: [Kenney Survival Kit](https://kenney.nl/assets/survival-kit). This provenance applies to the historical v3 tent retained by forest v1-v4, not to the current v5 payload.
- Raw downloads remain under ignored `private/scene-sources/v3/` and `private/scene-sources/v5/`. Only normalized derivatives are public.
- For the v3 payload, the Poly Haven API-provided MD5 for every primary glTF, geometry buffer and included 1K texture was compared with the downloaded file before conversion. All comparisons passed.

For a Poly Haven source bundle, `source bundle SHA-256` below means SHA-256 over a UTF-8 manifest containing every forward-slash relative path and its lowercase SHA-256 as `path:sha256\n`. Rows use ordinal Unicode code-point order. This makes the multi-file glTF input unambiguous and cross-platform reproducible without publishing the raw files.

## Warm Craftsman Home

| Asset | Official source | Source bundle SHA-256 | Public derivative | Triangles | Size, W×D×H | Bytes | Derivative SHA-256 |
|---|---|---|---|---:|---:|---:|---|
| Wooden Table 01 | [asset](https://polyhaven.com/a/WoodenTable_01) / [1K API manifest](https://api.polyhaven.com/files/WoodenTable_01) | `4ccf7f4a8f6b99e78cf39458a484818c293df1f9bc4469f835956dbca5eb690f` | `public/scenes/warm-craftsman-home/v3/models/wooden-table-01.glb` | 952 | 1.800×0.657×0.549 m | 540,264 | `4125d43bdd6a868819b059ed578236474163b7762b08afc03a7c68731ea2d3b9` |
| Sofa 02 | [asset](https://polyhaven.com/a/sofa_02) / [1K API manifest](https://api.polyhaven.com/files/sofa_02) | `e69632e4a2938ed17a6e8fc72baec5df7f8c9d234da356585fee94f6a56d62c9` | `public/scenes/warm-craftsman-home/v3/models/sofa-02.glb` | 2,728 | 1.807×0.818×0.709 m | 402,360 | `92decfac18a97244a89632ba5b4190fac693e4155566fabfe21c893bf71ac2de` |
| Potted Plant 04 | [asset](https://polyhaven.com/a/potted_plant_04) / [1K API manifest](https://api.polyhaven.com/files/potted_plant_04) | `c507be8d1ad2f1228626b9e1d5c162c2db7da2a5054055c3a3609e9e3c0f8b50` | `public/scenes/warm-craftsman-home/v3/models/potted-plant-04.glb` | 8,929 | 0.168×0.185×0.267 m | 2,021,332 | `d87f71d151c100c584d84453caa7a9529b5f7de62c5147ce95a6874aa43794a0` |

Historical v3/v4 High/Medium model subtotal: **12,609 triangles, 2,963,956 bytes (2.83 MiB)**. The table and sofa supply compact near/mid-field geometry with base colour, OpenGL tangent-space normal and packed ambient-occlusion/roughness/metallic data. Current home v5 loads only the 952-triangle, 540,264-byte table from this group; sofa and plant are legacy replay assets.

## Forest Camp Evening inherited v3 campsite

| Asset | Official source | Source bundle / archive SHA-256 | Public derivative | Triangles | Size, W×D×H | Bytes | Derivative SHA-256 |
|---|---|---|---|---:|---:|---:|---|
| Outdoor Table & Chair Set 01 | [asset](https://polyhaven.com/a/outdoor_table_chair_set_01) / [1K API manifest](https://api.polyhaven.com/files/outdoor_table_chair_set_01) | `8a046a6d4b3e8fccb7704eaf678f947dcd09f5feb349e89b570bd6ad0720e98c` | `public/scenes/forest-camp-evening/v3/models/outdoor-table-chair-set-01.glb` | 9,828 | 0.776×1.831×0.859 m | 1,078,120 | `722f63754f52fc44ca10cc2479ce24c0eb7462b1d5e2b83aee9dbcb3f7ce55f7` |
| Lantern 01 | [asset](https://polyhaven.com/a/Lantern_01) / [1K API manifest](https://api.polyhaven.com/files/Lantern_01) | `4c2ef9740b7c764576f42e48aeaa6d00f0e0fac2a4ea894302d96b0556cc026c` | `public/scenes/forest-camp-evening/v3/models/lantern-01.glb` | 33,902 | 0.122×0.097×0.294 m | 2,182,772 | `20257bdde2d3c928d329cda19c0272057a2aafce1e62b1cca61391d156702356` |
| Tent + canvas | [Kenney Survival Kit](https://kenney.nl/assets/survival-kit) / [official ZIP](https://kenney.nl/media/pages/assets/survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip) | `c3586341b5932c87eb43d75d915434f47daed168b17ed36a03e8ca9977c7443e` | `public/scenes/forest-camp-evening/v3/models/kenney-tent.glb` | 272 | 2.243×2.244×1.965 m | 19,444 | `633eeff968f46eae534ff6b003c0d5dbf46f151f93cb5c186b5be8b9449eb2be` |

High/Medium model subtotal: **44,002 triangles, 3,280,336 bytes (3.13 MiB)**. The Poly Haven set and lantern carry base colour, OpenGL normal and packed PBR maps. The first visual-QA render exposed that Kenney's `tent.glb` is only the timber frame, so the corrected derivative combines `tent.glb` with `tent-canvas.glb`. It remains an intentionally stylized, colour-map-only mid/far-field object and must not be described as a PBR near-field asset. The 4× conversion recorded in the build script changes its compact source units to a plausible 2.24 m footprint and 1.97 m ridge height.

That subtotal describes the immutable v3 campsite release. Forest v5 deliberately excludes the 19,444-byte tent while retaining the table and lantern.

## Forest v5 Pine Forest prop derivatives

Forest v5 adds a curated composition derived from the official Poly Haven Pine Forest complete scene. It selects three linked pine-trunk instances, twelve fern instances, four moss-rock instances and one fallen-dead-tree instance. All unrelated source objects stay out of the public GLBs. The prior opaque 9 × 9 m ground node, ground material and three ground images are also absent. This is not the complete 2.75 GB scene, and it is not the same authored scene as the separately sourced Nature Reserve Forest HDR/LDR environment.

Each derivative is glTF 2.0 with `EXT_meshopt_compression`, 20 nodes, four materials and twelve embedded images. The materials use base colour, tangent-space normal and roughness inputs with metallic factor zero; the fern colour texture also supplies alpha. Geometry and embedded image resolution are deliberately tiered, so unlike the inherited v3 Low variants these files do not share one triangle count.

| Tier derivative | Maximum embedded image edge | Unique mesh triangles | Visible instance triangles | Bytes | Derivative SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `public/scenes/forest-camp-evening/v5/models/pine-forest-props-low-46a9ce4b9e1217a4.glb` | 256 px | 5,111 | 10,049 | 454,776 | `46a9ce4b9e1217a40eedec5cca5e9c33f0564cfcc8ef1e076979749fda6b942e` |
| `public/scenes/forest-camp-evening/v5/models/pine-forest-props-medium-3fa78f9e225c8e8f.glb` | 512 px | 8,785 | 15,111 | 1,298,620 | `3fa78f9e225c8e8f1104cd5c672bb410e2ca9292aeeffa56fddeb90d8c4c287b` |
| `public/scenes/forest-camp-evening/v5/models/pine-forest-props-high-149fc9facc78ecc4.glb` | 896 px | 17,420 | 35,316 | 3,775,268 | `149fc9facc78ecc46a35ad302d58aef07d325c70a629df8fae78d35d14f192fa` |

“Unique mesh triangles” counts each linked mesh once; “visible instance triangles” counts the geometry actually drawn after instances are placed. These counts cover only the new props, not the inherited v3 table or lantern. No v5 count includes the tent or an opaque ground.

Nature Reserve Forest supplies the visual background and ground through `GroundedSkybox`, using the same 1K HDR for PMREM in every tier and separate 768 px JPG/1K JPG/4K WebP LDR tiers. That projection is not model geometry, collision or physical lighting, and it remains separately authored from these Pine Forest props.

## Inherited v3 Low texture variants

These variants reuse the exact High/Medium geometry, node transforms, dimensions, material slots and Meshopt settings. Only the embedded source PBR textures are reduced before the same Blender export: 512 px for the table, sofa, plant and camp table set, and 480 px for the lantern. Base colour remains sRGB; normal and packed AO/roughness/metallic data remain linear material inputs.

| Variant | Geometry source | Triangles | Maximum texture edge | Bytes | Budget | SHA-256 |
|---|---|---:|---:|---:|---:|---|
| `wooden-table-01-low.glb` | `wooden-table-01.glb` | 952 | 512 px | 167,372 (0.160 MiB) | ≤0.25 MiB | `8fb0ac43adecc9ddb0c000a96b9d1af4c2a384650fa1489b058cefc70b732f19` |
| `sofa-02-low.glb` | `sofa-02.glb` | 2,728 | 512 px | 170,872 (0.163 MiB) | ≤0.25 MiB | `b7c39901e5a85262ee17b84df6844fd417291065c02ac5c45f7b2942aa5f7c88` |
| `potted-plant-04-low.glb` | `potted-plant-04.glb` | 8,929 | 512 px | 318,616 (0.304 MiB) | ≤0.75 MiB | `06b827280ba85b31063f2609ba545de2b9090abfb416d39a88ac1cea50db42fb` |
| `outdoor-table-chair-set-01-low.glb` | `outdoor-table-chair-set-01.glb` | 9,828 | 512 px | 501,252 (0.478 MiB) | ≤0.60 MiB | `d28edb5ffcdcb05382f998686f67e24c8f59d136af05b94de2a2b8d881e3084c` |
| `lantern-01-low.glb` | `lantern-01.glb` | 33,902 | 480 px | 867,708 (0.828 MiB) | ≤896,748 B | `60df83c65b8368ddb49e5a898caaf8a053a33f3c8e4909820454c4fb91f02639` |

The historical inherited Low model payload is **656,860 bytes (0.63 MiB)** for the indoor trio and **1,388,404 bytes (1.32 MiB)** for the outdoor campsite trio. Current home v5 loads only the 167,372-byte wooden-table Low derivative; with its 1K HDR, 768 px LDR background, table projection and contact AO it totals exactly **1,801,923 bytes**. The v4 sofa, plant and 745,086-byte oak-floor set remain legacy-only. Forest v5 excludes the 19,444-byte tent, so its active Low table/lantern pair is 1,368,960 bytes. Combining that pair with the 454,776-byte prop GLB, 1K HDR, 768 px LDR background, table projection, contact AO and context occlusion gives an exact Low total of **3,882,089 bytes**, below the 4,000,000-byte target by 117,911 bytes. The inherited Low assets use 512 px maps for the home/camp tables and 480 px maps for the lantern; the separate forest prop Low derivative uses 256 px images and tier-specific geometry.

## Reproducible v3 conversion

The ignored scripts `private/scene-sources/v3/prepare_low_texture_sources_v3.mjs` and `private/scene-sources/v3/prepare_scene_models_v3.py` run with Sharp and Blender 5.2 LTS and perform these operations:

1. Keep the official 1K glTF source intact. For the five Low variants, generate private 512 px (table, sofa, plant and camp table set) or 480 px (lantern) derivatives of colour, OpenGL normal and packed material maps using deterministic MozJPEG settings.
2. Import the selected 1K or 512 px glTF/GLB source.
3. Preserve physical scale for Poly Haven assets; apply the documented 4× scale only to the Kenney tent.
4. Centre the model horizontally and place its lowest point at zero, with the public glTF exported Y-up in metres.
5. Remove source lights/cameras, validate mesh data, preserve UVs, normals, tangents and materials.
6. Embed the selected colour, OpenGL normal and packed material maps in a single GLB.
7. Apply `EXT_meshopt_compression` to geometry. Runtime loading therefore needs a configured Meshopt decoder.

For this inherited v3 payload, no KTX2 conversion, texture upscaling, generated normal map, geometry decimation, new geometry-AO/lightmap bake or displacement bake is claimed. The selected geometry was already below the scene triangle budgets. Each of the five Poly Haven PBR models therefore has one geometry representation and two embedded texture-resolution derivatives; the colour-only Kenney tent is shared across tiers.

### Forest v5 prop conversion

The ignored v5 build material remains under `private/scene-sources/v5/polyhaven-pine-forest/`. A range-extraction helper selects only the required PBR source entries from the official 2.75 GB archive, and `build_forest_context_v5.py` uses Blender 5.2 to:

1. load private 256/512/896 px colour, OpenGL normal and roughness derivatives for Low/Medium/High;
2. select only the pine trunk, dead tree, moss-rock and fern source meshes used by the layout, explicitly omitting the opaque ground and two near-field rocks rejected in visual QA;
3. apply tier-specific geometry reduction and reuse linked instances for repeated trunks, rocks and ferns;
4. embed all twelve tier images, preserve fern alpha and export Y-up glTF 2.0;
5. apply `EXT_meshopt_compression` and emit an exact byte/hash/unique-triangle/visible-triangle report.

The conversion does not publish the source `.blend`, unused source objects or full archive. It does not use KTX2, upscale textures, generate normal maps or claim a UV2/full-scene lighting bake.

## Independent validation

`private/scene-sources/v3/validate_scene_models_v3.py` parses the binary GLBs without Blender and asserts:

- correct glTF 2.0 headers and declared lengths;
- a scene, nodes, meshes and materials exist;
- textures are embedded and contain no path back into `private/`;
- Meshopt metadata is present;
- expected triangle counts are unchanged;
- every Poly Haven derivative still exposes a tangent-space normal texture and metallic/roughness texture;
- Low and High nodes, mesh count, material count, dimensions and triangle count remain equal;
- every Low embedded texture is at most its declared 512/480 px edge, and both Low byte budgets pass.

The structural validators passed for the six primary v3 derivatives and five v3 Low derivatives on 2026-07-19. Blender 5.2 re-imported the primary set and the original plant/lantern Low pair; the expanded Low validator independently confirms unchanged nodes, mesh/material counts and triangle counts for the table, sofa and camp-table derivatives, plus their embedded-image limits. Fixed-rig renders of the plant and lantern Low derivatives were visually indistinguishable from their High counterparts at a 560 px review size.

Forest v5 tests independently parse all three prop GLBs and pin their file size, SHA-256, Meshopt declaration, 20 nodes, four materials, twelve embedded images, absence of an opaque ground node/material, PBR bindings, fern alpha mode and unique triangle counts. The private build reports additionally record visible instance triangles. These validations passed on 2026-07-20. Model-only totals do not include the environment or display lighting layers; complete published tier totals and checksum evidence are recorded in `scene-asset-manifest.md`.
