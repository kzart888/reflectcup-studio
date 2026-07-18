# ReflectCup Studio

ReflectCup Studio is an open-source web customizer for mirror-anamorphic cups. A customer uploads a photograph, positions it inside the real reflective coverage mask, and previews the distorted plate print and its physically changing reflection on a 3D cup.

> **Calibration status:** this repository ships a synthetic nominal profile for software validation. It has not yet been calibrated against a manufactured cup and plate and must not be represented as physical WYSIWYG.

## MVP capabilities

- Image upload, orientation/metadata normalization, pan and zoom crop
- Shared optical LUT for interactive preview and authoritative server rendering
- WebGL2 cup reflection with a fixed optical centre and honest off-axis distortion
- Anonymous, resumable design sessions with optimistic autosave
- Administrator roles, versioned optical profiles and audited settings
- 1024 preview and 4096 test-production bundle
- Extension seams for additional cups, scenes, style, fill and commerce providers

AI hidden-image generation, payments and production fulfilment are deliberately disabled in this version.

## Local setup

Requirements: Node.js 24+, pnpm 10+, a WebGL2 browser, and PostgreSQL 16 (Docker Desktop is the easiest option).

1. Run `pnpm env:init` to create an ignored `.env.local` with a random session secret.
2. Run `pnpm local:up`.
3. Run `pnpm db:migrate` and `pnpm db:seed`.
4. Run `pnpm admin:create -- --email owner@example.com` and store the one-time password securely.
5. Run `pnpm profile:generate` and `pnpm calibration:generate`.
6. Run `pnpm dev` and, in a second terminal, `pnpm worker:production`. Open the customer studio at `http://127.0.0.1:3000/studio/new` or the administrator login at `http://127.0.0.1:3000/admin/login`.

If Docker Desktop is unavailable on Windows, `pnpm local:postgres` starts the bundled/local PostgreSQL 16 workspace cluster on port 54329; then run the same migration and seed commands.

The web process only enqueues 4K production bundles. `pnpm worker:production` polls durable jobs and performs each export in an isolated Node worker thread; stopping the worker does not lose queued work.

Schedule `pnpm maintenance:expire` daily and `pnpm maintenance:storage` frequently. The latter retries private-file deletion tombstones, so a transient filesystem or object-storage failure cannot create an untracked orphan.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm worker:build`, `pnpm build`, `pnpm test:e2e` and `pnpm audit --prod` before release. See `docs/` for the optical coordinate contract, security model and acceptance tests.

## Private calibration boundary

The public repository contains only a synthetic profile and generic engine. Historic Rhino/Grasshopper exports, real calibration maps, customer photographs, production files, research PDFs and local runtime data remain ignored. `docs/legacy-assets.md` records this boundary without publishing the assets.

## License

Apache-2.0. The bundled Studio Small 08 environment is a CC0 asset by Poly Haven; see its adjacent provenance file.
