# Product specification

## Customer outcome

A customer can create a design without an account, upload a personal image, choose the portion visible in the reflective coverage mask, inspect a physically honest 3D preview, leave and securely resume, then confirm an immutable design.

Desktop uses a crop/preview split layout. Mobile uses two task-focused views: **Adjust image** and **View reflection**. The primary action is **Confirm design**. With one published profile, cup selection is hidden.

## MVP scope

Implemented: one nominal cup, one neutral scene, identity mapped style, transparent unmapped fill, design sessions, administrator access and a test production bundle.

Not implemented: AI disguise/styling, automatic background fill, Shopify deposit/full payment, fulfilment, customer accounts and additional scene downloads. Disabled capabilities are not displayed.

## Session lifecycle

`draft → confirmed → checkout_pending → paid → production_ready → completed`, with `expired` as a terminal cleanup state. The MVP exercises `draft` and `confirmed`; later states are reserved contracts.

Drafts expire after 30 days without activity. Confirmed sessions without an order expire after 90 days. Future order originals are removed 30 days after completion while the non-sensitive manifest and checksums remain.
