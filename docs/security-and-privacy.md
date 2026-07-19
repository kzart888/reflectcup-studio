# Security and privacy

Customer photos are private. Uploads are size- and pixel-limited, decoded rather than trusted by extension, converted to sRGB, re-encoded without EXIF/GPS and served only through an authorized session. The upload transaction also creates a maximum-2048 px WebP sidecar for the editor and WebGL; the full normalized source is reserved for authoritative renders. Storage paths are never public identifiers.

Anonymous edit access uses 256-bit random secrets. Only SHA-256 hashes are stored. A resume secret is transported in a URL fragment, exchanged once for a path-scoped HttpOnly cookie, rotated and removed from browser history. Session IDs alone grant no access.

Administrator passwords use Argon2id and must contain at least 12 characters. There is no public registration or committed default password. Roles are owner, operator and viewer. Mutations enforce origin checks, server-side permission checks and database-backed login throttling; sensitive actions create audit records.

Anonymous preview creation is limited to 30 successful sessions per hashed client address in a rolling hour. The limiter and its creation audit are committed in the same database transaction, and raw addresses are never stored. By default the application does not trust `X-Forwarded-For` or `X-Real-IP`; requests share a conservative fallback bucket. Set `TRUST_PROXY_HEADERS=true` only when the application is behind a controlled reverse proxy that strips client-supplied forwarding headers and writes its own trusted values. Keep it `false` for direct exposure.

Replacing a draft image atomically detaches prior source and preview records. Every corresponding binary deletion—including the browser-preview sidecar—writes a tombstone in the same database transaction; a storage worker claims tombstones with a lease and retries failures with backoff. Confirmed snapshot assets remain immutable and are never handled by this cleanup path.

Run `pnpm maintenance:expire` from a daily scheduler. It locks and expires drafts after 30 days of inactivity and confirmed/no-commerce designs after 90 days, revokes access, removes sources/previews/test bundles and retains only non-image audit checksums. Run `pnpm maintenance:storage` frequently (for example every minute) to drain deletion tombstones and remove completed records after 30 days. Active draft access rolls the draft deadline and its unconsumed access-token deadline forward together.

Never commit `.env`, databases, storage, customer files, generated bundles, token values, real profiles or private legacy assets.
