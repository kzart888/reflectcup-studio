# ReflectCup Studio agent guide

ReflectCup Studio turns a customer image into a printable plate pattern and previews the image reflected by a metal cup. It is a digital optical MVP; do not claim physical WYSIWYG until a real cup-and-plate calibration passes.

## Canonical documentation

- Product behavior: `docs/product-spec.md`
- System boundaries: `docs/architecture.md`
- Coordinate and optical rules: `docs/optics-and-calibration.md`
- Renderer and mobile budgets: `docs/realtime-preview.md`
- Scene implementation, licensing and staged asset pipeline: `docs/scene-assets.md`
- Deterministic style research: `docs/non-ai-style-lab.md`
- Authentication and customer-photo handling: `docs/security-and-privacy.md`
- Future checkout and production files: `docs/commerce-and-production.md`
- Required verification: `docs/testing-and-release.md`
- Physical sample procedure: `docs/physical-calibration-checklist.md`
- Private legacy inventory: `docs/legacy-assets.md`

## Hard rules

- Runtime world coordinates are right-handed, Y-up and measured in metres. Manufacturing dimensions are millimetres and must cross an explicit conversion boundary.
- A published `OpticalProfile` is immutable. Existing sessions and snapshots retain its version and checksum.
- A fresh seed makes `curved-cup-v3` the newest published profile. `nominal-v1` and `curved-cup-v2` remain byte-immutable for old sessions and regression; v3 reuses v2 geometry but has a separately checksummed reversible-core mapping generator.
- Plate display, cup reflection and backend export must use the same `printUV`, LUT, crop transform and colour convention.
- Scene selection changes preview/provenance only, never the optical LUT, crop or production PNG.
- The browser may render interactively, but saved previews and production files are generated authoritatively on the server.
- Customer originals, tokens, databases, generated production files and real calibration profiles are private and never committed.
- `private/legacy-2025-poc` is local research evidence, not a runtime dependency.
- Concept frames are references, not 360° backgrounds. GLB/KTX2/lightmap assets must not be claimed until that staged pipeline exists.
- The non-AI style lab is internal; no AI, style or checkout control is shown before its production provider is enabled.

## Commands

`pnpm env:init`, `pnpm local:up` (or `pnpm local:postgres`), `pnpm db:migrate`, `pnpm db:seed`, `pnpm admin:create`, `pnpm profile:generate`, `pnpm scene:bake`, `pnpm dev`, `pnpm worker:production`, `pnpm maintenance:expire`, `pnpm maintenance:storage`

Before committing: `pnpm lint && pnpm typecheck && pnpm test && pnpm worker:build && pnpm build && pnpm test:e2e && pnpm audit --prod`.
