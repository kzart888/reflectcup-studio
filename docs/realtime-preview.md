# Realtime preview

## Optical subject

The cup fragment shader reflects the camera-to-fragment ray about the displayed cup normal, intersects the profile's spherical-cap plate analytically, converts the hit to manufacturing `printUV`, and samples the same source texture, crop transform and inverse LUT used by the plate. A ray that misses the dish samples the active scene's PMREM environment. Off-design views must naturally distort or lose the hidden image; no camera-facing image is composited onto the cup.

`curved-cup-v3` uses the same audited radial profile and geometry checksum as immutable v2 for optical tracing and for the 128-segment lathed outer display mesh. Only the reversible-core LUT generator changed. Its visible solid construction is deliberately separate from optical participation:

- mirror outer wall with roughness `0.025`;
- 2 mm normal-offset ceramic inner wall and 2 mm ceramic base;
- a restrained 1 mm rounded ceramic rim, with no decorative torus colour;
- a 3.5 mm-section C handle on the cup's `-X` side, kept inside the dish rim;
- a 2 mm-thick ceramic dish body with a small rim transition and a dynamic print-only top layer.

Only the exact outer cup profile participates in reflection tracing. The inner wall, base, rim, handle and dish underside never enter the LUT. The fixed cup-on-dish contact layer is a display decal and is never written into canonical or production images.

## Published scenes

The customer selector exposes three current releases:

| Scene | Release | Selected direction | Shipped near/mid runtime | Far/background and reflection |
| --- | ---: | --- | --- | --- |
| `warm-craftsman-home` | v3 | Interior concept option 1 | Meshopt GLB wooden table, sofa and potted plant with embedded PBR inputs | Poly Haven Warm Restaurant 1K HDR for Low/Medium, 2K for High |
| `forest-camp-evening` | v3 | Outdoor concept option 2 | Meshopt GLB outdoor table set, lantern and compact tent; source chairs hidden in the product view | Poly Haven Dark Autumn Forest 1K HDR for Low/Medium, 2K for High |
| `studio-neutral` | v2 | Diagnostic reference | Project-authored neutral table/studio geometry | Solid background plus Poly Haven Studio Small 08 1K reflection HDR |

The v3 Poly Haven models retain embedded base-colour, tangent-space normal and packed AO/roughness/metallic inputs. The source glTF omits an explicit occlusion binding, so the runtime reuses the shared ARM texture's R channel as `aoMap` while G/B remain roughness/metallic inputs. The small Kenney tent is a stylised colour-only mid/far prop. `GLTFLoader` is configured with `MeshoptDecoder`; scene instances clone their owned geometries, materials and texture objects so a scene switch can dispose them without mutating the loader source.

Concept images under `docs/assets/scenes/concepts/` define art direction only. They are not presented as rotatable 360° backgrounds. Each active HDR is rotated consistently for the visible background and environment lighting. The custom cup shader samples a PMREM generated from the same HDR, so rough reflection uses Three.js's prefiltered cube-UV path rather than the raw equirectangular texture. Because the HDRs were not rendered from the same authored GLB scenes, exact prop/background/reflection correspondence is not yet claimed.

Low quality uses 512 px table/sofa/plant/camp-table derivatives and a 480 px lantern derivative with unchanged geometry. Medium uses the 1K environment and 1K model payloads. High retains the 1K models and upgrades the environment to 2K; no KTX2 payload is claimed.

## Lighting and shadow cost

Runtime shadow maps, SSAO, SSR, bloom and volumetric scattering are disabled. Each current scene uses:

- its oriented HDR environment;
- one stable ambient term;
- one non-shadowing directional hero light for dynamic cup/dish highlights;
- one scene-specific display-only table projection;
- one display-only cup contact layer.

For the home and forest v3 releases, `table-shadow.png` is rendered offline with Blender 5.2/Cycles from fixed area lights and the v3 cup, handle and saucer shadow proxy. The 1024 × 768 RGBA decals provide continuous soft penumbrae without realtime shadow-map stair steps. Their `curved-cup-v3` contact AO is a separate 1024 × 1024 Cycles-derived, profile-specific overlay clipped to the dish. The studio v2 scene intentionally retains its older analytic/Sharp decals for immutable replay.

The v3 bake also produces planar `static-irradiance-lightmap.png` evidence, but the runtime does not sample it: no frozen UV2 receiver mesh currently matches that image. Full static-scene direct/indirect lighting, geometry AO, fog and volumetric beams remain unshipped. Because all active shadow/AO layers live only in `SceneBackdrop` or the display dish, they cannot contaminate the authoritative print export.

See [`baked-lighting-v3.md`](baked-lighting-v3.md) for Cycles settings, hashes and the exact display/production boundary.

## Switching and persistence

The scene dropdown sits beside **Best view**. It first fetches the candidate scene's device baseline tier—Low for coarse-pointer/save-data devices and Medium for regular desktops—while the previous scene remains visible. On success the scene changes atomically and enters the session's optimistic autosave; on failure the old scene remains and an explicit error is shown. Confirmation records scene ID, version and content-bound release checksum. Current selection resolves home/forest v3 and studio v2; historical v1 and former home/forest v2 records remain pinned for audit. Scene selection never changes the crop, optical profile, LUT, canonical plate render or production bundle.

Source texture/LUT state is held outside `SceneBackdrop`, and profile-derived geometries are memoized independently of the scene descriptor. Scene-local cloned textures, materials, geometries and PMREM targets are disposed on unmount. The loader source cache retains at most the current and previous scene and clears non-shared sources from older scenes. Twenty-switch process/GPU stability still requires real-device release verification, so this is a bounded-cache design rather than a hardware memory guarantee.

## Camera and interaction

Orbit controls target the optical cup centre, disable pan, allow full azimuth, clamp polar angle to 15–75° and distance to 0.22–0.90 m, and expose a best-view reset. Desktop uses the editor/preview split; mobile exposes the same compact scene selector on **View reflection**.

Rendering uses `frameloop="demand"`, ACES Filmic tone mapping and adaptive DPR. The mobile cap defaults to 1.5 and desktop to 2; interaction can temporarily reduce DPR. A coarse-pointer device or `saveData` starts and stays at Low. A regular desktop starts at Medium and may enter High while idle, when only the environment resolution changes. Every tier preserves object placement and lighting.

A newly uploaded image uses a browser-local preview capped at 1024 px; a restored session receives a separate server-generated WebP sidecar capped at 2048 px. The full normalized source stays private for server rendering, and 4096 production images are never uploaded to the GPU.

Declared current scene downloads are 2.39/4.69/9.55 MB for home v3 and 3.38/5.28/10.91 MB for forest v3 across Low/Medium/High, with studio v2 at 1.54 MB. High upgrades the matching environment to 2K while Low uses 512/480 px model derivatives. These stay within the 4/7/12 MB catalog ceilings and are unit-tested against public files. Triangle count, draw calls, GPU texture memory, cold/cache switch time and active-frame P95 remain release measurements, not build-time guarantees. Targets remain: first interactive 3D under 3 seconds, cached switch under 1.5 seconds, cold switch under 3 seconds, desktop interaction P95 below 50 ms, middle-tier mobile below 100 ms, active mobile frame P95 at most 25 ms, and no continuous frames when static.

## Remaining asset pipeline

Blender 5.2 and the GLB/Meshopt conversion pipeline are now available and were used for the v3 model and fixed-subject shadow pass. The following work remains:

1. freeze the final static-scene meshes and build non-overlapping UV2 islands;
2. bake Cycles direct/indirect light and geometry AO into meshes that actually consume those UV2 lightmaps;
3. transcode colour/lightmaps to ETC1S KTX2 and normal/ORM to UASTC KTX2, then configure and validate `KTX2Loader`;
4. render a far 360° panorama and unclipped HDR from the same Blender scene and orientation;
5. validate seams, reflection/background correspondence, concept parity and Low/Medium/High visual parity on target mobile GPUs.

Until those gates pass, the current GLB/PBR scenes are a higher-detail, efficiently loaded digital preview—not a complete same-scene photoreal bake and not physical WYSIWYG.
