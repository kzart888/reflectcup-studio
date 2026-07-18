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

Scenes use a server-owned published catalog. The currently published IDs are `studio-neutral`, `warm-craftsman-home` and `forest-camp-evening`, each at version 1. New sessions default to `warm-craftsman-home`; changing the database default does not rewrite existing session rows. Scene changes use the same optimistic revision lock as crop and camera updates. Confirmation freezes `sceneId`, `sceneVersion` and `sceneChecksum` into the immutable design snapshot, while canonical plate-render and production-job inputs remain scene-independent.

## Provider seams

- `ScenePlugin`: background, environment, lights, optional props and quality resources.
- `StyleProvider`: transforms mapped content; MVP is `identity`.
- `FillProvider`: supplies unmapped content; MVP is transparent `none`.
- `CommerceProvider`: creates checkout and handles provider events; disabled in MVP.
