# Architecture

ReflectCup Studio is a Next.js modular monolith. Pages and route handlers adapt requests; domain services own workflows; repositories own PostgreSQL transactions; storage adapters own binary files; optics and rendering remain framework-independent.

## Runtime boundaries

- Browser: crop gestures, demand-rendered WebGL2 preview and autosave state.
- Next.js server: validation, authorization, session/profile workflows and authoritative render orchestration.
- PostgreSQL: business records, immutable versions, token hashes and audit events.
- Private storage: normalized sources, previews and production artifacts. The local adapter is filesystem-backed; a cloud adapter will use S3/OSS.
- Render executor: preview renders remain authoritative in the web runtime, while 4K bundles are enqueue-only there. A separately started `production-worker` process polls PostgreSQL and runs one export at a time inside a Node worker thread, so pixel generation, PNG encoding and ZIP compression cannot block Next.js request handling.

Production jobs use PostgreSQL as the durable queue. The child atomically changes `queued` to `running` and writes a unique lease token into the job input; every heartbeat, progress update, completion and failure transition is conditional on that token. Competing worker processes may safely observe the same candidate because only one claim succeeds, and a recovered stale generation cannot overwrite its replacement. The parent thread heartbeats the lease while synchronous rendering runs, startup recovery removes the old token and requeues stale `running` rows, and a child crash marks only its claimed generation failed. An unclaimed job remains queued. The web and worker can use the same container image: the default command starts Next.js, while a worker deployment overrides it with `node dist/workers/production-worker.cjs`.

Large binaries are never stored in JSONB or base64. Session updates carry an expected revision and atomically increment it. Published profile/settings versions are referenced by ID, version and checksum rather than copied from mutable defaults.

## Profile selection

New sessions bind to the newest published optical profile at creation time. A fresh seed installs immutable `nominal-v1`, immutable historical `curved-cup-v2`, and current `curved-cup-v3` in that order, so v3 is selected on a fresh database. v3 keeps the v2 geometry checksum but has a new generator checksum and corrected reversible-core LUT. This is not a mutable global pointer: an existing session continues to resolve its stored profile ID even after another version is published. The nominal and v2 fixtures remain byte-for-byte regression evidence.

## Scene runtime

Scenes use a server-owned published catalog. The current customer catalog selects `warm-craftsman-home` v4, `forest-camp-evening` v4 and the unchanged `studio-neutral` v2 diagnostic release. Issued v1 identities and the former home/forest v2/v3 releases remain pinned for old snapshots and regression. The selected customer directions are warm Craftsman interior option 1 and forest camp option 2. New sessions default to `warm-craftsman-home`; changing the database default does not rewrite existing session rows.

The browser keeps optical content and scenery separated:

- `ReflectiveCupPreview` owns the cup, dish, source texture, crop, LUT, analytic dish intersection and profile-derived geometry.
- `SceneBackdrop` owns the table and near/mid scenery. Current home/forest releases load CC0-derived, Meshopt-compressed GLBs with `GLTFLoader` and `MeshoptDecoder`; the diagnostic studio retains its small project-authored mesh. Home v4 adds an explicit metre-scale room shell and PBR oak floor. Forest v4 adds only a matte near-ground receiver; it deliberately has no procedural trunks, moss or boulders. Runtime composition hides both outdoor source chairs. The Kenney tent remains an off-axis prop at runtime scale `0.4`. Low uses dedicated 512 px table, sofa, plant and camp-table derivatives plus a 480 px lantern derivative, all with unchanged geometry.
- The scene catalog owns environment orientation, light values, quality resources, download estimates and offline shadow placement.
- Equirectangular HDR always supplies the PMREM environment for the metal cup and PBR scenery. It is visible as the distant background only where the release contract requests it: forest v4 shows the unblurred forest HDR, while home v4 renders its explicit room shell against a solid colour and keeps Warm Restaurant PMREM-only. A single non-shadowing hero light supplies a stable highlight.

Before switching, the UI fetches the target scene's low-tier assets. The old scene remains visible until that preload succeeds; choosing again cancels the obsolete request, while failure leaves the old scene selected and exposes a retry action. The successful choice enters the same 650 ms optimistic autosave as crop and camera. Confirmation freezes `sceneId`, `sceneVersion` and `sceneChecksum` into the immutable design snapshot, while canonical plate renders and production-job inputs remain scene-independent.

Each published scene is defined once in the client-safe `src/scenes/release-manifest.ts`. Its immutable SHA-256 covers the scene identity/version, every runtime asset URL/byte size/content SHA-256, quality-tier composition, customer-visible lighting/background/shadow parameters, and explicit geometry/renderer/environment/shadow pipeline versions. Server publication and the browser descriptor both consume that shared manifest; neither computes checksums by reading files at runtime. Unit tests independently hash the public files and canonical release payload, and pin every current version/checksum as well as legacy v1, v2 and v3 identities. The v4 composition releases intentionally reuse immutable home/forest `/v3/` HDR, GLB and Cycles paths; home additionally binds the exact `/v2/textures/` oak files, and the cup contact layer remains profile-addressed under `/profiles/curved-cup-v3/`. Studio remains on `/v2/`. Reusing bytes does not reuse a release identity: the changed layout/background contract publishes new v4 checksums rather than rewriting v3.

### Current and staged asset boundaries

The v4 home/forest compositions reuse v3 Meshopt-compressed GLBs with embedded base-colour, tangent-space normal and packed AO/roughness/metallic inputs. Because the source files omit an explicit glTF occlusion texture, the runtime reconnects the shared ARM texture's R channel as `aoMap`; roughness and metallic continue to use G/B. Low/Medium use the 1K Radiance HDR and High uses the content-bound 2K version. Home uses the HDR only through PMREM and renders an explicit room shell; forest shows the HDR behind a matte near-ground receiver. Both v4 releases reuse the v3 Blender 5.2/Cycles fixed-subject table projections and profile-specific `curved-cup-v3` contact AO. The studio v2 release retains its project-authored geometry and earlier analytic decals. There is no runtime shadow map, SSAO, SSR or volumetric pass. Concept images are committed only as design references and are not rendered as panoramic scenery.

Blender and GLB/Meshopt conversion are complete for the inherited v3 asset payload, and v4 supplies the corrected runtime composition. KTX2 is **not** complete: current material images remain embedded in the GLBs, and no `KTX2Loader` path is active. The generated planar irradiance images are staged build evidence and are not referenced by the runtime because no frozen UV2 receiver meshes consume them. Full geometry-matched Cycles direct/indirect/AO lightmaps and a matched same-scene 360° panorama/HDR export also remain staged. Current v4 Low uses 512/480 px model derivatives, Medium uses the 1K environment and 1K model inputs, and High upgrades to the licensed 2K environment while keeping the 1K models. Home includes the reused v2 oak maps in every tier. See `docs/scene-assets.md` for provenance and `docs/realtime-preview.md` for runtime budgets.

## Provider seams

- Scene descriptors and `SceneBackdrop`: published identity, background, PMREM input, fixed lights, GLB role mapping, baked display layers and quality resources. The older generic `ScenePlugin` contract remains an extension seam, not the active loader implementation.
- `StyleProvider`: customer sessions remain `identity`. A separate full-image provider contract and deterministic mosaic/halftone/dither implementations exist in `src/rendering/styles` for the internal style lab only.
- `FillProvider`: supplies unmapped content; MVP is transparent `none`.
- `CommerceProvider`: creates checkout and handles provider events; disabled in MVP.
