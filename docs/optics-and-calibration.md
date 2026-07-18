# Optics and calibration

## Coordinate contract

- Runtime: right-handed, Y-up, metres.
- Plate-local origin: centre of the printable concave surface; +Y is up.
- The nominal design eye lies on +X. From that camera, screen-right corresponds to plate −Z.
- Manufacturing exports: millimetres with an explicit top-view `printUV` transform. No mesh UV is treated as manufacturing truth.

The nominal dish has radius `91.2462 mm`, sag `10 mm` and spherical radius `421.2935 mm`. The nominal cup is about `80 mm × 72 mm`, offset `−30 mm` from the plate centre. The design camera begins at `(0.60, 0.48, 0) m`, targeting `(-0.03, 0.043, 0) m` with 35° vertical FOV.

## Mapping

For each target pixel, cast a camera ray, intersect the radial cup surface, reflect about the surface normal, and intersect the spherical-cap plate. Valid adjacent target samples form triangles that are rasterized into a plate-to-target UV LUT. Flipped, discontinuous or excessively long triangles are rejected. The same LUT drives the editor, plate shader, cup shader and server export.

Unmapped texels have alpha zero. No dilation, brush expansion or inpainting is permitted in the identity/none pipeline.

## Physical calibration gate

The synthetic profile is only a software reference. A production profile requires measured geometry plus a printed numbered checkerboard photographed from a fixed jig. Direction/scale errors or keypoint error above roughly 3–5% of the reflection ROI must be corrected in profile geometry/camera parameters, not hidden in a shader.

The repeatable public fixtures are under `public/calibration/`. Follow `docs/physical-calibration-checklist.md` for print scale, registration, design-eye placement, fixed exposure, required 0°/±5°/±10° captures and filename conventions.
