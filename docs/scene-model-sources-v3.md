# Scene model sources v3

This inventory covers the immutable model payload originally published by `warm-craftsman-home` v3 and `forest-camp-evening` v3 and reused byte-for-byte by the current v4 compositions. It records model provenance and conversion only; the fixed-subject shadow/AO payload is documented separately in `baked-lighting-v3.md`, while v4 placement/background changes are documented in `scene-assets.md`. It does not claim that KTX2 textures, geometry-matched UV2 full-scene lightmaps or same-authored-scene panoramas exist.

## License and provenance

- Poly Haven states that its downloadable assets are released under **CC0**. Source pages and the API manifest were both checked on 2026-07-19: [Poly Haven license](https://polyhaven.com/license).
- Kenney's downloaded `Survival Kit (2.0)` archive contains `License.txt`, which identifies the pack as **Creative Commons Zero (CC0)** and permits commercial use: [Kenney Survival Kit](https://kenney.nl/assets/survival-kit).
- Raw downloads remain under ignored `private/scene-sources/v3/`. Only normalized derivatives are public.
- The Poly Haven API-provided MD5 for every primary glTF, geometry buffer and included 1K texture was compared with the downloaded file before conversion. All comparisons passed.

For a Poly Haven source bundle, `source bundle SHA-256` below means SHA-256 over a UTF-8 manifest containing every forward-slash relative path and its lowercase SHA-256 as `path:sha256\n`. Rows use ordinal Unicode code-point order. This makes the multi-file glTF input unambiguous and cross-platform reproducible without publishing the raw files.

## Warm Craftsman Home

| Asset | Official source | Source bundle SHA-256 | Public derivative | Triangles | Size, W×D×H | Bytes | Derivative SHA-256 |
|---|---|---|---|---:|---:|---:|---|
| Wooden Table 01 | [asset](https://polyhaven.com/a/WoodenTable_01) / [1K API manifest](https://api.polyhaven.com/files/WoodenTable_01) | `4ccf7f4a8f6b99e78cf39458a484818c293df1f9bc4469f835956dbca5eb690f` | `public/scenes/warm-craftsman-home/v3/models/wooden-table-01.glb` | 952 | 1.800×0.657×0.549 m | 540,264 | `4125d43bdd6a868819b059ed578236474163b7762b08afc03a7c68731ea2d3b9` |
| Sofa 02 | [asset](https://polyhaven.com/a/sofa_02) / [1K API manifest](https://api.polyhaven.com/files/sofa_02) | `e69632e4a2938ed17a6e8fc72baec5df7f8c9d234da356585fee94f6a56d62c9` | `public/scenes/warm-craftsman-home/v3/models/sofa-02.glb` | 2,728 | 1.807×0.818×0.709 m | 402,360 | `92decfac18a97244a89632ba5b4190fac693e4155566fabfe21c893bf71ac2de` |
| Potted Plant 04 | [asset](https://polyhaven.com/a/potted_plant_04) / [1K API manifest](https://api.polyhaven.com/files/potted_plant_04) | `c507be8d1ad2f1228626b9e1d5c162c2db7da2a5054055c3a3609e9e3c0f8b50` | `public/scenes/warm-craftsman-home/v3/models/potted-plant-04.glb` | 8,929 | 0.168×0.185×0.267 m | 2,021,332 | `d87f71d151c100c584d84453caa7a9529b5f7de62c5147ce95a6874aa43794a0` |

High/Medium model subtotal: **12,609 triangles, 2,963,956 bytes (2.83 MiB)**. The table and sofa supply compact near/mid-field geometry with base colour, OpenGL tangent-space normal and packed ambient-occlusion/roughness/metallic data.

## Forest Camp Evening

| Asset | Official source | Source bundle / archive SHA-256 | Public derivative | Triangles | Size, W×D×H | Bytes | Derivative SHA-256 |
|---|---|---|---|---:|---:|---:|---|
| Outdoor Table & Chair Set 01 | [asset](https://polyhaven.com/a/outdoor_table_chair_set_01) / [1K API manifest](https://api.polyhaven.com/files/outdoor_table_chair_set_01) | `8a046a6d4b3e8fccb7704eaf678f947dcd09f5feb349e89b570bd6ad0720e98c` | `public/scenes/forest-camp-evening/v3/models/outdoor-table-chair-set-01.glb` | 9,828 | 0.776×1.831×0.859 m | 1,078,120 | `722f63754f52fc44ca10cc2479ce24c0eb7462b1d5e2b83aee9dbcb3f7ce55f7` |
| Lantern 01 | [asset](https://polyhaven.com/a/Lantern_01) / [1K API manifest](https://api.polyhaven.com/files/Lantern_01) | `4c2ef9740b7c764576f42e48aeaa6d00f0e0fac2a4ea894302d96b0556cc026c` | `public/scenes/forest-camp-evening/v3/models/lantern-01.glb` | 33,902 | 0.122×0.097×0.294 m | 2,182,772 | `20257bdde2d3c928d329cda19c0272057a2aafce1e62b1cca61391d156702356` |
| Tent + canvas | [Kenney Survival Kit](https://kenney.nl/assets/survival-kit) / [official ZIP](https://kenney.nl/media/pages/assets/survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip) | `c3586341b5932c87eb43d75d915434f47daed168b17ed36a03e8ca9977c7443e` | `public/scenes/forest-camp-evening/v3/models/kenney-tent.glb` | 272 | 2.243×2.244×1.965 m | 19,444 | `633eeff968f46eae534ff6b003c0d5dbf46f151f93cb5c186b5be8b9449eb2be` |

High/Medium model subtotal: **44,002 triangles, 3,280,336 bytes (3.13 MiB)**. The Poly Haven set and lantern carry base colour, OpenGL normal and packed PBR maps. The first visual-QA render exposed that Kenney's `tent.glb` is only the timber frame, so the corrected derivative combines `tent.glb` with `tent-canvas.glb`. It remains an intentionally stylized, colour-map-only mid/far-field object and must not be described as a PBR near-field asset. The 4× conversion recorded in the build script changes its compact source units to a plausible 2.24 m footprint and 1.97 m ridge height.

## Low texture variants

These variants reuse the exact High/Medium geometry, node transforms, dimensions, material slots and Meshopt settings. Only the embedded source PBR textures are reduced before the same Blender export: 512 px for the table, sofa, plant and camp table set, and 480 px for the lantern. Base colour remains sRGB; normal and packed AO/roughness/metallic data remain linear material inputs.

| Variant | Geometry source | Triangles | Maximum texture edge | Bytes | Budget | SHA-256 |
|---|---|---:|---:|---:|---:|---|
| `wooden-table-01-low.glb` | `wooden-table-01.glb` | 952 | 512 px | 167,372 (0.160 MiB) | ≤0.25 MiB | `8fb0ac43adecc9ddb0c000a96b9d1af4c2a384650fa1489b058cefc70b732f19` |
| `sofa-02-low.glb` | `sofa-02.glb` | 2,728 | 512 px | 170,872 (0.163 MiB) | ≤0.25 MiB | `b7c39901e5a85262ee17b84df6844fd417291065c02ac5c45f7b2942aa5f7c88` |
| `potted-plant-04-low.glb` | `potted-plant-04.glb` | 8,929 | 512 px | 318,616 (0.304 MiB) | ≤0.75 MiB | `06b827280ba85b31063f2609ba545de2b9090abfb416d39a88ac1cea50db42fb` |
| `outdoor-table-chair-set-01-low.glb` | `outdoor-table-chair-set-01.glb` | 9,828 | 512 px | 501,252 (0.478 MiB) | ≤0.60 MiB | `d28edb5ffcdcb05382f998686f67e24c8f59d136af05b94de2a2b8d881e3084c` |
| `lantern-01-low.glb` | `lantern-01.glb` | 33,902 | 480 px | 867,708 (0.828 MiB) | ≤896,748 B | `60df83c65b8368ddb49e5a898caaf8a053a33f3c8e4909820454c4fb91f02639` |

The resulting Low model payload is **656,860 bytes (0.63 MiB)** for the indoor trio and **1,388,404 bytes (1.32 MiB)** for the outdoor trio. In the current v4 catalog, adding the 1K environment, Cycles table projection and profile contact AO once gives 3,383,267 bytes for forest; home additionally binds 745,086 bytes of reused v2 oak floor maps, bringing its Low total to 3,131,779 bytes. Both remain below the 4,000,000-byte initial-scene target. Low uses 512 px derivatives for the home table, sofa and plant, and for the camp table set; the lantern uses a 480 px derivative.

## Reproducible conversion

The ignored scripts `private/scene-sources/v3/prepare_low_texture_sources_v3.mjs` and `private/scene-sources/v3/prepare_scene_models_v3.py` run with Sharp and Blender 5.2 LTS and perform these operations:

1. Keep the official 1K glTF source intact. For the five Low variants, generate private 512 px (table, sofa, plant and camp table set) or 480 px (lantern) derivatives of colour, OpenGL normal and packed material maps using deterministic MozJPEG settings.
2. Import the selected 1K or 512 px glTF/GLB source.
3. Preserve physical scale for Poly Haven assets; apply the documented 4× scale only to the Kenney tent.
4. Centre the model horizontally and place its lowest point at zero, with the public glTF exported Y-up in metres.
5. Remove source lights/cameras, validate mesh data, preserve UVs, normals, tangents and materials.
6. Embed the selected colour, OpenGL normal and packed material maps in a single GLB.
7. Apply `EXT_meshopt_compression` to geometry. Runtime loading therefore needs a configured Meshopt decoder.

No KTX2 conversion, texture upscaling, generated normal map, geometry decimation, new geometry-AO/lightmap bake or displacement bake is claimed here. The selected geometry is already below the scene triangle budgets. Each of the five Poly Haven PBR models therefore has one geometry representation and two embedded texture-resolution derivatives; the colour-only Kenney tent is shared across tiers.

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

The structural validators passed for the six primary derivatives and five Low derivatives on 2026-07-19. Blender 5.2 re-imported the primary set and the original plant/lantern Low pair; the expanded Low validator independently confirms unchanged nodes, mesh/material counts and triangle counts for the table, sofa and camp-table derivatives, plus their embedded-image limits. Fixed-rig renders of the plant and lantern Low derivatives were visually indistinguishable from their High counterparts at a 560 px review size. Model-only totals do not include the environment or display lighting layers; complete published tier totals and checksum evidence are recorded in `scene-asset-manifest.md`.
