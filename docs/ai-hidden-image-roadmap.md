# AI hidden-image roadmap

Status: provisional research and non-executable contract scaffold, updated 2026-07-20. No model workflow, provider adapter, network execution or customer-facing AI control is enabled.

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

Track A is a pinned experiment matrix rather than a single model. Every arm must receive the same prepared target, optical profile, seed count and post-generation reflection scoring:

| Arm | Purpose | Control input | Current position |
|---|---|---|---|
| `A0-qr-monster` | Preserve the original fast baseline and comparison with common QR-art workflows | neutral-gray QR/structure condition | Useful compatibility baseline; not the preferred new default |
| `A1-z-image-union` | Preferred fast feasibility arm | Gray, Scribble and HED, tested separately | First arm to implement after model/license/hash pinning |
| `A2-ptdiffusion` | Slow research comparison for natural hidden art | phase-transferred fixed reference | Offline comparison, not an initial hosted-Comfy requirement |

QR Monster v2 is a ControlNet, not a per-customer LoRA. Its [official model card](https://huggingface.co/monster-labs/control_v1p_sd15_qrcode_monster) explicitly describes the structure/creativity trade-off, recommends a neutral `#808080` surround and expects multi-seed selection. It also warns that not every generated condition remains readable.

`A1` combines [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) with [Z-Image-Turbo Fun ControlNet Union 2.1](https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1). Both official model cards declare Apache-2.0. The Union 2602 model lists Canny, Depth, Pose, MLSD, HED, Scribble and Gray controls, while the official [ComfyUI `ZImageFunControlnet` node](https://docs.comfy.org/built-in-nodes/ZImageFunControlnet) supplies a native model-patch boundary. For ReflectCup, Gray should be tested against `tonal`, Scribble/HED against `contour`, and Gray plus a restrained HED branch against `hybrid`. The model card reports an eight-step distilled variant, but actual latency, memory, control leakage and commercial model inventory still require a pinned local benchmark.

`A2` uses [PTDiffusion, CVPR 2025](https://xianggao1102.github.io/PTDiffusion_webpage/) as a research arm. Its training-free phase-transfer mechanism blends a fixed reference into a text-described scene and exposes an asynchronous phase parameter for hidden-content discernibility. This is highly relevant to natural plate artwork, but it is not profile-aware and is not a ready-made standard ComfyUI workflow; the authoritative cup reflection score must still rank its outputs.

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

That standard-node statement applies to `A0` and the native-node portion of `A1`. `A2` may require a separately packaged custom implementation and therefore remains offline until its exact code, model and execution environment are pinned.

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

[Snellcaster / Refracting Reality, CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/html/Yin_Refracting_Reality_Generating_Images_with_Realistic_Transparent_Objects_CVPR_2026_paper.html) is a second implementation reference for Track B, not a substitute for LookingGlass. It synchronizes clean-image estimates through a physical ray warp, uses occlusion-masked blending, Laplacian pyramid warping, detail-preserving averaging (DPA) and time travel. Its task is generating physically plausible transparent objects rather than hiding a fixed image in a cup reflection, but its core-mask handling and DPA ablation are directly relevant to reducing boundary blur and detail loss in ReflectCup's valid reflective sheet.

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

1. Implement the `A0`/`A1`/`A2` Track A comparison, eight/sixteen-seed ranking and an internal result board; start with the content-pinned `A1` fast workflow while retaining `A0` as a baseline and `A2` as an offline arm.
2. Add the differentiable `R_profile` and CPU/browser parity tests.
3. Implement LPW and reproduce a paper-style cylindrical benchmark.
4. Add the fixed-image reflected branch and leakage/print losses.
5. Compare QR Monster, T2I-Adapter, LPW dual-view and a small Diffusion Illusions baseline on the same portrait, text and natural-image set.
6. Print calibration coupons and sample plates before setting customer promises.

## Provisional internal Track A scaffold

The 2026-07-20 code is a defensive planning scaffold, not a runnable Track A implementation. It establishes server-oriented contracts without enabling AI generation:

- `src/domains/ai/contracts.ts` defines the versioned `AIStyleProvider`, versioned `ComfyExecutor`, private asset references and optical scorer boundary. A provider-produced submission is rejected unless its provider id/version/experiment arm, complete workflow record (models, controls and custom-node commits), prompts, numeric/boolean bindings, seed plan, private asset hashes and optical profile all exactly match the validated request and provider declaration. The provider remains deliberately separate from the deterministic `src/rendering/styles/StyleProvider`; it cannot mutate a session or production image.
- `src/domains/ai/records.ts` strictly validates versioned Comfy workflow provenance and provisional AI job manifests. The manifest includes an idempotency hash, executor-bound remote handle, lifecycle state, candidate artifact hashes, measured metrics, metric-scorer id/version and acceptance-threshold id/version. Lifecycle invariants reject impossible planned/queued/running/succeeded/failed combinations. Free-form string bindings are deliberately unsupported: generation parameters may contain only finite numbers or booleans, and credential, URL, header, cookie and generic `value`-shaped keys are rejected. Sampler/model names belong in the content-pinned workflow or a future identifier enum, not arbitrary record values.
- `src/domains/ai/target-preparation.ts` is exposed only through the explicit, `server-only`-guarded `@/domains/ai/server` barrel because it depends on Node crypto and Sharp; the shared barrel does not export it. It provides provisional `tonal`, `contour` and `hybrid` preparation, composites transparency over white, constrains the longest side to 768 px by default, quantises luminance to 4–6 bands and restricts contour width to the audited 1/3/5 px kernels. It snapshots and hashes caller-owned input bytes before its first asynchronous operation. Prepared target pixels remain private and every public image access returns a new copy, so later caller mutation cannot alter the authoritative hash or bytes.
- `src/domains/ai/candidate-scoring.ts` encodes provisional digital gates and deterministic ranking. Each evaluation carries the metric scorer and threshold-policy identity/version alongside MS-SSIM, Edge F1, LPIPS, prompt-alignment ratio and reflection-versus-plate feature gap. It does not calculate these model-dependent metrics; exact OCR remains an explicit per-request gate.
- `src/domains/ai/policy.ts` hard-codes `customerControlsEnabled`, `executionEnabled` and `networkExecutionEnabled` to `false`. `DISABLED_COMFY_EXECUTOR` rejects submit, inspect and cancel. There is no route, database migration, provider URL, external request, API key or customer UI in this stage.

This scaffold does not prove visual quality, provider compatibility, metric validity, latency or commercial readiness. Before execution can be enabled, the project still needs a licensed checkpoint/model inventory, a content-bound Comfy API workflow, server-side secret injection, private input/output transfer, durable queue/lease integration, deletion/retention handling, the authoritative target-to-plate condition builder with neutral surround, real scorer implementations and an admin-only experiment board. Only after those gates pass should a separately reviewed adapter replace the disabled executor.
