# Baked lighting v3

This document records the v3 lighting outputs generated for the two selected merchandising scenes and `curved-cup-v3`. The scene `table-shadow.png` files and profile `cup-contact-ao.png` are reused byte-for-byte by current home v5 and forest v5 as display-only runtime assets. Home v5 changes its environment/background and removes the v4 room furniture without modifying this fixed-subject table projection. Forest v5 also has a separately versioned context-occlusion layer described below; it is not retroactively part of this v3 Cycles bake. The planar irradiance files and proof images remain staged/review outputs. None alters the optical profile, LUT, crop, source image or authoritative production PNG.

## Rebuild command

The checked-in files were rendered with Blender 5.2.0 LTS, Cycles CPU, 32 samples, adaptive sampling and denoising. The fixed seed is `260719`.

```powershell
& 'D:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --factory-startup `
  --python tools/scenes/bake-lighting-v3.py -- `
  --samples 32 --resolution-scale 1 --device CPU
```

The script writes runtime decals only to the new `/v3/lighting/` and `/profiles/curved-cup-v3/lighting/` paths; staged irradiance, proofs and bake metadata go to `docs/assets/scenes/v3-lighting/`. It does not read or overwrite a v1/v2 scene asset. `--device OPTIX` is available for iteration, but CPU is the release default so the render backend is explicit. Exact byte identity is only expected with the recorded Blender version, device class and settings.

## Scene projection layers

Each scene has three generated files:

- `table-shadow.png`: transparent, non-premultiplied RGBA decal for the dynamic cup, handle and saucer proxy.
- `static-irradiance-lightmap.png`: opaque normalized fixed-light irradiance for a 0.48 × 0.36 m tabletop receiver. This is staged input for a matching UV2 table mesh, not a generic overlay for unrelated geometry.
- `table-shadow-proof.png`: review-only composite showing the final decal outside a neutral saucer/cup silhouette.

The shadow source uses the measured 182.4924 mm plate diameter, the v3 cup axis at X = -30 mm, the 31.952057 mm foot radius, a 71.911155 mm tapered body and a compact handle proxy. The receiver and occluders are rendered to linear 32-bit EXR internally; the exported PNG alpha is then tone-shaped without a realtime shadow map. This preserves a continuous area-light penumbra and avoids the centimetre-scale stair stepping seen in the old 1024 shadow map.

### Warm Craftsman home

- 510 W warm area light at `[-0.34, -0.42, 0.86]` m, diameter 0.46 m.
- Shadow: 1024 × 768, 237,919 non-zero pixels (30.2530%), full-image mean alpha 24.3246/255, non-zero mean 80.4039/255, maximum 85/255.
- Linear receiver irradiance before normalization: 12.607703–31.943537.
- Shadow SHA-256: `49bcdf89b3f1851993dd11c5c5e89d69bcc8d09c4c0613b31ea3173fac13ba6f`.
- [Proof image](assets/scenes/v3-lighting/warm-craftsman-home/table-shadow-proof.png)
- [Per-file manifest](assets/scenes/v3-lighting/warm-craftsman-home/bake.json)

### Forest camp evening

- 245 W cool sky area light at `[-0.42, 0.46, 0.92]` m, diameter 0.78 m.
- 175 W warm lantern area light at `[0.38, -0.45, 0.34]` m, diameter 0.16 m.
- Shadow: 1024 × 768, 347,494 non-zero pixels (44.1861%), full-image mean alpha 30.2449/255, non-zero mean 68.4489/255, maximum 97/255.
- Linear receiver irradiance before normalization: 9.246483–18.389656.
- Shadow SHA-256: `f02241c4efbd8f8be78aae082f1070c5170bcf072e6756ae7f5d8f627b00902e`.
- [Proof image](assets/scenes/v3-lighting/forest-camp-evening/table-shadow-proof.png)
- [Per-file manifest](assets/scenes/v3-lighting/forest-camp-evening/bake.json)

The alpha coverage includes pixels hidden under the physical saucer at runtime. The proof composites the saucer after the decal so the review image shows the visible outer projection rather than overstating hidden shadow energy.

### Forest v5 context occlusion

`public/scenes/forest-camp-evening/v5/lighting/forest-context-occlusion.png` is a separate transparent 512 × 512 RGBA baked placement layer drawn over a 9 × 9 m presentation footprint beneath the Pine Forest props. The v5 release draws it at opacity `0.48`. Its size is 5,224 bytes and SHA-256 is `7bb82f102a9615220a204a70c4036d27b553f847f021e49fc9d908b63bc747bb`. It does not restore the removed opaque Pine Forest ground mesh/material/images.

This decal is not the v3 `static-irradiance-lightmap.png`, not a geometry-matched UV2 bake and not evidence of full-scene direct/indirect illumination. It enters only the preview backdrop and is checksum-bound by forest v5.

## Profile-specific cup contact AO

`public/profiles/curved-cup-v3/lighting/cup-contact-ao.png` is generated against the v3 spherical-cap dish and a conforming cup foot. A Cycles ambient-occlusion shader uses a 12 mm ray distance. The post-bake physical envelope retains the measured AO signal, peaks within 1–3 mm of the cup foot, and reaches zero by 12 mm. The alpha is clipped to the saucer and centered at the profile cup axis; it is not shared with `nominal-v1` or `curved-cup-v2`.

- Texture: 1024 × 1024 RGBA.
- Non-zero pixels: 91,711 (8.7462%).
- Full-image mean alpha: 5.0228/255; non-zero mean: 57.4281/255.
- P50/P95/maximum non-zero alpha: 35/133/133.
- SHA-256: `38c8f6a435ec49dd22a25cc130a9ccbd12f153148b433120f5c0086547e8ebd4`.
- [Proof image](assets/scenes/v3-lighting/curved-cup-v3/cup-contact-ao-proof.png)
- [Per-file manifest](assets/scenes/v3-lighting/curved-cup-v3/bake.json)

## Runtime boundary and remaining bake

The runtime draws each scene projection immediately above the tabletop receiver with depth writes disabled and draws cup AO only as a display overlay on the dish top. Neither texture is referenced by the canonical plate renderer, production worker, style lab, LUT generator or manufacturing package.

The planar irradiance maps establish a reproducible fixed-light baseline, but they are not claimed as final static-scene AO and are not consumed by the current GLBs. A future scene version needs geometry with matching non-overlapping UV2 islands before walls, furniture, a true forest ground and props can consume a geometry-matched Cycles AO/direct/indirect bake. The Lythwood Lounge and Nature Reserve Forest `GroundedSkybox` projections supply only visual background/ground and are not such geometry or lighting. Publishing a later bake requires a new immutable scene version and checksum; it must not silently replace current home v5 or forest v5, nor any pinned v1-v4 history.
