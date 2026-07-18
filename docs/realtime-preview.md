# Realtime preview

## Optical subject

The cup fragment shader reflects the camera-to-fragment ray about the displayed cup normal, intersects the profile's spherical-cap plate analytically, converts the hit to manufacturing `printUV`, and samples the same source texture, crop transform and inverse LUT used by the plate. A ray that misses the dish samples the active scene's PMREM environment. Off-design views must naturally distort or lose the hidden image; no camera-facing image is composited onto the cup.

`curved-cup-v2` uses one audited radial profile for optical tracing and for the 128-segment lathed outer display mesh. Its visible solid construction is deliberately separate from optical participation:

- mirror outer wall with roughness `0.025`;
- 2 mm normal-offset ceramic inner wall and 2 mm ceramic base;
- a restrained 1 mm rounded ceramic rim, with no decorative torus colour;
- a 3.5 mm-section C handle on the cup's `-X` side, kept inside the dish rim;
- a 2 mm-thick ceramic dish body with a small rim transition and a dynamic print-only top layer.

Only the exact outer cup profile participates in reflection tracing. The inner wall, base, rim, handle and dish underside never enter the LUT. The fixed cup-on-dish contact layer is a display decal and is never written into canonical or production images.

## Published scenes

The customer selector exposes three versioned scenes:

| Scene | Selected direction | Shipped near/mid runtime | Far/background and reflection |
|---|---|---|---|
| `warm-craftsman-home` | Interior concept option 1 | Oak table, wall/window framing, built-in bench, cushions and cabinet | Poly Haven Warm Restaurant HDR |
| `forest-camp-evening` | Outdoor concept option 2 | Walnut table, ground, quality-scaled instanced trunks, tent and camp chair | Poly Haven Dark Autumn Forest HDR |
| `studio-neutral` | Diagnostic reference | Neutral table/studio geometry | Solid background plus Poly Haven Studio Small 08 reflection HDR |

The near/mid objects are native React Three Fiber geometry and materials. JPEG colour, OpenGL-normal and roughness maps are applied at medium/high quality where declared. Concept images under `docs/assets/scenes/concepts/` define art direction only; ordinary perspective frames are not presented as rotatable 360° backgrounds.

Each active HDR is rotated consistently for the visible background and environment lighting. The cup's custom mirror shader samples a PMREM generated from that same HDR, so rough reflection uses Three.js's prefiltered cube-UV path rather than the raw equirectangular texture. The current implementation always starts from the 1K HDR. Although 2K files are catalogued for a future high tier, idle 2K promotion is not wired yet.

## Lighting and shadow cost

Runtime shadow maps, SSAO, SSR, bloom and volumetric scattering are disabled. Each scene uses:

- the HDR environment;
- one stable ambient term;
- one non-shadowing directional hero light for dynamic cup/dish highlights;
- one scene-specific 1024 px table-shadow PNG;
- one shared 1024 px cup contact AO/shadow PNG.

`pnpm scene:bake` regenerates the PNG layers deterministically with TypeScript, Sharp and analytic soft ellipses. They provide continuous penumbrae without the old 1024-shadow-map stair steps, but they are artistic offline decals rather than Blender/Cycles geometry-aware lightmaps. Fog, light beams and fully baked indirect illumination are not shipped. Because these layers live only in `SceneBackdrop`/the display dish, they cannot contaminate the authoritative print export.

## Switching and persistence

The scene dropdown sits beside **Best view**. It first fetches the candidate scene's low-tier HDR, textures and shadow assets while the previous scene remains visible. On success the scene changes atomically and enters the session's optimistic autosave; on failure the old scene remains and an explicit error is shown. Confirmation records scene ID, version and contract checksum. Scene selection never changes the crop, optical profile, LUT, canonical plate render or production bundle.

Source texture/LUT state is held outside `SceneBackdrop`, and profile-derived geometries are memoized independently of the scene descriptor. Scene-local cloned textures and PMREM targets are disposed on unmount. Loader source caching and 20-switch memory stability still require browser/GPU release verification; the current implementation must not be described as a proven fixed-memory scene cache.

## Camera and interaction

Orbit controls target the optical cup centre, disable pan, allow full azimuth, clamp polar angle to 15–75° and distance to 0.22–0.90 m, and expose a best-view reset. Desktop uses the editor/preview split; mobile exposes the same compact scene selector on **View reflection**.

Rendering uses `frameloop="demand"`, ACES Filmic tone mapping and adaptive DPR. The mobile cap defaults to 1.5 and desktop to 2; interaction can temporarily regress DPR. A coarse-pointer device or `saveData` starts at low quality, a regular desktop starts at medium, and the performance monitor may decline to low. High is a catalogued resource tier but is not selected by the current runtime. Preview textures are 512/1024; 4096 production images are never uploaded to the GPU.

Declared scene downloads stay within low/medium/high ceilings of 4/7/12 MB, respectively. These byte budgets are unit-tested against the public files. Triangle count, draw calls, GPU texture memory, cold/cache switch time and active-frame P95 remain release measurements, not build-time guarantees. Targets are first interactive 3D under 3 seconds, cached switch under 1.5 seconds, cold switch under 3 seconds, desktop interaction P95 below 50 ms, middle-tier mobile below 100 ms, active mobile frame P95 at most 25 ms, and no continuous frames when static.

## Staged production asset pipeline

Blender and `toktx`/glTF compression tools were not available in the implementation environment. The present public assets are HDR/JPEG/PNG plus runtime-authored geometry. The following planned steps are not complete:

1. reproduce both selected concepts in Blender with the optical subject's real origin and camera range;
2. bake Cycles direct/indirect light, AO and soft area-light shadows into non-overlapping UV2 lightmaps;
3. export near/mid geometry as quantified GLB with Meshopt;
4. transcode colour/lightmaps to ETC1S KTX2 and normal/ORM to UASTC KTX2;
5. render the far 360° panorama and unclipped HDR from the same scene/orientation;
6. validate seams, reflection/background correspondence and low/medium/high visual parity on real mobile GPUs.

Until that pipeline is delivered, the current HDR background and procedural geometry may have small spatial or lighting mismatches and must be described as an efficient digital preview scene, not a fully baked photoreal environment.
