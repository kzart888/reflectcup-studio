# Optics and calibration

## Coordinate contract

- Runtime: right-handed, Y-up, metres.
- Plate-local origin: centre of the printable concave surface; +Y is up.
- The nominal design eye lies on +X. From that camera, screen-right corresponds to plate −Z.
- Manufacturing exports: millimetres with an explicit top-view `printUV` transform. No mesh UV is treated as manufacturing truth.

The dish has radius `91.2462 mm`, sag `10 mm` and spherical radius `421.2935 mm`. The cup axis is offset `−30 mm` from the plate centre. The design camera begins at `(0.60, 0.48, 0) m`, targeting `(-0.03, 0.043, 0) m` with 35° vertical FOV.

## Public digital profiles

- `nominal-v1` is the original straight-sided software fixture. Its published JSON, LUT and masks are immutable and remain available so existing sessions can be reproduced.
- `curved-cup-v2` is the immutable first release derived from the owned Rhino OBJ. The private OBJ is not a runtime or repository dependency. Six audited `(height, radius)` rings in millimetres are interpolated with a monotonic PCHIP curve and resampled at no more than `0.5 mm` intervals. That same dense `radialProfile` is the source of truth for CPU ray intersections and runtime display geometry.
- `curved-cup-v3` reuses the exact v2 physical geometry, eye and dish checksums, but publishes a new inverse-map/core contract. Its two-pass compiler prevents the disconnected ray-hit sheet from claiming plate texels and rejects target samples that do not round-trip within one target-sample spacing. v2 stays byte-identical for existing sessions.
- v2 and v3 use `513 × 513` target samples and a `512 × 512` inverse LUT. Both remain synthetic digital profiles, not physically calibrated production profiles.

`pnpm db:seed` publishes nominal-v1, curved-cup-v2, and curved-cup-v3 in version order. Because session creation selects the newest published profile, a fresh database starts new sessions on `curved-cup-v3`. This ordering does not migrate existing rows: each session stores the profile ID and each confirmation freezes its version, document checksum, geometry checksum, LUT checksum and generator version.

Generate either fixture explicitly:

```text
pnpm profile:generate -- --profile nominal-v1
pnpm profile:generate -- --profile curved-cup-v2
pnpm profile:generate -- --profile curved-cup-v3
```

The command defaults to `nominal-v1` when `--profile` is omitted, so release regeneration should always name the intended fixture explicitly.

Never overwrite a published profile with changed geometry. A measurement, camera, mapping or generator change requires a new profile version and checksum; old sessions retain the old document and LUT.

## Mapping

For each target pixel, cast a camera ray, intersect the radial cup surface, reflect about the surface normal, and intersect the spherical-cap plate. Valid adjacent target samples form triangles that are rasterized into a plate-to-target UV LUT. Flipped, discontinuous or excessively long triangles are rejected. The same LUT drives the editor, plate shader, cup shader and server export.

Unmapped texels have alpha zero. No dilation, brush expansion or inpainting is permitted in the identity/none pipeline.

### Curved v2/v3 display solid

The v2/v3 outer display mesh is lathed directly from their shared profile curve. The ceramic inner wall is offset inward by 2 mm along the sampled curve normal, the base and dish underside add 2 mm of display thickness, and the C handle is a separate `-X`-side mesh constrained inside the plate rim. These additions improve visual plausibility but do not change optical tracing: only the exact outer radial profile and spherical-cap dish top participate in the reflection mapping. Replacing just the display mesh while retaining a straight-sided LUT is forbidden.

### Target-region assets

Ray hits are not automatically a safe customer composition region. A second, disconnected sheet can hit the plate while having the opposite plate-space Jacobian orientation; it is rejected by the inverse LUT and must not be advertised in the editor.

The curved-profile compiler therefore emits three distinct artifacts:

- `target-ray-hit-mask.png`: diagnostic-only mask of every ray that reaches the plate.
- `target-core-mask.png`: customer mask built only from length-checked, non-degenerate triangles with the dominant orientation, reduced to the largest 8-connected component.
- `target-core-contour.json`: normalized target-UV paths with an explicit `evenodd` fill rule, outer/hole roles, schema version and content checksum. The customer UI should draw this contour as a non-scaling SVG stroke; it must not enlarge the pixels of a low-resolution PNG to create the border.

`target-valid-mask.png` is a compatibility alias: for both curved releases it is byte-identical to `target-core-mask.png`. In the immutable `nominal-v1` fixture it retains its historical raw ray-hit meaning. `buildTargetRayHitMask` is for optical diagnostics, while `buildTargetCoreMask` is the authoritative customer-region operation.

v3 compiles the dominant largest-connected candidate first, rasterizes a candidate inverse LUT, and keeps only target samples whose target → plate → target error is at most one 513-grid sample. It then rasterizes the published inverse LUT again using only triangles whose three vertices are in that reversible core. This final pass makes every valid inverse-LUT hit belong to the published core. Tests exclude the two-pixel silhouette band when measuring the finite-grid round trip; the v3 interior maximum is below one target sample. v1/v2 retain their historical single-pass bytes.

The session API exposes the contour as `.../optical-profile/target-contour`. Published profiles install the target PNG and contour JSON as checksum-bound private assets during seeding/publication, so customer requests stream verified bytes rather than repeating the 513×513 ray trace. A bounded checksum cache remains only as a compatibility fallback for older administrator-created profiles. The editor converts normalized contour points into a closed SVG path, uses `evenodd` to dim only the outside, and draws an unblurred two-layer non-scaling stroke. Raster `targetMask` remains a compatibility fallback; it is not enlarged to create the customer-facing edge. In v3 the top ray-hit island is absent from the core mask, contour and every valid inverse-LUT hit. The v2 editor mask also hides the island, but its already-published inverse LUT preserves the historical single-pass ambiguity and is regression-only.

Canonical plate pixels represent physical texel cells centred at `(x + 0.5) / N`. Optical proof sampling converts them back with `uv × N − 0.5`; target/source images intentionally retain endpoint-centred sampling. CPU, browser and proof code must not mix these two lattice conventions.

## Physical calibration gate

The synthetic profiles are only software references. The curved profile improves geometry fidelity but does not make the browser physically calibrated. A production profile requires measured geometry plus a printed numbered checkerboard photographed from a fixed jig. Direction/scale errors or keypoint error above roughly 3–5% of the reflection ROI must be corrected in profile geometry/camera parameters, not hidden in a shader or scene lighting.

The repeatable public fixtures are under `public/calibration/`. Follow `docs/physical-calibration-checklist.md` for print scale, registration, design-eye placement, fixed exposure, required 0°/±5°/±10° captures and filename conventions.
