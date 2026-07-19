# AI hidden-image roadmap

Status: research and implementation plan, 2026-07-19. No customer-facing AI control is enabled yet.

## Decision

The intended product is technically feasible, but `QR Monster + img2img` should be treated as a fast baseline rather than the final optical engine.

The production objective is a two-view constrained generation problem:

```text
plate view P                         reflected view R_profile(P)
looks like a natural selected style approximates the uploaded target T
```

`R_profile` is the immutable profile's plate-to-reflection operator. Scene selection, HDRI and preview lighting never enter this operator.

The recommended long-term route combines:

1. ReflectCup's authoritative optical LUT and a differentiable reflection operator.
2. LookingGlass-style Laplacian Pyramid Warping (LPW) for severe, spatially varying scale changes.
3. A fixed uploaded-image loss in the reflected view.
4. A diffusion prior and optional style LoRA in the plate view.
5. Candidate generation, optical re-rendering and automatic ranking before a result reaches the customer.

[LookingGlass, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/html/Chang_LookingGlass_Generative_Anamorphoses_via_Laplacian_Pyramid_Warping_CVPR_2025_paper.html) is the closest published method: it extends diffusion illusions to cylindrical/conic mirrors and non-uniform warps by warping predicted clean images through a frequency-aware pyramid rather than directly warping noisy latents. [Diffusion Illusions](https://diffusionillusions.com/) is important because it supports fixed target images and arbitrary differentiable physical arrangements, but its SDS optimisation is too slow for the main online path. [Visual Anagrams](https://dangeng.github.io/visual_anagrams/) is not directly applicable because its strongest guarantees assume orthogonal/permutation-like views; the cup mapping contains local stretching, compression, holes and partial coverage.

## Customer-visible encoding modes

The uploaded image should not always be reduced to a hard binary image. The first release should expose three understandable hidden encodings:

| Mode | Target preparation | Suitable plate styles | Expected trade-off |
|---|---|---|---|
| `tonal` | subject isolation, guided/bilateral smoothing, 4–6 luminance bands | landscape, photography, aerial terrain, botanical | least obvious plate leakage; softer identity |
| `contour` | XDoG/Canny plus saliency filtering and physical line-width limits | streetscape, architecture, ink, graphic line | strongest edges; easiest to notice directly |
| `hybrid` | roughly 60–75% tonal structure plus 25–40% key contours | general default, portrait, watercolor | best starting balance |

The phrase “no visible lines” means that information is carried by low-frequency illumination, terrain boundaries, shadows, foliage and object arrangement. It does not mean the plate can be statistically independent of the hidden target.

For faces, IP-Adapter/InstantID-class identity conditioning can improve semantic identity only after explicit user consent. It cannot replace the fixed reflected-view loss or the physical renderer.

## Track A: ComfyUI feasibility baseline

QR Monster v2 is a ControlNet, not a per-customer LoRA. Its [official model card](https://huggingface.co/monster-labs/control_v1p_sd15_qrcode_monster) explicitly describes the structure/creativity trade-off, recommends a neutral `#808080` surround and expects multi-seed selection. It also warns that not every generated condition remains readable.

```text
ReflectCup server
  source image
  -> tonal / contour / hybrid target
  -> target-to-plate LPW or first-pass LUT warp
  -> plate-condition.png, #808080 outside the controlled region

ComfyUI
  licensed SD1.5 checkpoint
  + QR Monster v2 ControlNet
  + selected plate prompt/style LoRA
  -> 8–16 seeded candidates at 512/768 px
  -> optional 1024/1536 px low-denoise refinement

ReflectCup server
  candidates
  -> authoritative reflection render
  -> print/eye-position perturbation
  -> score and retain the best 3–4
```

Initial experiment grid:

- Control strength: `0.75`, `1.0`, `1.25`.
- Control interval: start `0`, end `0.75–0.90`.
- Sampling: `28–36` steps, CFG `5–7`.
- Refinement denoise: `0.20–0.35`.
- At least eight seeds; use sixteen for a production feasibility test.
- Always rank the generated image after the true optical transform. Never rank the ControlNet condition itself.

Add [T2I-Adapter SDXL lineart/sketch](https://github.com/TencentARC/T2I-Adapter) as a comparison arm. Its official implementation states that SDXL inference needs about 15 GB VRAM. It will probably retain contours better but expose the hidden drawing more clearly on the plate.

Track A can run with standard ComfyUI nodes and a small ReflectCup pre/post-processing service. It validates product desirability and prompt/style categories; it does not prove that arbitrary customer photos can always be hidden.

## Track B: profile-aware dual-view sampler

Let:

- `P` be the generated plate image.
- `I` be the uploaded source.
- `T = Q(I)` be the selected simplified target.
- `R_profile(P, ξ)` be the differentiable reflected view with manufacturing/camera perturbation `ξ`.

The optimisation objective is:

```text
L = λreflection Eξ[Ltarget(R_profile(P, ξ), T)]
  + λnatural Ldiffusion(P, platePrompt)
  + λleak Lleakage(P, T)
  + λprint Lprintability(P)
  + λboundary LcoreBoundary(P)
```

`Ltarget` should mix low-frequency L1, MS-SSIM, LPIPS and edge loss. `Lleakage` penalises direct recognisability from the plate. `Lprintability` models gamut, 0.2–0.5 mm blur, minimum features and ink limits. The non-reflected region receives only natural-image/fill guidance.

The existing `plate→targetUV` LUT can become a PyTorch `grid_sample` grid, but a single bilinear sample is not sufficient in strong minification regions. The LPW implementation therefore needs:

1. a local Jacobian/LOD field compiled with each optical profile;
2. Gaussian and Laplacian pyramids for clean-image predictions;
3. frequency-selective forward and adjoint warps;
4. valid/core masks and controlled hole filling;
5. tests that compare the PyTorch operator with the authoritative CPU/browser renderer.

Suggested ComfyUI custom-node boundary:

```text
ReflectCupPrepareTarget
ReflectCupLoadOpticalProfile
ReflectCupLaplacianWarp
ReflectCupDualViewSampler
ReflectCupPrintSimulation
ReflectCupReflectionScore
ReflectCupCandidateRank
```

At each denoising step the sampler predicts clean images for the natural plate branch and reflected target branch, decodes them, uses LPW to reconcile their spatial frequency bands in plate space, re-encodes the merged result and preserves the VAE residual. The final 10–25% of steps should favour the plate branch's high-frequency texture while retaining the reflected branch's low/mid-frequency identity.

LookingGlass primarily demonstrates prompt-to-prompt paired views. Adding a fixed uploaded-image target is a ReflectCup extension, informed by Diffusion Illusions' dream-target loss. It requires original engineering and must not be described as a ready-made ComfyUI workflow.

## Role of LoRA and future training

LoRA should control reusable aesthetics such as film photography, watercolor, botanical illustration, night street or aerial terrain. It should not encode each customer's hidden image.

After enough physically validated examples exist, a profile-aware `OpticalControlNet` or T2I-Adapter can be trained. Its consistency feedback should run the generated plate through `R_profile` and compare the reflected result with the target, analogous to the cycle-consistency direction explored by [ControlNet++](https://arxiv.org/abs/2404.07987). Until that dataset exists, online per-customer training is unnecessary and too slow.

## Product style taxonomy

Recommended first AI choices:

1. Hidden landscape — tonal default, high camouflage.
2. Botanical camouflage — branches and foliage absorb portrait structure well.
3. Aerial terrain — roads, rivers and fields tolerate anamorphic distortion.
4. Hidden streetscape — hybrid/contour, higher recognisability.
5. Monochrome photography — easier luminance control.
6. Watercolor hidden portrait — tolerant of local detail drift.
7. Graphic line — strongest structure, weakest concealment.
8. Deterministic dot/mosaic — non-AI production fallback.

The UI should separate `hidden encoding` from `plate art style`; “hybrid + botanical” and “tonal + landscape” are meaningful combinations. Advanced ControlNet/LoRA/model choices remain server-side.

## Automatic acceptance gate

Provisional digital thresholds for experiments, not physical production guarantees:

- reflected low-frequency MS-SSIM `>= 0.80`;
- reflected Edge F1 `>= 0.70`;
- LPIPS `<= 0.30`;
- plate prompt alignment at least 90% of an unconstrained same-prompt baseline;
- reflected-target feature similarity at least `0.15` above direct plate-target similarity;
- at least one accepted result from sixteen seeds;
- evaluation under camera jitter, profile tolerance, print blur and colour-gamut simulation;
- exact OCR match for short text, evaluated separately from photographs;
- identity thresholds calibrated from an approved face encoder's ROC curve, not an arbitrary cosine value.

All thresholds must be replaced or calibrated after physical print tests.

## Provider and job architecture

```text
AIStyleProvider
  -> ComfyExecutor
       -> LocalComfy
       -> SelfHostedGpuComfy
       -> HostedComfyProvider
```

Workflow API JSON is versioned. Each job records the provider, workflow version, model/LoRA/ControlNet hashes, custom-node commit, optical profile version/checksum, source hash, seed, prompts, parameters, outputs and scores.

The [Comfy Cloud API](https://docs.comfy.org/development/cloud/overview) accepts API-format workflows through `POST /api/prompt`, provides asynchronous jobs and is broadly compatible with local ComfyUI, but its API is currently marked experimental. A hosted provider is suitable for Track A only if it has the required standard nodes/models. Track B requires custom-node installation, pinned containers/models and permission to run a custom VAE/sampler loop.

Approximate compute targets taken from primary implementations:

- QR Monster baseline: engineering estimate of 12–16 GB VRAM for comfortable 768 px batching/refinement; benchmark on the chosen provider.
- T2I-Adapter SDXL: official minimum about 15 GB VRAM.
- LookingGlass: the paper reports roughly 80 seconds for paired 1K output with 30 SD3.5 Medium steps on an RTX 4090.
- Diffusion Illusions: the paper's optimisation is on the order of minutes (about a 15-minute budget on one A100), so it is a research/offline fallback.

## Delivery stages

1. Implement Track A workflow, eight/sixteen-seed ranking and an internal result board.
2. Add the differentiable `R_profile` and CPU/browser parity tests.
3. Implement LPW and reproduce a paper-style cylindrical benchmark.
4. Add the fixed-image reflected branch and leakage/print losses.
5. Compare QR Monster, T2I-Adapter, LPW dual-view and a small Diffusion Illusions baseline on the same portrait, text and natural-image set.
6. Print calibration coupons and sample plates before setting customer promises.
