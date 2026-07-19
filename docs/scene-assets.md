# Scene assets and provenance

The customer preview exposes three immutable scene identities. The current customer catalog is intentionally mixed-version: `warm-craftsman-home` and `forest-camp-evening` use code-and-content-bound **v4** compositions, while `studio-neutral` remains the published **v2** diagnostic release. Earlier v1 identities and the former home/forest v2/v3 releases remain pinned for snapshot audit and regression; they are not overwritten by this pass. The v4 releases reuse the byte-immutable v3 HDR/GLB/Cycles assets and selected v2 PBR textures, but publish new checksums because the customer-visible layout and background contract changed.

The concept frames under `docs/assets/scenes/concepts/` were generated for this project on 2026-07-18 and are art-direction references only. They are ordinary perspective images, not PBR maps, lightmaps or rotatable backgrounds.

## Selected directions

- `warm-craftsman-home`: interior option 1, a warm modern Craftsman breakfast corner. Reference: `warm-craftsman-home-selected.png`.
- `forest-camp-evening`: outdoor option 2, a dusk forest-camp table. Reference: `forest-camp-evening-selected.png`.
- `studio-neutral`: retained as a neutral optical diagnostic scene rather than a merchandising direction.

## Current runtime composition

### `warm-craftsman-home` v4

- Near/mid geometry: Meshopt-compressed GLB derivatives of Poly Haven **Wooden Table 01**, **Sofa 02** and **Potted Plant 04**. The long table axis now runs across the design camera rather than through it, so the design camera is outside the tabletop footprint. Sofa and plant use physical floor-relative placement and plausible source scale instead of floating 347/627 mm above the floor.
- Context shell: a lightweight 6.2 × 5.8 m room floor, four 2.85 m walls, window panels and Craftsman trim establish stable parallax. The floor reuses the immutable v2 oak colour/normal/roughness files.
- Materials: the Poly Haven derivatives embed base colour, tangent-space normal and packed ambient-occlusion/roughness/metallic inputs. Because the source glTF omits an explicit `occlusionTexture`, the runtime reuses the shared ARM texture's R channel as `aoMap` while retaining G/B for roughness/metallic. The table is scaled only on Y at runtime to correct its unusually low source height; its optical subject and manufacturing dimensions are unaffected.
- Quality variants: Low uses unchanged table, sofa and plant geometry with 512 px embedded PBR maps; Medium and High use the 1K model inputs. High alone upgrades the environment to 2K.
- Environment/background: Poly Haven **Warm Restaurant**, CC0, 1K Radiance HDR for Low/Medium and 2K for High, is retained only for PMREM/environment lighting. It is no longer drawn as the customer background because its near walls produced an irreconcilable small-room scale cue beside independently placed furniture; the explicit room shell is drawn against a solid warm background instead.
- Dynamic-subject projection: `v3/lighting/table-shadow.png`, rendered offline in Blender 5.2/Cycles from the fixed cup, handle and saucer proxy.

### `forest-camp-evening` v4

- Near/mid geometry: a Meshopt-compressed Poly Haven **Outdoor Table & Chair Set 01**, Poly Haven **Lantern 01**, and a compact Kenney **Survival Kit** tent derivative. Both source chairs remain hidden because their placement conflicts with the optical subject. The 2.24 m source tent is rendered off-axis at runtime scale `0.4` (about 0.90 × 0.90 m footprint and 0.79 m ridge height), and the lantern is approximately 191 mm high.
- Context geometry: only a matte 3.6 × 6 m earth receiver covers the table feet without occluding the distant photographic forest horizon. The rejected bark-map ground and primitive trunk/moss/boulder experiment is not present in the runtime. The tent stays small and far off-axis as a rotation-discoverable prop; no fake foliage geometry is claimed.
- Materials: the Poly Haven table and lantern embed base colour, tangent-space normal and packed ambient-occlusion/roughness/metallic inputs; runtime connects the shared ARM R channel to `aoMap`. The Kenney tent is an intentionally stylised colour-map-only far/mid prop and is not described as a near-field PBR asset.
- Quality variants: Low uses unchanged camp-table geometry with 512 px maps and lantern geometry with 480 px maps; Medium and High use the 1K model inputs. High alone upgrades the environment to 2K. The compact Kenney tent is shared.
- Environment/background: Poly Haven **Dark Autumn Forest**, CC0, 1K Radiance HDR for Low/Medium and 2K for High. It is consistently oriented for background and PMREM, but it is not a same-authored-scene panorama.
- Dynamic-subject projection: `v3/lighting/table-shadow.png`, rendered offline in Blender 5.2/Cycles with a fixed cool sky source and warm lantern source.

### `studio-neutral` v2

- Near geometry remains the small project-authored diagnostic table/studio mesh.
- Reflection environment is Poly Haven **Studio Small 08**, CC0, 1K Radiance HDR.
- Its v2 table-shadow decal and shared contact layer are the earlier deterministic analytic/Sharp outputs. They remain immutable for the v2 scene rather than being silently replaced with v3 assets.

## Model licensing and conversion

Poly Haven publishes its downloadable assets under [CC0](https://polyhaven.com/license/). Kenney's downloaded Survival Kit archive includes a CC0 `License.txt`. Raw source bundles and conversion scripts remain ignored under `private/scene-sources/v3/`; only normalised derivatives are public.

The public v3 GLBs are Y-up, metre-scale, self-contained files with embedded textures and `EXT_meshopt_compression`. Source-bundle hashes, exact public hashes, triangle counts, dimensions, material coverage and independent validation are recorded in [`scene-model-sources-v3.md`](scene-model-sources-v3.md). Fixed-rig material, clay and scale-lineup evidence is under `docs/assets/scenes/v3-model-review/`.

No KTX2 texture conversion, texture upscaling, generated normal map, displacement bake or geometry decimation is claimed. PBR maps are currently embedded in the GLBs in their exported image formats.

## Baked lighting boundary

The v3 home and forest table projections and the profile-specific `curved-cup-v3` contact AO are Blender 5.2/Cycles outputs. The scene decals are 1024 × 768 with continuous area-light penumbrae; the contact AO is a 1024 × 1024 display overlay shaped against the v3 spherical-cap dish and cup foot. None of these assets enters the LUT, crop transform, canonical renderer or production PNG.

The bake also emits `static-irradiance-lightmap.png` and proof images. The irradiance image is **staged only**: it is not referenced by the current scene release or runtime because there is not yet a frozen, matching UV2 receiver mesh. It must not be described as full-scene AO, direct/indirect illumination or a deployed UV2 lightmap. Exact Cycles settings and boundaries are in [`baked-lighting-v3.md`](baked-lighting-v3.md).

Runtime shadow maps, SSAO, SSR and volumetric scattering remain disabled. One non-shadowing hero light provides stable dynamic highlights; fixed subject shadow and cup contact are supplied by the display-only baked layers.

## Quality catalog and budgets

`src/scenes/release-manifest.ts` is the client-safe source of truth for current releases, hashes, tier composition and visible rendering parameters. `src/scenes/catalog.ts` derives runtime URLs and download totals from it. Current declared totals are:

| Current release | Low | Medium | High | Tier note |
| --- | ---: | ---: | ---: | --- |
| `warm-craftsman-home` v4 | 3,131,779 B | 5,438,875 B | 10,294,643 B | All tiers include the reusable oak room-floor PBR maps; High upgrades the environment to 2K |
| `forest-camp-evening` v4 | 3,383,267 B | 5,275,199 B | 10,912,637 B | The procedural matte receiver adds no download; High upgrades the environment to 2K |
| `studio-neutral` v2 | 1,543,419 B | 1,543,419 B | 1,543,419 B | Diagnostic scene has one payload |

These remain below the 4/7/12 MB catalog ceilings. High fetches only the 2K environment upgrade; the model payload remains identical to Medium. This is still an asset-byte budget, not proof of the GPU-memory ceiling on target hardware.

Scene preload includes the current tier's HDR, GLBs, table projection and contact AO. After a successful switch, non-retained loader sources are eligible for explicit cache cleanup. Triangle count, draw calls, texture memory, switch latency and long-run disposal remain real-device release measurements rather than guarantees inferred from download bytes.

## Version and checksum integrity

The current home and forest v4 checksums bind every runtime asset, tier role, visible parameter and explicit renderer/geometry/environment/shadow pipeline version. The former v3 checksums remain pinned. The studio v2 checksum remains unchanged. Confirmation records `sceneId`, `sceneVersion` and `sceneChecksum`; scene selection never enters the optical renderer or production-job inputs.

Runtime file hashes and totals are listed in [`scene-asset-manifest.md`](scene-asset-manifest.md). Proof images, per-bake JSON and the staged irradiance images are review/build evidence, not current runtime assets, and therefore are deliberately absent from the scene release checksum.

## Remaining production asset work

The v4 pass corrects the v3 physical layout and adds explicit near/mid context without changing any optical or production input. It does **not** complete:

- KTX2 ETC1S/UASTC transcoding and a configured runtime KTX2 texture path;
- geometry-matched UV2 lightmaps for the complete static scene;
- Cycles-baked direct/indirect illumination and AO for walls, furniture, forest floor and props;
- a far 360° panorama and unclipped reflection HDR rendered from the same authored Blender scene;
- final concept-frame parity, panoramic seam checks or Low/Medium/High parity on target mobile GPUs;
- physical cup-and-plate calibration.

Until those gates pass, the result is a higher-detail digital preview, not a same-scene photoreal bake and not physical WYSIWYG.
