# Optics and calibration

## Coordinate contract

- Runtime: right-handed, Y-up, metres.
- Plate-local origin: centre of the printable concave surface; +Y is up.
- The nominal design eye lies on +X. From that camera, screen-right corresponds to plate −Z.
- Manufacturing exports: millimetres with an explicit top-view `printUV` transform. No mesh UV is treated as manufacturing truth.

The dish has radius `91.2462 mm`, sag `10 mm` and spherical radius `421.2935 mm`. The cup axis is offset `−30 mm` from the plate centre. The design camera begins at `(0.60, 0.48, 0) m`, targeting `(-0.03, 0.043, 0) m` with 35° vertical FOV.

## Public digital profiles

- `nominal-v1` is the original straight-sided software fixture. Its published JSON, LUT and masks are immutable and remain available so existing sessions can be reproduced.
- `curved-cup-v2` is derived from the owned Rhino OBJ, but the private OBJ is not a runtime or repository dependency. Six audited `(height, radius)` rings in millimetres are interpolated with a monotonic PCHIP curve and resampled at no more than `0.5 mm` intervals. That same dense `radialProfile` is the source of truth for CPU ray intersections and runtime display geometry.
- v2 uses `513 × 513` target samples and a `512 × 512` inverse LUT. It is still a synthetic digital profile, not a physically calibrated production profile.

Generate either fixture explicitly:

```text
pnpm profile:generate -- --profile nominal-v1
pnpm profile:generate -- --profile curved-cup-v2
```

Never overwrite a published profile with changed geometry. A measurement, camera, mapping or generator change requires a new profile version and checksum; old sessions retain the old document and LUT.

## Mapping

For each target pixel, cast a camera ray, intersect the radial cup surface, reflect about the surface normal, and intersect the spherical-cap plate. Valid adjacent target samples form triangles that are rasterized into a plate-to-target UV LUT. Flipped, discontinuous or excessively long triangles are rejected. The same LUT drives the editor, plate shader, cup shader and server export.

Unmapped texels have alpha zero. No dilation, brush expansion or inpainting is permitted in the identity/none pipeline.

### Target-region assets

Ray hits are not automatically a safe customer composition region. A second, disconnected sheet can hit the plate while having the opposite plate-space Jacobian orientation; it is rejected by the inverse LUT and must not be advertised in the editor.

The v2 compiler therefore emits three distinct artifacts:

- `target-ray-hit-mask.png`: diagnostic-only mask of every ray that reaches the plate.
- `target-core-mask.png`: customer mask built only from length-checked, non-degenerate triangles with the dominant orientation, reduced to the largest 8-connected component.
- `target-core-contour.json`: normalized target-UV paths with an explicit `evenodd` fill rule, outer/hole roles, schema version and content checksum. The customer UI should draw this contour as a non-scaling SVG stroke; it must not enlarge the pixels of a low-resolution PNG to create the border.

`target-valid-mask.png` is a compatibility alias: for `curved-cup-v2` it is byte-identical to `target-core-mask.png`. In the immutable `nominal-v1` fixture it retains its historical raw ray-hit meaning. `buildTargetRayHitMask` is for optical diagnostics, while `buildTargetCoreMask` is the authoritative customer-region operation.

## Physical calibration gate

The synthetic profile is only a software reference. A production profile requires measured geometry plus a printed numbered checkerboard photographed from a fixed jig. Direction/scale errors or keypoint error above roughly 3–5% of the reflection ROI must be corrected in profile geometry/camera parameters, not hidden in a shader.

The repeatable public fixtures are under `public/calibration/`. Follow `docs/physical-calibration-checklist.md` for print scale, registration, design-eye placement, fixed exposure, required 0°/±5°/±10° captures and filename conventions.
