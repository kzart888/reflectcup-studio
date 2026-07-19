import type { RawRgbaImage } from "@/optics/types";

import {
  parseAIWorkflowRecord,
  parseAIStylePlanRequestRecord,
  parseComfySubmissionRecord,
  type AITargetEncodingMode,
  type AIStylePlanRequestRecord,
  type AIWorkflowRecord,
  type ComfySubmissionRecord
} from "./records";

export type AIPrivateAssetReference = Readonly<{
  /** Database identifier only. Storage paths and signed URLs do not belong in job records. */
  assetId: string;
  sha256: string;
}>;

export type AIOpticalProfileReference = Readonly<{
  id: string;
  version: number;
  checksum: string;
}>;

export type AIStylePlanRequest = AIStylePlanRequestRecord;

export type ComfySubmission = ComfySubmissionRecord;

export type ComfyExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type ComfyExecutionHandle = Readonly<{
  executorId: string;
  executorVersion: number;
  remoteJobId: string;
  status: ComfyExecutionStatus;
}>;

/**
 * Credentials and base URLs are deliberately absent. A future adapter receives
 * them from a server-side secret store when it is constructed; they must never
 * be serialised into a workflow, submission or job record.
 */
export interface ComfyExecutor {
  readonly id: string;
  readonly version: number;
  readonly kind: "local" | "self-hosted" | "hosted";
  readonly enabled: boolean;
  submit(submission: ComfySubmission): Promise<ComfyExecutionHandle>;
  inspect(handle: ComfyExecutionHandle): Promise<ComfyExecutionHandle>;
  cancel(handle: ComfyExecutionHandle): Promise<void>;
}

/**
 * This contract is intentionally separate from the deterministic full-image
 * provider in src/rendering/styles. AI providers create audited Comfy plans;
 * they never mutate a customer session or production image directly.
 */
export interface AIStyleProvider {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly visibility: "internal";
  readonly experimentArm: string;
  readonly workflow: AIWorkflowRecord;
  readonly supportedTargetModes: readonly AITargetEncodingMode[];
  readonly supportedControlModes: readonly string[];
  createSubmission(request: AIStylePlanRequest): ComfySubmission | Promise<ComfySubmission>;
}

function sameRecord(left: Readonly<Record<string, number | boolean>>, right: Readonly<Record<string, number | boolean>>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function sameWorkflow(left: AIWorkflowRecord, right: AIWorkflowRecord): boolean {
  // Both operands have already passed the same strict Zod schema, which emits
  // object keys canonically. Array order remains significant for a workflow.
  return JSON.stringify(left) === JSON.stringify(right);
}

export function defineAIStyleProvider(provider: AIStyleProvider): AIStyleProvider {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(provider.id)) throw new Error("AI provider id is invalid");
  if (!Number.isInteger(provider.version) || provider.version < 1) throw new Error("AI provider version must be positive");
  if (provider.visibility !== "internal") throw new Error("AI providers must remain internal in Track A");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(provider.experimentArm)) throw new Error("AI experiment arm is invalid");
  const supported = [...new Set(provider.supportedTargetModes)];
  if (supported.length === 0 || supported.some((mode) => !["tonal", "contour", "hybrid"].includes(mode))) {
    throw new Error("AI provider must declare at least one supported target mode");
  }
  const supportedControls = [...new Set(provider.supportedControlModes)];
  if (supportedControls.length === 0
    || supportedControls.some((mode) => !/^[a-z0-9][a-z0-9._-]*$/.test(mode))) {
    throw new Error("AI provider must declare at least one supported control mode");
  }
  const experimentArm = provider.experimentArm;
  const workflow = parseAIWorkflowRecord(provider.workflow);
  const createSubmission = provider.createSubmission.bind(provider);
  return Object.freeze({
    ...provider,
    experimentArm,
    workflow,
    supportedTargetModes: Object.freeze(supported),
    supportedControlModes: Object.freeze(supportedControls),
    createSubmission: async (request: AIStylePlanRequest) => {
      const expected = parseAIStylePlanRequestRecord(request);
      if (!supported.includes(expected.targetMode)) throw new Error(`Unsupported target mode: ${expected.targetMode}`);
      if (!supportedControls.includes(expected.controlMode)) throw new Error(`Unsupported control mode: ${expected.controlMode}`);
      const submission = parseComfySubmissionRecord(await createSubmission(expected));
      if (submission.jobId !== expected.jobId) throw new Error("AI submission job id does not match its request");
      if (submission.provider.id !== provider.id
        || submission.provider.version !== provider.version
        || submission.provider.experimentArm !== experimentArm) {
        throw new Error("AI submission provider identity drifted");
      }
      if (submission.targetMode !== expected.targetMode) throw new Error("AI submission target mode drifted");
      if (submission.controlMode !== expected.controlMode) throw new Error("AI submission control mode drifted");
      if (!sameWorkflow(submission.workflow, workflow)) {
        throw new Error("AI submission workflow drifted from its provider");
      }
      if (submission.opticalProfile.id !== expected.opticalProfile.id
        || submission.opticalProfile.version !== expected.opticalProfile.version
        || submission.opticalProfile.checksum !== expected.opticalProfile.checksum) {
        throw new Error("AI submission optical profile drifted from its request");
      }
      if (submission.seeds.length !== expected.seeds.length
        || submission.seeds.some((seed, index) => seed !== expected.seeds[index])) {
        throw new Error("AI submission seed plan drifted from its request");
      }
      for (const role of ["source", "preparedTarget", "plateCondition"] as const) {
        if (submission.assets[role].assetId !== expected[role].assetId
          || submission.assets[role].sha256 !== expected[role].sha256) {
          throw new Error(`AI submission ${role} asset drifted from its request`);
        }
      }
      if (submission.positivePrompt !== expected.positivePrompt
        || submission.negativePrompt !== expected.negativePrompt) {
        throw new Error("AI submission prompts drifted from its request");
      }
      if (!sameRecord(submission.bindings, expected.parameters)) {
        throw new Error("AI submission parameter bindings drifted from its request");
      }
      return submission;
    }
  });
}

export type OpticalCandidateScoreRequest = Readonly<{
  candidateId: string;
  seed: number;
  plate: RawRgbaImage;
  preparedTarget: RawRgbaImage;
  opticalProfile: AIOpticalProfileReference;
  requireExactOcr?: boolean;
}>;

export interface OpticalCandidateScorer<TScore> {
  readonly id: string;
  readonly version: number;
  score(request: OpticalCandidateScoreRequest): Promise<TScore>;
}
