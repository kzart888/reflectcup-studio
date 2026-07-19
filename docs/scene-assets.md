# Scene assets and provenance

The customer preview exposes three immutable scene identities. The current customer catalog is intentionally mixed-version: `warm-craftsman-home` and `forest-camp-evening` are content-bound **v3** releases, while `studio-neutral` remains the published **v2** diagnostic release. Earlier v1 identities and the former home/forest v2 releases remain pinned for snapshot audit and regression; they are not overwritten by this pass.

The concept frames under `docs/assets/scenes/concepts/` were generated for this project on 2026-07-18 and are art-direction references only. They are ordinary perspective images, not PBR maps, lightmaps or rotatable backgrounds.

## Selected directions

- `warm-craftsman-home`: interior option 1, a warm modern Craftsman breakfast corner. Reference: `warm-craftsman-home-selected.png`.
- `forest-camp-evening`: outdoor option 2, a dusk forest-camp table. Reference: `forest-camp-evening-selected.png`.
- `studio-neutral`: retained as a neutral optical diagnostic scene rather than a merchandising direction.

## Current runtime composition

### `warm-craftsman-home` v3

- Near/mid geometry: Meshopt-compressed GLB derivatives of Poly Haven **Wooden Table 01**, **Sofa 02** and **Potted Plant 04**. The loader configures `GLTFLoader` with `MeshoptDecoder` and clones/disposes scene-owned resources.
- Materials: the Poly Haven derivatives embed base colour, tangent-space normal and packed ambient-occlusion/roughness/metallic inputs. Because the source glTF omits an explicit `occlusionTexture`, the runtime reuses the shared ARM texture's R channel as `aoMap` while retaining G/B for roughness/metallic. The table is scaled only on Y at runtime to correct its unusually low source height; its optical subject and manufacturing dimensions are unaffected.
- Quality variants: Low uses unchanged table, sofa and plant geometry with 512 px embedded PBR maps; Medium and High use the 1K model inputs. High alone upgrades the environment to 2K.
- Environment/background: Poly Haven **Warm Restaurant**, CC0, 1K Radiance HDR for Low/Medium and 2K for High. The same oriented tier HDR is used for the visible background and PMREM input, but it was not rendered from the authored GLB composition and therefore cannot guarantee exact background/reflection correspondence.
- Dynamic-subject projection: `v3/lighting/table-shadow.png`, rendered offline in Blender 5.2/Cycles from the fixed cup, handle and saucer proxy.

### `forest-camp-evening` v3

- Near/mid geometry: a Meshopt-compressed Poly Haven **Outdoor Table & Chair Set 01**, Poly Haven **Lantern 01**, and a compact Kenney **Survival Kit** tent derivative. Runtime hides the two source chairs so they do not intersect the optical subject.
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
| `warm-craftsman-home` v3 | 2,386,693 B | 4,693,789 B | 9,549,557 B | Low uses 512 px model derivatives; High upgrades the environment to 2K |
| `forest-camp-evening` v3 | 3,383,267 B | 5,275,199 B | 10,912,637 B | Low uses 512/480 px derivatives; High upgrades the environment to 2K |
| `studio-neutral` v2 | 1,543,419 B | 1,543,419 B | 1,543,419 B | Diagnostic scene has one payload |

These remain below the 4/7/12 MB catalog ceilings. High fetches only the 2K environment upgrade; the model payload remains identical to Medium. This is still an asset-byte budget, not proof of the GPU-memory ceiling on target hardware.

Scene preload includes the current tier's HDR, GLBs, table projection and contact AO. After a successful switch, non-retained loader sources are eligible for explicit cache cleanup. Triangle count, draw calls, texture memory, switch latency and long-run disposal remain real-device release measurements rather than guarantees inferred from download bytes.

## Version and checksum integrity

The current home and forest v3 checksums bind every runtime asset, tier role, visible parameter and explicit renderer/geometry/environment/shadow pipeline version. The studio v2 checksum remains unchanged. Confirmation records `sceneId`, `sceneVersion` and `sceneChecksum`; scene selection never enters the optical renderer or production-job inputs.

Runtime file hashes and totals are listed in [`scene-asset-manifest.md`](scene-asset-manifest.md). Proof images, per-bake JSON and the staged irradiance images are review/build evidence, not current runtime assets, and therefore are deliberately absent from the scene release checksum.

## Remaining production asset work

The v3 pass completes the game-ready GLB/PBR model replacement, Meshopt runtime loading, fixed-light Cycles subject projection and profile-specific contact AO. It does **not** complete:

- KTX2 ETC1S/UASTC transcoding and a configured runtime KTX2 texture path;
- geometry-matched UV2 lightmaps for the complete static scene;
- Cycles-baked direct/indirect illumination and AO for walls, furniture, forest floor and props;
- a far 360° panorama and unclipped reflection HDR rendered from the same authored Blender scene;
- final concept-frame parity, panoramic seam checks or Low/Medium/High parity on target mobile GPUs;
- physical cup-and-plate calibration.

Until those gates pass, the result is a higher-detail digital preview, not a same-scene photoreal bake and not physical WYSIWYG.
