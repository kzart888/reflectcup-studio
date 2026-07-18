# Non-AI style lab

The style lab is an internal, deterministic research path. It is not wired to the customer editor, canonical plate renderer or production export. That separation is deliberate: a visual filter is not production-ready until its optical round trip and physical print coupon both pass.

## Contract

`src/rendering/styles` operates on a complete RGBA image rather than one pixel at a time. A saved recipe contains the provider ID and version, normalized numeric parameters, a 32-bit seed, processing domain and physical dimensions. `serializeStyleRecipe` emits a stable representation suitable for snapshots and content hashes.

The execution domains have distinct meanings:

- `target`: style the desired reflection before the optical warp. Recognition is usually strongest; plate cells become geometrically distorted.
- `plate`: style the already-warped plate image. Plate cells remain regular; reflection fidelity usually falls.
- `plate-constrained`: compare deterministic plate-space candidates with a caller-supplied closed-loop optical loss. The generic executor and scoring seam are implemented, but no production optimizer is claimed yet.

Every provider preserves width, height and the source alpha channel. Fully transparent pixels are canonicalized to transparent black. The first-wave algorithms are deterministic and currently do not vary with `seed`; the seed is part of the recipe for later stochastic stippling and sampling providers.

## First-wave providers

| Provider | Parameters | Best early use | Main trade-off |
|---|---|---|---|
| Square mosaic | cell size in mm | Robust colour abstraction | Strong grid appearance |
| Hex mosaic | cell diameter in mm | More decorative colour tiling | Boundary cells are partial |
| Clustered-dot B/W halftone | pitch, min/max dot diameter in mm, gamma | Print-friendly tonal image | Loses colour |
| Bayer ordered dither | 4x4 or 8x8 matrix, sample pitch in mm | Fast, stable graphic pattern | Visible repeating matrix |
| Floyd–Steinberg serpentine | physical sample pitch | Strong local detail | Noisier plate texture |
| Stucki serpentine | physical sample pitch | Smoother tonal diffusion | Wider error footprint |

The lab enforces provisional manufacturing limits of **0.4 mm minimum feature** and **0.6 mm minimum pitch**. These are research defaults, not a factory capability claim. Replace them only after the UV printer, coating and viewing-distance coupon is measured.

Ordered dithering and clustered-dot patterns have mature non-AI precedents in [ImageMagick's quantization examples](https://usage.imagemagick.org/quantize/). Edge-preserving/cartoon rendering is available as a later control group through [OpenCV's NPR algorithms](https://docs.opencv.org/master/df/dac/group__photo__render.html), but those filters are less plate-specific than the first-wave set.

## Review artifacts

Run:

```text
pnpm exec tsx tools/style-lab/generate-review.ts
```

The command procedurally generates checker/direction, portrait, short-text and photo-like landscape fixtures, applies every review preset and writes:

- `docs/assets/style-lab/review-contact-sheet.png`
- `docs/assets/style-lab/inputs/`
- `docs/assets/style-lab/outputs/`
- `docs/assets/style-lab/manifest.json`

The manifest records every normalized recipe and SHA-256. Fixtures contain no customer data or third-party imagery.

## Recommended review

1. Reject any style that loses arrow direction, short text structure or the portrait's eyes/mouth at the design eye.
2. Compare target-space and plate-space results through the same immutable optical profile; do not judge only the flat plate.
3. For the strongest two styles, search a small deterministic physical-parameter grid with `plate-constrained` and rank closed-loop SSIM/edge retention.
4. Print a physical coupon containing minimum features and gaps before exposing parameters to customers.

## Documented second wave

- Edge-guided Delaunay low-poly rendering: useful for a designed social-media aesthetic, but it needs a reviewed triangulation dependency or an in-house implementation.
- Weighted Voronoi stippling: high illustration quality and naturally supports a seed, but iterative centroid relaxation is slower and belongs in an offline worker. The reference method is [Weighted Voronoi Stippling](https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/secord.2002b.pdf).

Neither second-wave method is registered as an available provider, so the application cannot accidentally advertise an unimplemented style.
