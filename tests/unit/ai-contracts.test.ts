import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  AIExecutionDisabledError,
  AI_TRACK_A_POLICY,
  createDisabledComfyExecutor,
  defineAIStyleProvider,
  parseAIGenerationJobRecord,
  parseAIWorkflowRecord,
  parseComfySubmissionRecord,
  type AIStylePlanRequest,
  type ComfySubmission
} from "@/domains/ai";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

function workflow() {
  return {
    schemaVersion: 1 as const,
    id: "qr-monster-feasibility",
    version: 1,
    apiFormat: "comfyui-api-v1" as const,
    apiWorkflowSha256: SHA_A,
    models: [{ role: "controlnet" as const, id: "qr-monster-v2", version: "pinned-later", sha256: SHA_B }],
    controls: [{ id: "structure", kind: "gray", modelId: "qr-monster-v2", inputBinding: "control_image" }],
    customNodes: [{ id: "reflectcup-nodes", commit: "abcdef1" }]
  };
}

function request(): AIStylePlanRequest {
  return {
    jobId: "ai-job-1",
    source: { assetId: "source-1", sha256: SHA_A },
    preparedTarget: { assetId: "target-1", sha256: SHA_B },
    plateCondition: { assetId: "plate-1", sha256: SHA_C },
    targetMode: "hybrid",
    controlMode: "gray",
    opticalProfile: { id: "curved-cup-v3", version: 3, checksum: SHA_C },
    seeds: [11, 12],
    positivePrompt: "botanical photograph",
    negativePrompt: "watermark",
    parameters: { steps: 8, controlStrength: 1, refine: false }
  };
}

function submissionFromRequest(plan: AIStylePlanRequest): ComfySubmission {
  return {
    schemaVersion: 1,
    jobId: plan.jobId,
    provider: { id: "track-a-qr-monster", version: 1, experimentArm: "a0-qr-monster" },
    targetMode: plan.targetMode,
    controlMode: plan.controlMode,
    workflow: parseAIWorkflowRecord(workflow()),
    opticalProfile: plan.opticalProfile,
    assets: {
      source: plan.source,
      preparedTarget: plan.preparedTarget,
      plateCondition: plan.plateCondition
    },
    seeds: [...plan.seeds],
    positivePrompt: plan.positivePrompt,
    negativePrompt: plan.negativePrompt,
    bindings: plan.parameters
  };
}

function providerWith(
  transform: (submission: ComfySubmission) => ComfySubmission = (submission) => submission
) {
  const createSubmission = vi.fn((plan: AIStylePlanRequest) => transform(submissionFromRequest(plan)));
  return defineAIStyleProvider({
    id: "track-a-qr-monster",
    version: 1,
    label: "QR Monster feasibility baseline",
    visibility: "internal",
    experimentArm: "a0-qr-monster",
    workflow: parseAIWorkflowRecord(workflow()),
    supportedTargetModes: ["tonal", "hybrid", "hybrid"],
    supportedControlModes: ["gray", "scribble"],
    createSubmission
  });
}

function evaluation() {
  return {
    scorer: { id: "reflectcup-metric-suite", version: 1 },
    thresholdPolicy: {
      id: "reflectcup-provisional-acceptance",
      version: 1,
      values: {
        lowFrequencyMsSsim: 0.8,
        edgeF1: 0.7,
        lpips: 0.3,
        promptAlignmentRatio: 0.9,
        featureSimilarityGap: 0.15
      }
    },
    metrics: {
      lowFrequencyMsSsim: 0.86,
      edgeF1: 0.76,
      lpips: 0.24,
      promptAlignmentRatio: 0.94,
      featureSimilarityGap: 0.2
    },
    requireExactOcr: false,
    accepted: true,
    aggregateScore: 0.82,
    failedGates: []
  };
}

function job() {
  return {
    schemaVersion: 1 as const,
    id: "ai-job-1",
    status: "planned" as const,
    provider: { id: "track-a-qr-monster", version: 1, experimentArm: "a0-qr-monster" },
    executor: { id: "disabled-comfy", version: 1, kind: "local" as const },
    execution: { idempotencyKey: SHA_A },
    workflow: workflow(),
    opticalProfile: { id: "curved-cup-v3", version: 3, checksum: SHA_C },
    input: {
      sourceSha256: SHA_A,
      preparedTargetSha256: SHA_B,
      plateConditionSha256: SHA_C,
      targetMode: "hybrid" as const
    },
    generation: {
      seeds: [11, 12],
      controlMode: "gray",
      positivePrompt: "a quiet botanical photograph",
      negativePrompt: "text, watermark",
      parameters: { steps: 32, controlStrength: 1, refine: false }
    },
    candidates: [],
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z"
  };
}

function succeededJob() {
  return {
    ...job(),
    status: "succeeded" as const,
    execution: {
      idempotencyKey: SHA_A,
      remoteHandle: {
        executorId: "disabled-comfy",
        executorVersion: 1,
        remoteJobId: "remote-1",
        status: "succeeded" as const
      }
    },
    candidates: [{
      id: "candidate-11",
      seed: 11,
      plateSha256: SHA_A,
      reflectedSha256: SHA_B,
      evaluation: evaluation()
    }]
  };
}

describe("internal AI contracts", () => {
  it("enforces the Node/Sharp barrel as a server-only boundary", () => {
    const serverEntry = readFileSync("src/domains/ai/server.ts", "utf8");
    expect(serverEntry).toContain('import "server-only"');
  });

  it("keeps every execution and customer exposure gate compile-time disabled", () => {
    expect(AI_TRACK_A_POLICY).toEqual({
      schemaVersion: 1,
      stage: "internal-scaffold",
      customerControlsEnabled: false,
      executionEnabled: false,
      networkExecutionEnabled: false
    });
  });

  it("uses a disabled executor that cannot call submit, inspect or cancel", async () => {
    const executor = createDisabledComfyExecutor("test-disabled", "hosted");
    const submission = {} as ComfySubmission;
    await expect(executor.submit(submission)).rejects.toBeInstanceOf(AIExecutionDisabledError);
    await expect(executor.inspect({ executorId: executor.id, executorVersion: 1, remoteJobId: "none", status: "queued" }))
      .rejects.toBeInstanceOf(AIExecutionDisabledError);
    await expect(executor.cancel({ executorId: executor.id, executorVersion: 1, remoteJobId: "none", status: "queued" }))
      .rejects.toBeInstanceOf(AIExecutionDisabledError);
    expect(executor.enabled).toBe(false);
  });

  it("defines a separately versioned internal provider", async () => {
    const provider = providerWith();
    expect(provider.supportedTargetModes).toEqual(["tonal", "hybrid"]);
    expect(Object.isFrozen(provider)).toBe(true);
    expect(Object.isFrozen(provider.workflow.models)).toBe(true);
    await expect(provider.createSubmission(request())).resolves.toMatchObject({
      provider: { id: "track-a-qr-monster", version: 1, experimentArm: "a0-qr-monster" },
      controlMode: "gray",
      seeds: [11, 12]
    });
    await expect(provider.createSubmission({ ...request(), controlMode: "depth" }))
      .rejects.toThrow("Unsupported control mode");
    await expect(provider.createSubmission({ ...request(), targetMode: "contour" }))
      .rejects.toThrow("Unsupported target mode");
  });

  it("rejects drift in every provider-bound submission field", async () => {
    const changedWorkflowModel = parseAIWorkflowRecord({
      ...workflow(),
      models: [{ ...workflow().models[0], version: "drifted" }]
    });
    const changedWorkflowControl = parseAIWorkflowRecord({
      ...workflow(),
      controls: [{ ...workflow().controls[0], inputBinding: "other_control" }]
    });
    const changedWorkflowNode = parseAIWorkflowRecord({
      ...workflow(),
      customNodes: [{ ...workflow().customNodes[0], commit: "1234567" }]
    });
    const cases: Array<(submission: ComfySubmission) => ComfySubmission> = [
      (submission) => ({ ...submission, jobId: "other-job" }),
      (submission) => ({ ...submission, provider: { ...submission.provider, version: 2 } }),
      (submission) => ({ ...submission, provider: { ...submission.provider, experimentArm: "a1-other" } }),
      (submission) => ({ ...submission, targetMode: "tonal" }),
      (submission) => ({ ...submission, controlMode: "scribble" }),
      (submission) => ({ ...submission, workflow: changedWorkflowModel }),
      (submission) => ({ ...submission, workflow: changedWorkflowControl }),
      (submission) => ({ ...submission, workflow: changedWorkflowNode }),
      (submission) => ({ ...submission, positivePrompt: "drifted prompt" }),
      (submission) => ({ ...submission, negativePrompt: "drifted negative" }),
      (submission) => ({ ...submission, bindings: { ...submission.bindings, steps: 9 } }),
      (submission) => ({ ...submission, seeds: [11] }),
      (submission) => ({
        ...submission,
        assets: { ...submission.assets, source: { ...submission.assets.source, sha256: SHA_B } }
      }),
      (submission) => ({
        ...submission,
        opticalProfile: { ...submission.opticalProfile, checksum: SHA_A }
      })
    ];
    for (const drift of cases) {
      await expect(providerWith(drift).createSubmission(request())).rejects.toThrow(/drift|does not match/);
    }
  });

  it("allows only finite numeric and boolean parameter bindings", () => {
    const valid = submissionFromRequest(request());
    expect(parseComfySubmissionRecord(valid).bindings).toEqual(request().parameters);
    expect(() => parseComfySubmissionRecord({ ...valid, bindings: { steps: "8" } })).toThrow();
    expect(() => parseComfySubmissionRecord({ ...valid, bindings: { endpointUrl: 1 } }))
      .toThrow("Credential, URL, header");
    expect(() => parseComfySubmissionRecord({ ...valid, bindings: { requestHeader: true } }))
      .toThrow("Credential, URL, header");
    expect(() => parseComfySubmissionRecord({ ...valid, bindings: { controlValue: 1 } }))
      .toThrow("Credential, URL, header");
    expect(() => parseComfySubmissionRecord({ ...valid, bindings: { apiKey: 1 } }))
      .toThrow("Credential, URL, header");
  });

  it("strictly validates complete workflow provenance", () => {
    expect(parseAIWorkflowRecord(workflow())).toMatchObject({ id: "qr-monster-feasibility", version: 1 });
    expect(() => parseAIWorkflowRecord({ ...workflow(), apiKey: "must-not-be-recorded" })).toThrow();
    expect(() => parseAIWorkflowRecord({ ...workflow(), apiWorkflowSha256: "not-a-sha" })).toThrow();
    expect(() => parseAIWorkflowRecord({
      ...workflow(),
      customNodes: [{ id: "reflectcup-nodes", commit: "not-a-commit" }]
    })).toThrow();
    expect(() => parseAIWorkflowRecord({
      ...workflow(),
      controls: [{ id: "structure", kind: "gray", modelId: "missing-model", inputBinding: "control_image" }]
    })).toThrow("control must reference a model");
  });

  it("records metrics, scorer and threshold identities for a succeeded candidate", () => {
    const parsed = parseAIGenerationJobRecord(succeededJob());
    expect(parsed.candidates[0].evaluation).toMatchObject({
      scorer: { id: "reflectcup-metric-suite", version: 1 },
      thresholdPolicy: { id: "reflectcup-provisional-acceptance", version: 1 },
      metrics: { lowFrequencyMsSsim: 0.86 },
      accepted: true
    });
  });

  it("enforces job lifecycle, remote handle and idempotency invariants", () => {
    expect(parseAIGenerationJobRecord(job())).toMatchObject({ id: "ai-job-1", status: "planned" });
    expect(parseAIGenerationJobRecord(succeededJob())).toMatchObject({ status: "succeeded" });
    expect(() => parseAIGenerationJobRecord({ ...job(), execution: { idempotencyKey: "not-a-sha" } })).toThrow();
    expect(() => parseAIGenerationJobRecord({ ...job(), status: "queued" })).toThrow("require a remote handle");
    expect(() => parseAIGenerationJobRecord({
      ...succeededJob(),
      execution: {
        ...succeededJob().execution,
        remoteHandle: { ...succeededJob().execution.remoteHandle, executorId: "other-executor" }
      }
    })).toThrow("executor identity must match");
    expect(() => parseAIGenerationJobRecord({ ...job(), status: "failed" })).toThrow("require an error code");
    expect(() => parseAIGenerationJobRecord({
      ...succeededJob(),
      candidates: [{ ...succeededJob().candidates[0], evaluation: undefined }]
    })).toThrow("fully hashed and evaluated");
    expect(() => parseAIGenerationJobRecord({
      ...succeededJob(),
      candidates: [{
        ...succeededJob().candidates[0],
        evaluation: { ...evaluation(), accepted: false }
      }]
    })).toThrow("accepted must match");
  });

  it("validates candidate-to-seed integrity and strict job parameters", () => {
    expect(() => parseAIGenerationJobRecord({
      ...succeededJob(),
      generation: { ...succeededJob().generation, seeds: [11, 11] }
    })).toThrow("unique seeds");
    expect(() => parseAIGenerationJobRecord({
      ...succeededJob(),
      candidates: [{ ...succeededJob().candidates[0], seed: 99 }]
    })).toThrow("candidate seed must belong");
    expect(() => parseAIGenerationJobRecord({ ...job(), providerToken: "secret" })).toThrow();
    expect(() => parseAIGenerationJobRecord({
      ...job(),
      generation: { ...job().generation, parameters: { serviceUrl: 1 } }
    })).toThrow("Credential, URL, header");
    expect(() => parseAIGenerationJobRecord({
      ...job(),
      generation: { ...job().generation, parameters: { sampler: "euler" } }
    })).toThrow();
  });
});
