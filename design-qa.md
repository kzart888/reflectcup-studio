# Design QA

## Scope

This review covers the scene, cup display model, reflection contour and scene-selection upgrade for the digital MVP. The selected visual references are:

- `docs/assets/scenes/concepts/warm-craftsman-home-selected.png` (indoor option 1)
- `docs/assets/scenes/concepts/forest-camp-evening-selected.png` (outdoor option 2)

The current implementation uses procedural runtime geometry, versioned CC0 HDR/PBR assets and offline-generated analytic shadow/AO decals. It does not yet contain the planned Blender/Cycles UV2 lightmaps, GLB/Meshopt scene packages, KTX2 textures, or same-scene panoramic/HDR bake.

## Evidence reviewed

- In-app browser review confirmed all three scenes render, the cup handle is visible, scene switching works and the cup reflection changes physically with viewpoint.
- Automated browser checks passed desktop and 320/390 px mobile flows, scene persistence, context loss recovery, demand rendering and repeated source-image replacement.
- Unit and integration checks cover versioned scene checksums, curved cup/display contracts, target-core contour delivery, preview-sidecar authorization and optimistic autosave ordering.

Automated screenshots are functional evidence only; they are not treated as visual approval against the selected concept frames.

## Open findings

### P1 — Selected concept fidelity is not production complete

The efficient procedural scene pass establishes layout, lighting direction, materials and performance behavior, but it does not yet reproduce the selected concept frames at a production-quality level. Closing this finding requires the staged Blender/Cycles asset pass, matched panorama/HDR bake, lightmaps, compressed GLB/KTX2 packages and a same-viewport visual comparison.

### P2 — Final same-state visual comparison remains outstanding

A fresh in-app-browser comparison of the post-fix contour, indoor scene and outdoor scene against the references was not captured after the browser controller reset. This must be repeated before visual sign-off.

### P2 — Hardware memory gate remains outstanding

The runtime now promotes eligible idle desktops to the 2K tier, preserves composition across tiers and bounds the loader source cache to two scenes. The final 20-switch process/GPU memory validation still needs to run on representative desktop and mobile hardware before production sign-off.

## Release interpretation

The branch is suitable as a versioned digital-MVP scene and optics upgrade. It must not be described as the final photoreal Blender asset release or as physical WYSIWYG.

final result: blocked
