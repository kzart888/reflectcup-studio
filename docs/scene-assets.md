# Scene assets and provenance

The customer preview exposes three immutable scene identities. The current customer catalog is intentionally mixed-version: `warm-craftsman-home` and `forest-camp-evening` use their code-and-content-bound **v5** compositions, while `studio-neutral` remains the published **v2** diagnostic release. Earlier v1 identities and former home/forest v2/v3/v4 releases remain pinned for snapshot audit and regression; they are not overwritten by this pass. Home v5 reuses only the immutable v3 wooden table and Cycles display layers, replaces the v4 room-shell composition with content-addressed Lythwood Lounge HDR/LDR assets, and binds the change under a new checksum. Forest v5 similarly binds its own selected immutable v3 campsite/Cycles assets and versioned Nature Reserve Forest/Pine Forest composition.

The concept frames under `docs/assets/scenes/concepts/` were generated for this project on 2026-07-18 and are art-direction references only. They are ordinary perspective images, not PBR maps, lightmaps or rotatable backgrounds.

## Selected directions

- `warm-craftsman-home`: interior option 1, a warm modern Craftsman breakfast corner. Reference: `warm-craftsman-home-selected.png`.
- `forest-camp-evening`: outdoor option 2, a dusk forest-camp table. Reference: `forest-camp-evening-selected.png`.
- `studio-neutral`: retained as a neutral optical diagnostic scene rather than a merchandising direction.

## Current runtime composition

### `warm-craftsman-home` v5

- Near geometry: only the immutable v3 Meshopt-compressed Poly Haven **Wooden Table 01** derivative is reused. The v4 sofa, plant, procedural room shell and reused oak-floor maps are not referenced or loaded, removing the overlapping-furniture and visibly small room-box failure mode. The table keeps its PBR base colour, tangent-space normal and packed AO/roughness/metallic input; runtime reconnects the shared ARM R channel as `aoMap`.
- Environment/background: Poly Haven [**Lythwood Lounge**](https://polyhaven.com/a/lythwood_lounge), CC0, supplies content-addressed 1K/2K Radiance HDR files for PMREM and matching-orientation tonemapped LDR files for the visible `GroundedSkybox`. The projection is fixed at capture height 1.207282 m, radius 7.1 m, ground level -0.727282 m and yaw -2.6 rad.
- Quality variants: Low combines the 512 px table, 768 × 384 JPG and 1K HDR; Medium combines the 1K table, 1024 × 512 JPG and 1K HDR; High retains the 1K table and uses a 4096 × 2048 WebP plus 2K HDR. The three public LDR files derive from Poly Haven's official 8192 × 4096 tonemapped JPG.
- Authorship boundary: Lythwood Lounge supplies the visible photographed room and reflection environment, but the inherited wooden table was not authored as part of that HDR scene. Exact table/background/reflection correspondence is therefore not claimed. `GroundedSkybox` is visual projection, not room geometry, collision or a physical-lighting bake.
- Dynamic-subject projection: the immutable `v3/lighting/table-shadow.png`, rendered offline in Blender 5.2/Cycles from the fixed cup, handle and saucer proxy, plus the profile-addressed `curved-cup-v3` contact AO. Both remain preview-only.

### `forest-camp-evening` v5

- Inherited campsite geometry: forest v5 reuses only the immutable v3 Meshopt derivatives of Poly Haven **Outdoor Table & Chair Set 01** and **Lantern 01**. Both source chairs remain hidden and the lantern remains approximately 191 mm high. The Kenney tent is neither bound nor rendered by v5; its file and usage remain immutable for forest v1-v4 replay.
- New prop geometry: three Meshopt-compressed derivatives curate only selected content from Poly Haven's CC0 **Pine Forest** complete scene: three pine trunks, twelve ferns, four moss rocks and one fallen dead tree. They deliberately omit the earlier 9 × 9 m opaque ground node, its material and its three images. The browser does **not** load the full 2.75 GB complete scene or its unselected objects. Low/Medium/High contain 5,111/8,785/17,420 unique mesh triangles and 10,049/15,111/35,316 visible instance triangles.
- Materials: the inherited Poly Haven table and lantern retain base colour, tangent-space normal and packed ambient-occlusion/roughness/metallic inputs; runtime connects their shared ARM R channel to `aoMap`. Each new Pine Forest prop derivative has 20 nodes, four PBR materials and twelve embedded base-colour, tangent-normal and roughness images; fern colour also supplies alpha. The material image tiers remain 256/512/896 px for Low/Medium/High.
- Environment/background: Poly Haven [**Nature Reserve Forest**](https://polyhaven.com/a/nature_reserve_forest), CC0, supplies a 1K Radiance HDR for PMREM/reflection lighting in every tier. Low uses a 768 × 384 JPG and Medium a 1024 × 512 JPG. High uses a 4096 × 2048 WebP encoded at quality 82 from Poly Haven's official API-listed 8192 × 4096 tonemapped source. These LDR files feed Three.js `GroundedSkybox` for the visible background and photographed ground. `GroundedSkybox` is not a ground mesh, collision receiver or physical-lighting bake. Nature Reserve Forest and the Pine Forest complete scene are different authored sources; the composition does not claim exact prop/background/reflection correspondence.
- Quality variants: Low combines the 768 px JPG, 256 px prop tier, v3 512 px camp-table and 480 px lantern derivatives. Medium combines the 1K JPG, 512 px prop tier and v3 1K camp models. High combines the 4K WebP, 896 px prop tier and the same v3 1K camp models. The 1K HDR is identical across tiers, and no v5 tier downloads the tent.
- Display lighting: the immutable `v3/lighting/table-shadow.png` remains the Blender 5.2/Cycles fixed-subject projection. A transparent 512 × 512 baked context-occlusion decal anchors the Pine Forest props without restoring the removed opaque ground. Both are preview-only.

### `studio-neutral` v2

- Near geometry remains the small project-authored diagnostic table/studio mesh.
- Reflection environment is Poly Haven **Studio Small 08**, CC0, 1K Radiance HDR.
- Its v2 table-shadow decal and shared contact layer are the earlier deterministic analytic/Sharp outputs. They remain immutable for the v2 scene rather than being silently replaced with v3 assets.

## Model licensing and conversion

Poly Haven publishes its downloadable assets under [CC0](https://polyhaven.com/license/). This covers Lythwood Lounge, Nature Reserve Forest, Pine Forest and the inherited model sources. Kenney's downloaded Survival Kit archive includes a CC0 `License.txt`. Raw source bundles and conversion scripts remain ignored under `private/scene-sources/v3/` and `private/scene-sources/v5/`; only normalised derivatives are public.

The public v3 GLBs and v5 Pine Forest context GLBs are Y-up, metre-scale, self-contained files with embedded textures and `EXT_meshopt_compression`. Source provenance, exact public hashes, triangle counts, material coverage and independent validation are recorded in [`scene-model-sources-v3.md`](scene-model-sources-v3.md). Fixed-rig material, clay and scale-lineup evidence for the v3 payload is under `docs/assets/scenes/v3-model-review/`.

No KTX2 texture conversion, texture upscaling, generated normal map or displacement bake is claimed. The v3 model variants keep their original geometry; the new v5 Pine Forest context deliberately uses tier-specific selected geometry and decimation, so its Low/Medium/High triangle counts differ. PBR maps remain embedded in the GLBs in their exported image formats.

## Baked lighting boundary

The v3 home and forest table projections and the profile-specific `curved-cup-v3` contact AO are Blender 5.2/Cycles outputs reused by both current v5 scenes. The scene decals are 1024 × 768 with continuous area-light penumbrae; the contact AO is a 1024 × 1024 display overlay shaped against the v3 spherical-cap dish and cup foot. Forest v5 additionally binds a separate 512 × 512 baked context-occlusion decal; it is not one of the v3 Cycles outputs and is not a UV2 lightmap. None of these assets enters the LUT, crop transform, canonical renderer or production PNG.

The bake also emits `static-irradiance-lightmap.png` and proof images. The irradiance image is **staged only**: it is not referenced by the current scene release or runtime because there is not yet a frozen, matching UV2 receiver mesh. It must not be described as full-scene AO, direct/indirect illumination or a deployed UV2 lightmap. Exact Cycles settings and boundaries are in [`baked-lighting-v3.md`](baked-lighting-v3.md).

Runtime shadow maps, SSAO, SSR and volumetric scattering remain disabled. One non-shadowing hero light provides stable dynamic highlights; fixed subject shadow and cup contact are supplied by the display-only baked layers.

## Quality catalog and budgets

`src/scenes/release-manifest.ts` is the client-safe source of truth for current releases, hashes, tier composition and visible rendering parameters. `src/scenes/catalog.ts` derives runtime URLs and download totals from it. Current declared totals are:

| Current release | Low | Medium | High | Tier note |
| --- | ---: | ---: | ---: | --- |
| `warm-craftsman-home` v5 | 1,801,923 B | 2,198,273 B | 7,393,962 B | One inherited table plus 768 px JPG/1K JPG/4K WebP LDR tiers; Low/Medium use 1K HDR and High uses 2K HDR; no v4 room assets |
| `forest-camp-evening` v5 | 3,882,089 B | 6,641,334 B | 11,931,937 B | All tiers use the 1K HDR; LDR background and Pine Forest props advance together across 768 px JPG/1K JPG/4K WebP and 256/512/896 px tiers; no tent |
| `studio-neutral` v2 | 1,543,419 B | 1,543,419 B | 1,543,419 B | Diagnostic scene has one payload |

These remain below the 4/7/12 MB catalog ceilings. Home High upgrades its visible LDR to 4K WebP and HDR to 2K while retaining the 1K table. Forest High retains the 1K HDR and inherited v3 table/lantern models but fetches the 4K WebP and 896 px Pine Forest prop derivative. This is still an asset-byte budget, not proof of the GPU-memory ceiling on target hardware.

Scene preload includes the current tier's HDR, optional LDR background, GLBs, table projection, contact AO and optional context occlusion. After a successful switch, non-retained loader sources are eligible for explicit cache cleanup. Triangle count, draw calls, texture memory, switch latency and long-run disposal remain real-device release measurements rather than guarantees inferred from download bytes.

## Version and checksum integrity

The current home v5 checksum is `a69ed575767d84ee8105f8300bd4a3febb80931ad40bccb88147a70c04abeee1`; it and the forest v5 checksum bind every runtime asset, tier role, visible parameter and explicit renderer/geometry/environment/shadow pipeline version. The former v3/v4 checksums remain pinned, and studio v2 is unchanged. Confirmation records `sceneId`, `sceneVersion` and `sceneChecksum`; scene selection never enters the optical renderer or production-job inputs. Immutable browser replay is limited to studio v2 and home/forest v3 or newer; v1 and home/forest v2 remain audit identities without compatible complete runtime implementations, and checksum mismatches or those non-replayable identities fail explicitly instead of falling forward to a current release.

Runtime file hashes and totals are listed in [`scene-asset-manifest.md`](scene-asset-manifest.md). Proof images, per-bake JSON and the staged irradiance images are review/build evidence, not current runtime assets, and therefore are deliberately absent from the scene release checksum.

## Remaining production asset work

The current home v5 and forest v5 passes improve visual context without changing any optical or production input. They do **not** complete:

- KTX2 ETC1S/UASTC transcoding and a configured runtime KTX2 texture path;
- geometry-matched UV2 lightmaps for the complete static scene;
- Cycles-baked direct/indirect illumination and AO for walls, furniture, a true forest ground and props;
- a far 360° panorama and unclipped reflection HDR rendered from the same authored Blender scene;
- final concept-frame parity, panoramic seam checks or Low/Medium/High parity on target mobile GPUs;
- physical cup-and-plate calibration.

Until those gates pass, the result is a higher-detail digital preview, not a same-scene photoreal bake and not physical WYSIWYG.
