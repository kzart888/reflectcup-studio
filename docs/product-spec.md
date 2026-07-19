# Product specification

## Customer outcome

A customer can create a design without an account, upload a personal image, choose the portion visible in the validated reflective core contour, inspect a physically honest 3D preview, choose a preview environment, leave and securely resume, then confirm an immutable design.

Desktop uses a crop/preview split layout. Mobile uses two task-focused views: **Adjust image** and **View reflection**. The primary action is **Confirm design**. The compact scene selector sits beside **Best view**. Cup-profile selection remains hidden while the product offers only one current customer cup; the nominal profile stays available solely to reproduce old sessions and tests.

## MVP scope

Implemented:

- immutable nominal-v1 and curved-cup-v2 regression profiles plus the current curved-cup-v3 digital profile; a fresh seed selects v3 for new sessions;
- a curved mirror cup with ceramic inner wall/base/handle and a solid ceramic dish display model;
- vector reflection-area highlighting based on the v3 reversible core region, with the false top island removed;
- selected warm Craftsman interior option 1 (the new-session default), forest camp option 2, and a neutral optical studio;
- identity mapped style, transparent unmapped fill, design sessions, administrator access and a test production bundle;
- an internal non-AI style comparison lab that is not connected to customer saves or exports.

Not implemented: AI disguise/styling, customer-facing deterministic styles, automatic background fill, Shopify deposit/full payment, fulfilment and customer accounts. The target Blender/Cycles + GLB/Meshopt + KTX2 + matched 360° panorama scene pipeline is also not complete; the current scenes use procedural geometry and CC0 HDR/JPEG/PNG assets. Disabled capabilities are not displayed.

Scene selection is presentation-only. It autosaves with the same revision lock as crop/camera and its ID/version/checksum are frozen into confirmation, but it cannot alter optical mapping, canonical render or the production PNG.

## Session lifecycle

`draft → confirmed → checkout_pending → paid → production_ready → completed`, with `expired` as a terminal cleanup state. The MVP exercises `draft` and `confirmed`; later states are reserved contracts.

Drafts expire after 30 days without activity. Confirmed sessions without an order expire after 90 days. Future order originals are removed 30 days after completion while the non-sensitive manifest and checksums remain.
