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
| `warm-craftsman-home` | v5 | Interior concept option 1 | Inherited v3 Meshopt/PBR wooden table only; no v4 sofa, plant, room shell or oak floor | Poly Haven Lythwood Lounge 1K/2K HDR feeds PMREM; separate 768 px JPG, 1K JPG and 4K WebP derivatives feed `GroundedSkybox` |
| `forest-camp-evening` | v5 | Outdoor concept option 2 | Inherited v3 outdoor table set with both chairs hidden and lantern, plus tiered Meshopt/PBR Pine Forest trunks, ferns, moss rocks and fallen-log props; no tent or opaque ground GLB | Poly Haven Nature Reserve Forest 1K HDR feeds PMREM in every tier; separate 768 px JPG, 1K JPG and 4K WebP derivatives feed `GroundedSkybox` |
| `studio-neutral` | v2 | Diagnostic reference | Project-authored neutral table/studio geometry | Solid background plus Poly Haven Studio Small 08 1K reflection HDR |

Home v5's wooden table and the inherited forest v3 table/lantern models use immutable Poly Haven payloads with embedded base-colour, tangent-space normal and packed AO/roughness/metallic inputs. Those source glTF files omit an explicit occlusion binding, so runtime reuses the shared ARM texture's R channel as `aoMap` while G/B remain roughness/metallic inputs. Home v5 does not load the v4 sofa, plant, procedural room shell or reused oak-floor maps. Forest v5 adds three independently versioned Pine Forest prop derivatives with embedded base-colour, normal and roughness images; fern alpha is restored as a cutout at runtime. Each has 20 nodes, four materials and twelve embedded images, with no opaque ground node/material/image set. The Kenney tent remains available only to immutable forest v1-v4 and is not bound or rendered by v5. `GLTFLoader` is configured with `MeshoptDecoder`; scene instances clone their owned geometries, materials and texture objects so a scene switch can dispose them without mutating the loader source.

Concept images under `docs/assets/scenes/concepts/` define art direction only. They are not presented as rotatable 360° backgrounds. Home v5's Lythwood Lounge 1K/2K Radiance HDR files build the prefiltered cube-UV PMREM, while content-addressed tonemapped LDR derivatives of the same environment are ground-projected for the customer-visible background and photographed ground. Its `GroundedSkybox` uses capture height 1.207282 m, radius 7.1 m, ground level -0.727282 m and yaw -2.6 rad. Forest v5 similarly separates response from display using Nature Reserve Forest. `GroundedSkybox` is a visual projection, not ground geometry, a collision surface or a physical-lighting bake. The home wooden table was not authored with Lythwood Lounge, and the Pine Forest prop GLBs were not authored with Nature Reserve Forest. Exact near-geometry/background/reflection correspondence is therefore not claimed.

Home Low uses the inherited 512 px table derivative, 768 × 384 JPG and 1K HDR; Medium uses the 1K table, 1024 × 512 JPG and 1K HDR; High retains that table and advances to a 4096 × 2048 WebP plus 2K HDR. The three LDR files derive from Poly Haven's official 8192 × 4096 Lythwood Lounge tonemapped JPG. Forest keeps the inherited 512 px camp-table and 480 px lantern derivatives at Low and their 1K versions at Medium/High. Its new prop image tiers are 256/512/896 px, and the visible LDR background tiers are 768 px JPG, 1K JPG and 4096 × 2048 WebP; all three use the same 1K HDR PMREM. The forest prop GLBs contain **5,111 / 8,785 / 17,420 unique mesh triangles** and render **10,049 / 15,111 / 35,316 visible instance triangles** at Low/Medium/High. No KTX2 payload is claimed.

## Lighting and shadow cost

Runtime shadow maps, SSAO, SSR, bloom and volumetric scattering are disabled. Each current scene uses:

- its oriented HDR environment for PMREM/reflection response;
- one stable ambient term;
- one non-shadowing directional hero light for dynamic cup/dish highlights;
- one scene-specific display-only table projection;
- one display-only cup contact layer.

Home v5 and forest v5 reuse byte-identical v3 `table-shadow.png` files rendered offline with Blender 5.2/Cycles from fixed area lights and the `curved-cup-v3` cup, handle and saucer shadow proxy. The 1024 × 768 RGBA decals provide continuous soft penumbrae without realtime shadow-map stair steps. The separate 1024 × 1024 Cycles-derived `curved-cup-v3` contact AO is profile-specific and clipped to the dish. Forest v5 adds a transparent 512 × 512, display-only baked context-occlusion decal beneath its prop composition; this does not reintroduce an opaque ground mesh. The studio v2 scene intentionally retains its older analytic/Sharp decals for immutable replay.

The v3 bake also produces planar `static-irradiance-lightmap.png` evidence, but the runtime does not sample it: no frozen UV2 receiver mesh currently matches that image. Forest's context decal is only a broad placement/occlusion layer, not a UV2 full-scene direct/indirect/AO bake. Full static-scene direct/indirect lighting, geometry-matched AO, fog and volumetric beams remain unshipped. Because all active shadow/AO layers live only in `SceneBackdrop` or the display dish, they cannot contaminate the authoritative print export.

See [`baked-lighting-v3.md`](baked-lighting-v3.md) for Cycles settings, hashes and the exact display/production boundary.

## Switching and persistence

The scene dropdown sits beside **Best view**. It first fetches the candidate scene's device baseline tier—Low for coarse-pointer/save-data devices and Medium for regular desktops—while the previous scene remains visible. On success the scene changes atomically and enters the session's optimistic autosave; on failure the old scene remains and an explicit error is shown. Confirmation records scene ID, version and content-bound release checksum. Current selection resolves home v5, forest v5 and studio v2; historical v1 identities and former home/forest v2/v3/v4 releases remain pinned for audit. Scene selection never changes the crop, optical profile, LUT, canonical plate render or production bundle.

Source texture/LUT state is held outside `SceneBackdrop`, and profile-derived geometries are memoized independently of the scene descriptor. Scene-local cloned textures, materials, geometries and PMREM targets are disposed on unmount. The loader source cache retains at most the current and previous scene and clears non-shared sources from older scenes. Twenty-switch process/GPU stability still requires real-device release verification, so this is a bounded-cache design rather than a hardware memory guarantee.

## Camera and interaction

Orbit controls target the optical cup centre, disable pan, allow full azimuth, clamp polar angle to 15–75° and distance to 0.22–0.90 m, and expose a best-view reset. Desktop uses the editor/preview split; mobile exposes the same compact scene selector on **View reflection**.

Rendering uses `frameloop="demand"`, ACES Filmic tone mapping and adaptive DPR. The mobile cap defaults to 1.5 and desktop to 2; interaction can temporarily reduce DPR. A coarse-pointer device or `saveData` starts and stays at Low. A regular desktop starts at Medium and may enter High while idle. Home High upgrades both its visible background to 4K WebP and its HDR to 2K; forest High upgrades to the 4K WebP background and High prop GLB while retaining the same HDR. Every tier preserves object placement and lighting.

A newly uploaded image uses a browser-local preview capped at 1024 px; a restored session receives a separate server-generated WebP sidecar capped at 2048 px. The full normalized source stays private for server rendering, and 4096 production images are never uploaded to the GPU.

Declared current scene downloads are exactly **1,801,923 / 2,198,273 / 7,393,962 bytes** for home v5 and **3,882,089 / 6,641,334 / 11,931,937 bytes** for forest v5 across Low/Medium/High, with studio v2 at 1,543,419 bytes. Home totals include its tier HDR/LDR, one inherited table model, table projection and profile contact AO exactly once; no v4 sofa, plant, room-shell or oak-floor payload is counted. Forest totals include its HDR, tier LDR, tier prop GLB, inherited table/lantern models, table projection, profile contact AO and context occlusion exactly once; no tent payload is counted. These stay within the 4/7/12 MB catalog ceilings and are unit-tested against public files. Download bytes and triangle counts are not proof of draw-call cost, GPU texture memory, cold/cache switch time or active-frame P95; those remain release measurements. Targets remain: first interactive 3D under 3 seconds, cached switch under 1.5 seconds, cold switch under 3 seconds, desktop interaction P95 below 50 ms, middle-tier mobile below 100 ms, active mobile frame P95 at most 25 ms, and no continuous frames when static.

## Remaining asset pipeline

Blender 5.2 and the GLB/Meshopt conversion pipeline produced the immutable v3 model/fixed-subject shadow payload and the new curated forest v5 prop derivatives. The following work remains:

1. freeze the final static-scene meshes and build non-overlapping UV2 islands;
2. bake Cycles direct/indirect light and geometry AO into meshes that actually consume those UV2 lightmaps;
3. transcode colour/lightmaps to ETC1S KTX2 and normal/ORM to UASTC KTX2, then configure and validate `KTX2Loader`;
4. render a far 360° panorama and unclipped HDR from the same Blender scene and orientation;
5. validate seams, reflection/background correspondence, concept parity and Low/Medium/High visual parity on target mobile GPUs.

Until those gates pass, the current GLB/PBR scenes are a higher-detail, efficiently loaded digital preview—not a complete same-scene photoreal bake and not physical WYSIWYG.
