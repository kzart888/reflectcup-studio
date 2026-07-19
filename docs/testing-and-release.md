# Testing and release

Required checks are lint, TypeScript, unit, PostgreSQL integration, production-worker build, production build, dependency audit and Playwright desktop/mobile flows. CI regenerates the immutable nominal profile and calibration fixtures, rejects a dirty diff, and builds the production container. The shipped v3 optical manifest and each v2 scene release are independently checksum-tested; optical tests pin every historical v2 byte, while scene tests hash every public asset, canonicalize the visual/render release contract, pin the legacy v1 identity checksums and pin the current version/checksum. CI regeneration of `curved-cup-v3` and `pnpm scene:bake` with a dirty-diff check is still release-hardening work.

Optical fixtures include direction arrows, numbered checkerboard, portrait, short text and high/low-frequency patterns. Immutable `nominal-v1` and current `curved-cup-v3` must keep CPU/GPU hit-mask IoU at least 0.995 outside a two-pixel silhouette band; UV error P95 must be at most 0.25 mm and maximum 0.75 mm. Both current release closed loops require SSIM ≥ 0.95 and checkerboard PSNR ≥ 32 dB. v3 additionally requires every inverse-LUT hit to resolve into its published core and an interior target → plate → target error no greater than one target sample. These are digital/mathematical gates, not evidence of a manufactured result.

`curved-cup-v2` is retained byte-for-byte as historical regression evidence. Its strict checker test is explicitly expected to fail (current corrected proof convention: PSNR 20.855906 dB, SSIM 0.971305) because its inverse LUT was rasterized before the customer core was selected. v3 fixes the ordering without changing physical geometry and passes at PSNR 34.479781 dB and SSIM 0.998766. A new release must never use an expected-failure gate.

## Automated now

- Unit optics: intersections, normals, reflection law, crop bounds, coordinate orientation, invalid roots, triangulation rejection, transparent unmapped pixels and closed-loop quality.
- Curved v2/v3 regression: the six audited millimetre rings, monotone PCHIP resampling at no more than 0.5 mm, 513 target sampling, schema/version, inverse-LUT millimetre error, shipped-asset checksums and byte-identical nominal-v1/v2 goldens. v3 must share v2's geometry checksum but not its generator checksum. The disconnected top ray-hit island must disappear from the single-component core mask and SVG contour while the diagnostic ray-hit mask retains it; every v3 inverse hit must belong to that core.
- Display geometry: the inner cup wall stays 2 mm from the optical wall, the C handle remains on `-X` and within the dish rim, and the dish underside adds 2 mm without moving the printable top.
- CPU/GPU parity: WebGL2 sampling of the shipped nominal, curved-v2 and curved-v3 LUT/masks is compared against the CPU contract and must retain mask IoU ≥ 0.995.
- PostgreSQL integration: anonymous creation/rate limiting, token access, optimistic revision conflict, upload MIME/size/decode rejection, maximum-2048 px authorized browser sidecars, 20 source replacements with original/sidecar cleanup, checksum-verified target-contour delivery, canonical render, immutable confirmation, administrator authentication, profile validation/publication and a real 4096 production ZIP whose file sizes and hashes are verified. Scene tests reject unpublished IDs, preserve revision conflicts, persist refresh state, and freeze scene ID/version/checksum. The production request is also asserted to remain queued until explicitly claimed.
- Worker isolation: protocol tests cover lease heartbeats, success, crash after claim and crash before claim. CI builds the standalone CommonJS worker entries and boots the polling process once against PostgreSQL to catch packaging/runtime-resolution regressions.
- Scene/catalog tests: server/client IDs, versions and checksums align; every declared public asset exists; actual low/medium/high bytes remain within 4/7/12 MB; generated table-shadow and cup-contact files exist.
- Browser flows: desktop/mobile upload and crop, autosave, recovery-fragment exchange and authenticated link rotation, confirmation readiness gates, RBAC visibility, deterministic +5°/+10° cup-ROI distortion, WebGL context loss/restoration, idle demand rendering, 20 browser image replacements with object-URL/GPU texture cleanup, scene-switch autosave without crop mutation, and a 320 px no-overflow check.
- Style lab: every registered mosaic/halftone/dither provider is deterministic, non-mutating and dimension/alpha preserving; recipes normalize parameters and reject sub-printable features; plate-constrained execution requires a supplied closed-loop evaluator. These tests do not enable the styles for customers.

## Hardware and release gates

The automated suite cannot prove browser-driver timing, thermal behaviour, photoreal scene correspondence or a manufactured optical result. Before public deployment:

1. record first-interactive, cold/cached scene-switch and active-frame P95 on the target host;
2. inspect all scenes at 360° azimuth, 15°/75° polar limits and min/max distance for seams, intersections and environment-reflection direction;
3. switch scenes at least 20 times and verify renderer geometry, texture and process memory return to a stable range;
4. confirm the fixed shadow/AO decals remain soft and never enter the production PNG;
5. verify page-hide/background suspension and context loss/restore;
6. run the checklist on iPhone Safari plus a middle-tier Android Chrome device.

The current procedural geometry + third-party HDR composition must not be accepted as the completed Blender/GLB/KTX2/360-panorama pipeline. Once that pipeline exists, add golden screenshots for each quality tier and require lighting/composition parity rather than merely asset availability.

Before any physical-WYSIWYG claim, print the numbered calibration jig and pass the real cup/plate 3–5% ROI error gate.
