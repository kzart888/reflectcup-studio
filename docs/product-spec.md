# Product specification

## Customer outcome

A customer can create a design without an account, upload a personal image, choose the portion visible in the validated reflective core contour, inspect a physically honest 3D preview, choose a preview environment, leave and securely resume, then confirm an immutable design.

Desktop uses a crop/preview split layout. Mobile uses two task-focused views: **Adjust image** and **View reflection**. The primary action is **Confirm design**. The compact scene selector sits beside **Best view**. Cup-profile selection remains hidden while the product offers only one current customer cup; the nominal profile stays available solely to reproduce old sessions and tests.

## MVP scope

Implemented:

- immutable nominal-v1 and curved-cup-v2 regression profiles plus the current curved-cup-v3 digital profile; a fresh seed selects v3 for new sessions;
- a curved mirror cup with ceramic inner wall/base/handle and a solid ceramic dish display model;
- vector reflection-area highlighting based on the v3 reversible core region, with the false top island removed;
- selected warm Craftsman interior option 1 as the current home v5 composition and forest camp option 2 as the current forest v5 composition (with the home still the new-session default), plus the neutral optical studio v2;
- identity mapped style, transparent unmapped fill, design sessions, administrator access and a test production bundle;
- an internal non-AI style comparison lab that is not connected to customer saves or exports.

Not implemented: AI disguise/styling, customer-facing deterministic styles, automatic background fill, Shopify deposit/full payment, fulfilment and customer accounts. The staged AI direction is specified in `ai-hidden-image-roadmap.md`; no AI control is shown until its provider, optical ranking and privacy gates are enabled. Home v5 retains only the immutable v3 PBR wooden table and Blender/Cycles fixed-subject shadow/contact layers, removing the v4 sofa, plant, room shell and oak floor. Poly Haven's Lythwood Lounge supplies its tonemapped LDR `GroundedSkybox` and matching-orientation 1K/2K HDR PMREM inputs; the inherited table and environment were not authored as one scene. Forest v5 retains its immutable v3 table, lantern and fixed-subject layers, adds compact Meshopt/PBR trunk, fern, moss-rock and fallen-log derivatives curated from Poly Haven's Pine Forest complete scene, and uses a separate Nature Reserve Forest tonemapped LDR `GroundedSkybox` while its 1K HDR feeds PMREM. Forest v5 does not bind the legacy tent or an opaque context ground; `GroundedSkybox` supplies only a visual ground projection, not geometry, collision or physical lighting. The complete 2.75 GB Pine Forest source is not a runtime asset, and the Pine Forest props were not authored with the Nature Reserve Forest HDRI. KTX2 delivery, geometry-matched UV2 full-scene direct/indirect/AO lighting, and same-authored-scene 360° panorama/HDR compositions remain unshipped. Disabled capabilities are not displayed.

Scene selection is presentation-only. It autosaves with the same revision lock as crop/camera and its ID/version/checksum are frozen into confirmation, but it cannot alter optical mapping, canonical render or the production PNG.

## Session lifecycle

`draft → confirmed → checkout_pending → paid → production_ready → completed`, with `expired` as a terminal cleanup state. The MVP exercises `draft` and `confirmed`; later states are reserved contracts.

Drafts expire after 30 days without activity. Confirmed sessions without an order expire after 90 days. Future order originals are removed 30 days after completion while the non-sensitive manifest and checksums remain.
