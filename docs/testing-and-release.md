# Testing and release

Required checks are lint, TypeScript, unit, PostgreSQL integration, production build, dependency audit and Playwright desktop/mobile flows. CI also regenerates the nominal profile and calibration fixtures, rejects a dirty diff, and builds the production container.

Optical fixtures include direction arrows, numbered checkerboard, portrait, short text and high/low-frequency patterns. CPU/GPU hit-mask IoU must be at least 0.995 outside a two-pixel silhouette band; UV error P95 must be at most 0.25 mm and maximum 0.75 mm. The nominal closed loop targets SSIM ≥ 0.95 and checkerboard PSNR ≥ 32 dB.

## Automated now

- Unit optics: intersections, normals, reflection law, crop bounds, coordinate orientation, invalid roots, triangulation rejection, transparent unmapped pixels and closed-loop quality.
- CPU/GPU parity: WebGL2 sampling of the shipped nominal LUT/mask is compared against the CPU contract and must retain mask IoU ≥ 0.995.
- PostgreSQL integration: anonymous creation/rate limiting, token access, optimistic revision conflict, upload MIME/size/decode rejection, 20 source replacements with storage cleanup, canonical render, immutable confirmation, administrator authentication, profile validation/publication and a real 4096 production ZIP whose file sizes and hashes are verified. The production request is also asserted to remain queued until explicitly claimed.
- Worker isolation: protocol tests cover lease heartbeats, success, crash after claim and crash before claim. CI builds the standalone CommonJS worker entries and boots the polling process once against PostgreSQL to catch packaging/runtime-resolution regressions.
- Browser flows: desktop/mobile upload and crop, autosave, recovery-fragment exchange and authenticated link rotation, confirmation readiness gates, RBAC visibility, deterministic +5°/+10° cup-ROI distortion, WebGL context loss/restoration, idle demand rendering, 20 browser image replacements with object-URL/GPU texture cleanup, and a 320 px no-overflow check.

## Hardware and release gates

The automated suite cannot prove browser-driver timing, thermal behaviour or a manufactured optical result. Before public deployment, record first-interactive and active-frame P95 on the target host, verify page-hide/background suspension, and run the checklist on iPhone Safari plus a middle-tier Android Chrome device. Before any physical-WYSIWYG claim, print the numbered calibration jig and pass the real cup/plate 3–5% ROI error gate.

Browser automation is not a substitute for real GPUs. Before physical-release claims, verify iPhone Safari, a middle-tier Android Chrome device and the printed calibration jig.
