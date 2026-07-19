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

The current customer catalog ships home and forest **v4** compositions plus the unchanged neutral-studio **v2** diagnostic scene. The v4 releases reuse the immutable v3 CC0-derived, Meshopt-compressed GLBs, 1K/2K HDR files and Blender 5.2/Cycles display decals; home also reuses the immutable v2 oak PBR maps for an explicit room floor. Home now renders a metric room shell against a solid background and uses its HDR only through PMREM/environment lighting. Forest keeps its HDR as the visible distant background and PMREM source, while a matte near-ground receiver covers the immediate seam. Outdoor source chairs remain hidden and the compact tent stays off-axis. The selected concept frames under `docs/assets/scenes/concepts/` are visual references only and are never used as fake panoramic backgrounds.

This pass does not ship KTX2, geometry-matched UV2 full-scene lightmaps or a panorama/HDR rendered from the same authored Blender scene. The generated planar irradiance images are staged evidence only and are not sampled by the runtime. Low uses reduced 512/480 px model derivatives, Medium uses the 1K environment and 1K model payloads, and High upgrades the environment to the existing 2K source while retaining the 1K models. Declared Low/Medium/High downloads are 3.13/5.44/10.29 MB for home v4 and 3.38/5.28/10.91 MB for forest v4. See `docs/scene-assets.md` and `docs/realtime-preview.md`.

## Private calibration boundary

The public repository contains only a synthetic profile and generic engine. Historic Rhino/Grasshopper exports, real calibration maps, customer photographs, production files, research PDFs and local runtime data remain ignored. `docs/legacy-assets.md` records this boundary without publishing the assets.

## License

Apache-2.0. Bundled environment and most model/material assets are CC0 Poly Haven resources; the compact tent derivative is from Kenney's CC0 Survival Kit. See `docs/scene-assets.md` and `docs/scene-model-sources-v3.md`.
