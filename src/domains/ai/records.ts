import { z } from "zod";

const identifier = z.string().min(1).max(96).regex(/^[a-z0-9][a-z0-9._-]*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });
const primitiveParameter = z.union([z.number().finite(), z.boolean()]);
const forbiddenParameterSegments = new Set([
  "apikey",
  "auth",
  "authorization",
  "cookie",
  "credential",
  "endpoint",
  "header",
  "host",
  "key",
  "password",
  "secret",
  "token",
  "uri",
  "url",
  "value"
]);

function isSafeParameterKey(key: string): boolean {
  const canonical = key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
  return !canonical
    .split(/[-_.]+/)
    .some((segment) => forbiddenParameterSegments.has(segment));
}

const safeParameterKey = z.string().min(1).max(96)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  .refine(
    isSafeParameterKey,
    "Credential, URL, header and generic value fields do not belong in AI parameter records"
  );
const parameterRecord = z.record(safeParameterKey, primitiveParameter);

export type AIPrimitiveParameter = z.infer<typeof primitiveParameter>;
export type AIParameterRecord = Readonly<Record<string, AIPrimitiveParameter>>;

export const aiTargetEncodingModeSchema = z.enum(["tonal", "contour", "hybrid"]);
export type AITargetEncodingMode = z.infer<typeof aiTargetEncodingModeSchema>;

export const aiWorkflowRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: identifier,
  version: z.number().int().positive(),
  apiFormat: z.literal("comfyui-api-v1"),
  apiWorkflowSha256: sha256,
  models: z.array(z.object({
    role: z.enum(["checkpoint", "controlnet", "lora", "vae", "adapter"]),
    id: identifier,
    version: z.string().min(1).max(128),
    sha256
  }).strict()).max(32),
  controls: z.array(z.object({
    id: identifier,
    kind: identifier,
    modelId: identifier,
    inputBinding: identifier
  }).strict()).max(16),
  customNodes: z.array(z.object({
    id: identifier,
    commit: z.string().regex(/^[a-f0-9]{7,64}$/)
  }).strict()).max(32)
}).strict().superRefine((record, context) => {
  const seenModelIds = new Set<string>();
  for (let index = 0; index < record.models.length; index += 1) {
    if (seenModelIds.has(record.models[index].id)) {
      context.addIssue({ code: "custom", path: ["models", index, "id"], message: "workflow model ids must be unique" });
    }
    seenModelIds.add(record.models[index].id);
  }
  const modelIds = new Set(record.models.map((model) => model.id));
  const seenControlIds = new Set<string>();
  for (let index = 0; index < record.controls.length; index += 1) {
    if (seenControlIds.has(record.controls[index].id)) {
      context.addIssue({ code: "custom", path: ["controls", index, "id"], message: "workflow control ids must be unique" });
    }
    seenControlIds.add(record.controls[index].id);
    if (!modelIds.has(record.controls[index].modelId)) {
      context.addIssue({
        code: "custom",
        path: ["controls", index, "modelId"],
        message: "control must reference a model in the workflow record"
      });
    }
  }
  const seenNodeIds = new Set<string>();
  for (let index = 0; index < record.customNodes.length; index += 1) {
    if (seenNodeIds.has(record.customNodes[index].id)) {
      context.addIssue({ code: "custom", path: ["customNodes", index, "id"], message: "custom node ids must be unique" });
    }
    seenNodeIds.add(record.customNodes[index].id);
  }
});

export type AIWorkflowRecord = Readonly<z.infer<typeof aiWorkflowRecordSchema>>;

const aiPrivateAssetReferenceSchema = z.object({
  assetId: identifier,
  sha256
}).strict();

const aiOpticalProfileReferenceSchema = z.object({
  id: identifier,
  version: z.number().int().positive(),
  checksum: sha256
}).strict();

const aiProviderIdentitySchema = z.object({
  id: identifier,
  version: z.number().int().positive(),
  experimentArm: identifier
}).strict();

const seedPlanSchema = z.array(z.number().int().min(0).max(0xffff_ffff)).min(1).max(64)
  .superRefine((seeds, context) => {
    if (new Set(seeds).size !== seeds.length) {
      context.addIssue({ code: "custom", message: "seed plan must contain unique seeds" });
    }
  });

export const aiStylePlanRequestRecordSchema = z.object({
  jobId: identifier,
  source: aiPrivateAssetReferenceSchema,
  preparedTarget: aiPrivateAssetReferenceSchema,
  plateCondition: aiPrivateAssetReferenceSchema,
  targetMode: aiTargetEncodingModeSchema,
  controlMode: identifier,
  opticalProfile: aiOpticalProfileReferenceSchema,
  seeds: seedPlanSchema,
  positivePrompt: z.string().max(8_192),
  negativePrompt: z.string().max(8_192),
  parameters: parameterRecord
}).strict();

export type AIStylePlanRequestRecord = Readonly<z.infer<typeof aiStylePlanRequestRecordSchema>>;

export const comfySubmissionRecordSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: identifier,
  provider: aiProviderIdentitySchema,
  targetMode: aiTargetEncodingModeSchema,
  controlMode: identifier,
  workflow: aiWorkflowRecordSchema,
  opticalProfile: aiOpticalProfileReferenceSchema,
  assets: z.object({
    source: aiPrivateAssetReferenceSchema,
    preparedTarget: aiPrivateAssetReferenceSchema,
    plateCondition: aiPrivateAssetReferenceSchema
  }).strict(),
  seeds: seedPlanSchema,
  positivePrompt: z.string().max(8_192),
  negativePrompt: z.string().max(8_192),
  bindings: parameterRecord
}).strict();

export type ComfySubmissionRecord = Readonly<z.infer<typeof comfySubmissionRecordSchema>>;

const aiMetricsSchema = z.object({
  lowFrequencyMsSsim: z.number().finite().min(0).max(1),
  edgeF1: z.number().finite().min(0).max(1),
  lpips: z.number().finite().min(0).max(1),
  promptAlignmentRatio: z.number().finite().nonnegative(),
  featureSimilarityGap: z.number().finite().min(-1).max(1),
  exactOcrMatch: z.boolean().optional()
}).strict();

const aiThresholdValuesSchema = z.object({
  lowFrequencyMsSsim: z.number().finite().min(0).max(1),
  edgeF1: z.number().finite().min(0).max(1),
  lpips: z.number().finite().min(0).max(1),
  promptAlignmentRatio: z.number().finite().nonnegative(),
  featureSimilarityGap: z.number().finite().min(-1).max(1)
}).strict();

const aiCandidateEvaluationSchema = z.object({
  scorer: z.object({
    id: identifier,
    version: z.number().int().positive()
  }).strict(),
  thresholdPolicy: z.object({
    id: identifier,
    version: z.number().int().positive(),
    values: aiThresholdValuesSchema
  }).strict(),
  metrics: aiMetricsSchema,
  requireExactOcr: z.boolean(),
  accepted: z.boolean(),
  aggregateScore: z.number().finite().min(0).max(1),
  failedGates: z.array(identifier).max(32)
}).strict().superRefine((evaluation, context) => {
  const expectedFailedGates: string[] = [];
  const thresholds = evaluation.thresholdPolicy.values;
  const metrics = evaluation.metrics;
  if (metrics.lowFrequencyMsSsim < thresholds.lowFrequencyMsSsim) expectedFailedGates.push("low-frequency-ms-ssim");
  if (metrics.edgeF1 < thresholds.edgeF1) expectedFailedGates.push("edge-f1");
  if (metrics.lpips > thresholds.lpips) expectedFailedGates.push("lpips");
  if (metrics.promptAlignmentRatio < thresholds.promptAlignmentRatio) expectedFailedGates.push("prompt-alignment");
  if (metrics.featureSimilarityGap < thresholds.featureSimilarityGap) expectedFailedGates.push("reflection-leakage-gap");
  if (evaluation.requireExactOcr && metrics.exactOcrMatch !== true) expectedFailedGates.push("exact-ocr");
  if (evaluation.failedGates.length !== expectedFailedGates.length
    || evaluation.failedGates.some((gate, index) => gate !== expectedFailedGates[index])) {
    context.addIssue({
      code: "custom",
      path: ["failedGates"],
      message: "failed gates must match the recorded metrics and threshold policy"
    });
  }
  if (evaluation.accepted !== (evaluation.failedGates.length === 0)) {
    context.addIssue({ code: "custom", path: ["accepted"], message: "accepted must match the failed gate set" });
  }
});

const aiCandidateRecordSchema = z.object({
  id: identifier,
  seed: z.number().int().min(0).max(0xffff_ffff),
  plateSha256: sha256.optional(),
  reflectedSha256: sha256.optional(),
  evaluation: aiCandidateEvaluationSchema.optional()
}).strict().superRefine((candidate, context) => {
  if ((candidate.plateSha256 === undefined) !== (candidate.reflectedSha256 === undefined)) {
    context.addIssue({
      code: "custom",
      path: ["plateSha256"],
      message: "candidate plate and reflected hashes must be recorded together"
    });
  }
});

const executionStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);

export const aiGenerationJobRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: identifier,
  status: z.enum(["planned", "queued", "running", "succeeded", "failed", "cancelled"]),
  provider: aiProviderIdentitySchema,
  executor: z.object({
    id: identifier,
    version: z.number().int().positive(),
    kind: z.enum(["local", "self-hosted", "hosted"])
  }).strict(),
  execution: z.object({
    idempotencyKey: sha256,
    remoteHandle: z.object({
      executorId: identifier,
      executorVersion: z.number().int().positive(),
      remoteJobId: identifier,
      status: executionStatusSchema
    }).strict().optional()
  }).strict(),
  workflow: aiWorkflowRecordSchema,
  opticalProfile: aiOpticalProfileReferenceSchema,
  input: z.object({
    sourceSha256: sha256,
    preparedTargetSha256: sha256,
    plateConditionSha256: sha256,
    targetMode: aiTargetEncodingModeSchema
  }).strict(),
  generation: z.object({
    seeds: seedPlanSchema,
    controlMode: identifier,
    positivePrompt: z.string().max(8_192),
    negativePrompt: z.string().max(8_192),
    parameters: parameterRecord
  }).strict(),
  candidates: z.array(aiCandidateRecordSchema).max(64),
  createdAt: timestamp,
  updatedAt: timestamp,
  errorCode: identifier.optional()
}).strict().superRefine((record, context) => {
  if (new Date(record.updatedAt).getTime() < new Date(record.createdAt).getTime()) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt cannot precede createdAt" });
  }

  const handle = record.execution.remoteHandle;
  if (handle && (handle.executorId !== record.executor.id || handle.executorVersion !== record.executor.version)) {
    context.addIssue({
      code: "custom",
      path: ["execution", "remoteHandle"],
      message: "remote handle executor identity must match the job executor"
    });
  }
  if (record.status === "planned" && handle) {
    context.addIssue({ code: "custom", path: ["execution", "remoteHandle"], message: "planned jobs cannot have a remote handle" });
  }
  if (["queued", "running", "succeeded"].includes(record.status) && !handle) {
    context.addIssue({ code: "custom", path: ["execution", "remoteHandle"], message: `${record.status} jobs require a remote handle` });
  }
  if (handle && record.status !== "planned" && handle.status !== record.status) {
    context.addIssue({
      code: "custom",
      path: ["execution", "remoteHandle", "status"],
      message: "remote handle status must match the job status"
    });
  }
  if (record.status === "failed" && !record.errorCode) {
    context.addIssue({ code: "custom", path: ["errorCode"], message: "failed jobs require an error code" });
  }
  if (record.status !== "failed" && record.errorCode) {
    context.addIssue({ code: "custom", path: ["errorCode"], message: "only failed jobs may record an error code" });
  }
  if (record.status === "planned" && record.candidates.length > 0) {
    context.addIssue({ code: "custom", path: ["candidates"], message: "planned jobs cannot already contain candidates" });
  }
  if (record.status === "succeeded" && record.candidates.length === 0) {
    context.addIssue({ code: "custom", path: ["candidates"], message: "succeeded jobs require at least one evaluated candidate" });
  }

  const plannedSeeds = new Set(record.generation.seeds);
  const candidateIds = new Set<string>();
  const candidateSeeds = new Set<number>();
  for (let index = 0; index < record.candidates.length; index += 1) {
    const candidate = record.candidates[index];
    if (candidateIds.has(candidate.id)) {
      context.addIssue({ code: "custom", path: ["candidates", index, "id"], message: "candidate ids must be unique" });
    }
    candidateIds.add(candidate.id);
    if (candidateSeeds.has(candidate.seed)) {
      context.addIssue({ code: "custom", path: ["candidates", index, "seed"], message: "candidate seeds must be unique" });
    }
    candidateSeeds.add(candidate.seed);
    if (!plannedSeeds.has(candidate.seed)) {
      context.addIssue({
        code: "custom",
        path: ["candidates", index, "seed"],
        message: "candidate seed must belong to the generation plan"
      });
    }
    if (record.status === "succeeded"
      && (!candidate.plateSha256 || !candidate.reflectedSha256 || !candidate.evaluation)) {
      context.addIssue({
        code: "custom",
        path: ["candidates", index],
        message: "succeeded jobs require fully hashed and evaluated candidates"
      });
    }
  }
});

export type AIGenerationJobRecord = Readonly<z.infer<typeof aiGenerationJobRecordSchema>>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function parseAIParameterRecord(value: unknown): AIParameterRecord {
  return deepFreeze(parameterRecord.parse(value));
}

export function parseAIStylePlanRequestRecord(value: unknown): AIStylePlanRequestRecord {
  return deepFreeze(aiStylePlanRequestRecordSchema.parse(value));
}

export function parseAIWorkflowRecord(value: unknown): AIWorkflowRecord {
  return deepFreeze(aiWorkflowRecordSchema.parse(value));
}

export function parseComfySubmissionRecord(value: unknown): ComfySubmissionRecord {
  return deepFreeze(comfySubmissionRecordSchema.parse(value));
}

export function parseAIGenerationJobRecord(value: unknown): AIGenerationJobRecord {
  return deepFreeze(aiGenerationJobRecordSchema.parse(value));
}
