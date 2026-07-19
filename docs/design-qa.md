# Design QA: scene v3 and deterministic style lab

Date: 2026-07-19
Scope: `warm-craftsman-home` v3, `forest-camp-evening` v3, unchanged `studio-neutral` v2, and the internal non-AI style review.

This is a digital-preview QA record. It does not certify physical cup-and-plate WYSIWYG.

## Art-direction references

- Home: [`assets/scenes/concepts/warm-craftsman-home-selected.png`](assets/scenes/concepts/warm-craftsman-home-selected.png), selected interior option 1.
- Forest: [`assets/scenes/concepts/forest-camp-evening-selected.png`](assets/scenes/concepts/forest-camp-evening-selected.png), selected outdoor option 2.

These frames guide warmth, material density and composition. They are not 360° panoramas and are not reused as runtime backgrounds. Exact concept parity is therefore not a current acceptance claim.

## Evidence and current result

| Check | Evidence | Result |
| --- | --- | --- |
| Source licensing and byte identity | [`scene-model-sources-v3.md`](scene-model-sources-v3.md), ignored raw-source manifests | Pass for the listed Poly Haven/Kenney CC0 derivatives |
| GLB structure and runtime compatibility | Independent binary validator plus Blender 5.2 re-import; Meshopt metadata, embedded images, material slots and no private paths checked | Pass for the six 1K/source derivatives and five Low derivatives |
| PBR material response | Fixed-rig material renders in [`assets/scenes/v3-model-review/`](assets/scenes/v3-model-review/) | Pass for Poly Haven table/sofa/plant/table-set/lantern; runtime connects the shared ARM R channel to `aoMap`; Kenney tent is intentionally colour-only |
| Scale and silhouette | Fixed-rig clay and scale-lineup renders in the same review folder | Pass with documented runtime correction for the unusually low source home table |
| Fixed subject projection | Cycles proofs and numeric alpha statistics in [`baked-lighting-v3.md`](baked-lighting-v3.md) | Pass for continuous soft penumbra; no realtime shadow-map stair steps are used |
| Cup contact AO | Profile-specific Cycles proof, 1–3 mm peak band and 12 mm cutoff | Pass as a display overlay; not a production-image input |
| Full static-scene lighting | `static-irradiance-lightmap.png` exists only as staged planar evidence | Not complete: no matching frozen UV2 scene mesh, full direct/indirect/AO bake not active |
| Same-scene panorama/reflection | Current oriented Poly Haven HDR drives both background and PMREM | Partial: direction is consistent, but HDR and near/mid GLBs were not rendered from one authored scene |
| KTX2 texture path | No KTX2 assets or configured runtime loader | Not implemented |
| Runtime desktop composition | In-app browser checks at the design-eye view plus a rotated home view; detailed table grain, lantern, PMREM response, soft subject projection and contact AO were visible | Pass for intersections and control behaviour; exact concept-frame parity remains out of scope until a same-authored scene exists |
| Mobile parity, memory and 20-switch stability | Budget contracts and disposal paths exist | Pending target-device release run; download budgets alone are not sufficient evidence |

The initial outdoor desktop check showed a brown crescent near the cup footprint. Layer isolation proved that it was neither the optical image nor either shadow/AO overlay: the highest published table slat was 0.732011735 m above the model origin, while the runtime used a 0.725922 m estimate. The resulting 6.09 mm penetration crossed the 2 mm saucer bottom. The runtime now uses the measured GLB table height; the artifact disappeared with the optical, contact-AO and fixed-projection layers restored. The production renderer remained unchanged and scene-independent throughout.

## Scene acceptance boundary

The v3 pass materially improves the old procedural presentation by shipping licensed, compact GLBs, embedded normal/roughness/metallic inputs, runtime ARM-AO wiring, Meshopt loading, fixed-light Cycles table projections and profile-specific contact AO. Low has dedicated 512/480 px model derivatives and High upgrades only the environment to 2K. It does not yet satisfy the planned final environment pipeline:

- no geometry-matched UV2 full-scene lightmap;
- no KTX2 ETC1S/UASTC delivery;
- no same-authored-scene 360° background/HDR;
- no completed target-mobile visual/performance sweep;
- no physical cup/plate calibration.

The correct release description is **higher-detail digital preview**, not “fully baked photoreal scene” and not physical WYSIWYG.

## Non-AI style review

The internal style lab now produces deterministic square/hex mosaic, clustered-dot halftone, Bayer 4×4/8×8, Floyd–Steinberg and Stucki outputs in target, plate and constrained plate domains. Review evidence:

- [`assets/style-lab/review-contact-sheet.png`](assets/style-lab/review-contact-sheet.png)
- [`assets/style-lab/optical-domains/portrait-contact-sheet.png`](assets/style-lab/optical-domains/portrait-contact-sheet.png)
- equivalent checker, text and landscape optical-domain sheets in the same directory
- [`non-ai-style-lab.md`](non-ai-style-lab.md) for recipes, metrics and manufacturing limits

Current review order is square mosaic, hex mosaic, then clustered-dot halftone. The two mosaic styles preserve the strongest digital closed-loop fidelity; clustered dots provide the clearest print-language alternative but should be judged by structure/readability rather than RGB PSNR alone. Bayer and error-diffusion outputs remain useful experimental/retro choices.

No style is exposed to customers in this pass. The 0.4 mm feature and 0.6 mm pitch limits are provisional software guards; a physical UV-print coupon is required before any style or parameter is called print-stable.

## Release follow-up

Completed in this working tree: the brown-crescent root cause and correction, final in-app desktop scene checks, lint/type/unit/worker/build/E2E/audit gates, immutable runtime-only asset manifests, and customer-image exclusion from committed QA evidence.

Still required on target hardware before a production claim:

1. perform the 320 px/390 × 844 visual sweep on representative iOS and Android devices;
2. record GPU texture memory and a 20-scene-switch/20-image stability run on those devices;
3. retain the “digital preview; physical calibration pending” disclosure and complete the physical print coupon/calibration.
