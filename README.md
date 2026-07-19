# ReflectCup Studio

ReflectCup Studio is an open-source web customizer for mirror-anamorphic cups. A customer uploads a photograph, positions it inside the real reflective coverage mask, and previews the distorted plate print and its physically changing reflection on a 3D cup.

> **Calibration status:** this repository ships a synthetic nominal profile for software validation. It has not yet been calibrated against a manufactured cup and plate and must not be represented as physical WYSIWYG.

## MVP capabilities

- Image upload, orientation/metadata normalization, pan and zoom crop
- Shared optical LUT for interactive preview and authoritative server rendering
- Curved-cup v3 mapping over geometry derived from audited measurements, with a reversible core and a crisp vector contour that excludes the disconnected top island
- WebGL2 cup reflection with a fixed optical centre, PMREM environment response and honest off-axis distortion
- Switchable warm Craftsman home, forest camp and neutral optical-studio previews; the choice autosaves and is frozen into confirmation
- Compact CC0-derived GLB near/mid scenery with embedded PBR inputs and Meshopt loading, plus fixed-light Cycles table projection/contact AO without runtime shadow maps
- Anonymous, resumable design sessions with optimistic autosave
- Administrator roles, versioned optical profiles and audited settings
- 1024 preview and 4096 test-production bundle
- An internal deterministic non-AI style lab for mosaic, halftone and dithering research
- Extension seams for additional cups, style, fill and commerce providers

AI hidden-image generation, customer-facing style controls, payments and production fulfilment are deliberately disabled in this version. Scene choice affects only the 3D proof and confirmation provenance; it never changes the LUT or production PNG.

On a fresh database, `pnpm db:seed` publishes immutable `nominal-v1`, historical `curved-cup-v2`, and current `curved-cup-v3` in order, making v3 the newest profile selected for new sessions. v3 uses the exact v2 physical geometry with a corrected, separately checksummed reversible-core LUT compiler; no v1/v2 bytes are rewritten. Existing sessions retain their original profile, version and checksum. New sessions default to the selected **warm Craftsman home option 1**; **forest camp option 2** and the neutral optical studio remain selectable.

## Local setup

Requirements: Node.js 24+, pnpm 10+, a WebGL2 browser, and PostgreSQL 16 (Docker Desktop is the easiest option).

1. Run `pnpm env:init` to create an ignored `.env.local` with a random session secret.
2. Run `pnpm local:up`.
3. Run `pnpm db:migrate` and `pnpm db:seed`.
4. Run `pnpm admin:create -- --email owner@example.com` and store the one-time password securely.
5. Optionally reproduce optical fixtures with `pnpm profile:generate -- --profile nominal-v1`, `pnpm profile:generate -- --profile curved-cup-v2`, `pnpm profile:generate -- --profile curved-cup-v3` and `pnpm calibration:generate`. `pnpm scene:bake` reproduces the historical analytic scene decals; the Blender 5.2/Cycles v3 command is recorded separately in `docs/baked-lighting-v3.md`.
6. Run `pnpm dev` and, in a second terminal, `pnpm worker:production`. Open the customer studio at `http://127.0.0.1:3000/studio/new` or the administrator login at `http://127.0.0.1:3000/admin/login`.

If Docker Desktop is unavailable on Windows, `pnpm local:postgres` starts the bundled/local PostgreSQL 16 workspace cluster on port 54329; then run the same migration and seed commands.

The web process only enqueues 4K production bundles. `pnpm worker:production` polls durable jobs and performs each export in an isolated Node worker thread; stopping the worker does not lose queued work.

Schedule `pnpm maintenance:expire` daily and `pnpm maintenance:storage` frequently. The latter retries private-file deletion tombstones, so a transient filesystem or object-storage failure cannot create an untracked orphan.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm worker:build`, `pnpm build`, `pnpm test:e2e` and `pnpm audit --prod` before release. See `docs/` for the optical coordinate contract, security model and acceptance tests.

## Scene asset status

The current customer catalog ships **warm-craftsman-home v5**, **forest-camp-evening v5** and the unchanged **studio-neutral v2** diagnostic scene. Home v5 reuses only the immutable v3 PBR wooden table, Blender 5.2/Cycles table projection and `curved-cup-v3` contact AO. It replaces the v4 room shell, sofa, plant, oak floor and Warm Restaurant environment with a content-addressed Poly Haven **Lythwood Lounge** HDR/LDR `GroundedSkybox` composition, eliminating the mismatched furniture and visibly small room box; home v4 remains immutable for old snapshots. Forest v5 retains the immutable v3 camp table, lantern, Cycles table projection and profile contact AO, then adds a curated Poly Haven **Pine Forest** derivative containing three PBR trunks, twelve ferns, four moss rocks and a fallen log. It neither binds nor displays the legacy Kenney tent, and it contains no opaque ground mesh, material or ground images. Forest v1-v4 keep their previous bytes and composition.

Forest lighting and visible scenery are intentionally separate. Poly Haven **Nature Reserve Forest** supplies one CC0 1K HDR used only for PMREM/reflection lighting, while 768 px and 1K JPGs plus a 4096 × 2048 WebP feed `GroundedSkybox`. The High WebP is a quality-82 derivative of Poly Haven's official API-listed 8192 × 4096 tonemapped source. `GroundedSkybox` visually projects that photographed ground; it does not create a ground mesh, collision surface or physical-lighting solution. Nature Reserve Forest and the Pine Forest complete scene are different authored sources, so exact prop/background/reflection correspondence is not claimed. A separate transparent 512 px baked context-occlusion decal anchors the props. The selected concept frames under `docs/assets/scenes/concepts/` remain visual references only.

This pass still does not ship KTX2, geometry-matched UV2 full-scene lightmaps or a panorama/HDR rendered from the same authored scene as all near/mid geometry. The v3 planar irradiance images remain staged evidence only. Home v5 advances from a 768 px JPG to a 1K JPG and 4K WebP visible background; Low/Medium use the 1K HDR and High uses the 2K HDR. Its Lythwood Lounge environment and inherited wooden table are not one authored scene. Forest prop GLBs use 256/512/896 px embedded PBR source-image tiers; the LDR background advances from 768 px JPG to 1K JPG to 4K WebP, while every tier retains the same 1K HDR PMREM input. Declared home v5 Low/Medium/High downloads are exactly **1,801,923 / 2,198,273 / 7,393,962 bytes**; forest v5 is **3,882,089 / 6,641,334 / 11,931,937 bytes**. Historical v1-v4 scene identities and assets remain immutable. See `docs/scene-assets.md` and `docs/realtime-preview.md`.

## Private calibration boundary

The public repository contains only a synthetic profile and generic engine. Historic Rhino/Grasshopper exports, real calibration maps, customer photographs, production files, research PDFs and local runtime data remain ignored. `docs/legacy-assets.md` records this boundary without publishing the assets.

## License

Apache-2.0. Bundled environment and most model/material assets are CC0 Poly Haven resources; the legacy v1-v4 compact tent derivative is from Kenney's CC0 Survival Kit and is not loaded by forest v5. See `docs/scene-assets.md` and `docs/scene-model-sources-v3.md`.
