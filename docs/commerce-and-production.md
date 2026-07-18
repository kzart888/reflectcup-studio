# Commerce and production

Commerce is provider-driven and disabled in the MVP. Confirmation creates an immutable design snapshot; it does not pretend that checkout occurred. A future Shopify provider will validate the $1 entitlement server-side, create the final checkout idempotently and process signed webhooks through an outbox/reconciliation boundary.

The test production bundle is append-only and contains:

- `plate-print.png`: 4096 transparent top-view print image
- `plate-mask.png`: printable mapped-region mask
- `proof.png`: nominal-eye closed-loop preview
- `design.json`: crop, profile, renderer, scene and software versions
- `manifest.json`: physical dimensions, sRGB/straight-alpha convention, top-left `printUV +X,-Z` registration, cup-axis offset, profile/version/checksum, source commit, timestamps, per-file byte sizes, MIME types and SHA-256 values

The normalized customer source is not included by default. A production bundle is generated from a frozen snapshot, never from a later mutable session.

## Production worker

The administrator request only creates a durable `queued` row and returns `202`; it never starts 4K work in the web event loop. Run `pnpm worker:production` beside the web application. The worker compiles two small Node entrypoints, polls PostgreSQL, atomically claims a job, and delegates the CPU-heavy renderer/PNG/ZIP path to an isolated `worker_thread`.

The parent thread sends a lease heartbeat every 30 seconds while the rendering thread is busy. A process restart requeues leases stale for five minutes; a reported rendering error or a claimed child crash is persisted as `failed`. Job completion and `production_artifacts` persistence remain transactional, and a second claimant returns `not_claimed` without changing the winner. Deploy exactly one worker for the local MVP; additional workers are safe but increase peak memory and storage pressure.

Worker controls are environment variables: `PRODUCTION_WORKER_POLL_MS` (default 1000), `PRODUCTION_WORKER_HEARTBEAT_MS` (default 30000), and `PRODUCTION_WORKER_TIMEOUT_MS` (default 900000). Production deployments must mount the same private storage backend for web and worker, or replace the filesystem adapter with shared S3/OSS storage.
