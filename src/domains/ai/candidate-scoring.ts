import type { OpticalCandidateScorer } from "./contracts";

export type AICandidateMetrics = Readonly<{
  lowFrequencyMsSsim: number;
  edgeF1: number;
  lpips: number;
  promptAlignmentRatio: number;
  featureSimilarityGap: number;
  exactOcrMatch?: boolean;
}>;

export type AIAcceptanceThresholds = Readonly<{
  lowFrequencyMsSsim: number;
  edgeF1: number;
  lpips: number;
  promptAlignmentRatio: number;
  featureSimilarityGap: number;
}>;

export type AICandidateScorerIdentity = Readonly<{
  id: string;
  version: number;
}>;

export type AIAcceptanceThresholdPolicy = Readonly<{
  id: string;
  version: number;
  values: AIAcceptanceThresholds;
}>;

export const PROVISIONAL_AI_ACCEPTANCE_POLICY: AIAcceptanceThresholdPolicy = Object.freeze({
  id: "reflectcup-provisional-acceptance",
  version: 1,
  values: Object.freeze({
    lowFrequencyMsSsim: 0.8,
    edgeF1: 0.7,
    lpips: 0.3,
    promptAlignmentRatio: 0.9,
    featureSimilarityGap: 0.15
  })
});

export const PROVISIONAL_AI_ACCEPTANCE_THRESHOLDS = PROVISIONAL_AI_ACCEPTANCE_POLICY.values;

export type AICandidateMeasurement = Readonly<{
  candidateId: string;
  seed: number;
  scorer: AICandidateScorerIdentity;
  metrics: AICandidateMetrics;
  requireExactOcr?: boolean;
}>;

export type AICandidateEvaluation = Readonly<AICandidateMeasurement & {
  requireExactOcr: boolean;
  thresholdPolicy: AIAcceptanceThresholdPolicy;
  accepted: boolean;
  aggregateScore: number;
  failedGates: readonly string[];
}>;

export type AICandidateMetricScorer = OpticalCandidateScorer<AICandidateMetrics>;

function assertUnitMetric(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number between 0 and 1`);
  }
}

export function evaluateAICandidate(
  measurement: AICandidateMeasurement,
  thresholdPolicy: AIAcceptanceThresholdPolicy = PROVISIONAL_AI_ACCEPTANCE_POLICY
): AICandidateEvaluation {
  if (!measurement.candidateId) throw new Error("candidateId is required");
  if (!Number.isInteger(measurement.seed) || measurement.seed < 0 || measurement.seed > 0xffff_ffff) {
    throw new Error("candidate seed must be an unsigned 32-bit integer");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(measurement.scorer.id)
    || !Number.isInteger(measurement.scorer.version)
    || measurement.scorer.version < 1) {
    throw new Error("candidate scorer identity is invalid");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(thresholdPolicy.id)
    || !Number.isInteger(thresholdPolicy.version)
    || thresholdPolicy.version < 1) {
    throw new Error("candidate threshold policy identity is invalid");
  }
  const thresholds = thresholdPolicy.values;
  assertUnitMetric(thresholds.lowFrequencyMsSsim, "threshold.lowFrequencyMsSsim");
  assertUnitMetric(thresholds.edgeF1, "threshold.edgeF1");
  assertUnitMetric(thresholds.lpips, "threshold.lpips");
  if (!Number.isFinite(thresholds.promptAlignmentRatio) || thresholds.promptAlignmentRatio < 0) {
    throw new Error("threshold.promptAlignmentRatio must be a non-negative finite number");
  }
  if (!Number.isFinite(thresholds.featureSimilarityGap)
    || thresholds.featureSimilarityGap < -1
    || thresholds.featureSimilarityGap > 1) {
    throw new Error("threshold.featureSimilarityGap must be between -1 and 1");
  }
  assertUnitMetric(measurement.metrics.lowFrequencyMsSsim, "lowFrequencyMsSsim");
  assertUnitMetric(measurement.metrics.edgeF1, "edgeF1");
  assertUnitMetric(measurement.metrics.lpips, "lpips");
  if (!Number.isFinite(measurement.metrics.promptAlignmentRatio) || measurement.metrics.promptAlignmentRatio < 0) {
    throw new Error("promptAlignmentRatio must be a non-negative finite number");
  }
  if (!Number.isFinite(measurement.metrics.featureSimilarityGap)
    || measurement.metrics.featureSimilarityGap < -1
    || measurement.metrics.featureSimilarityGap > 1) {
    throw new Error("featureSimilarityGap must be between -1 and 1");
  }

  const failedGates: string[] = [];
  if (measurement.metrics.lowFrequencyMsSsim < thresholds.lowFrequencyMsSsim) failedGates.push("low-frequency-ms-ssim");
  if (measurement.metrics.edgeF1 < thresholds.edgeF1) failedGates.push("edge-f1");
  if (measurement.metrics.lpips > thresholds.lpips) failedGates.push("lpips");
  if (measurement.metrics.promptAlignmentRatio < thresholds.promptAlignmentRatio) failedGates.push("prompt-alignment");
  if (measurement.metrics.featureSimilarityGap < thresholds.featureSimilarityGap) failedGates.push("reflection-leakage-gap");
  if (measurement.requireExactOcr && measurement.metrics.exactOcrMatch !== true) failedGates.push("exact-ocr");

  const aggregateScore = Math.max(0, Math.min(1,
    measurement.metrics.lowFrequencyMsSsim * 0.3
    + measurement.metrics.edgeF1 * 0.25
    + (1 - measurement.metrics.lpips) * 0.2
    + Math.min(1, measurement.metrics.promptAlignmentRatio) * 0.15
    + ((measurement.metrics.featureSimilarityGap + 1) / 2) * 0.1
  ));
  return Object.freeze({
    candidateId: measurement.candidateId,
    seed: measurement.seed,
    scorer: Object.freeze({ ...measurement.scorer }),
    metrics: Object.freeze({ ...measurement.metrics }),
    requireExactOcr: measurement.requireExactOcr === true,
    thresholdPolicy: Object.freeze({
      id: thresholdPolicy.id,
      version: thresholdPolicy.version,
      values: Object.freeze({ ...thresholds })
    }),
    accepted: failedGates.length === 0,
    aggregateScore,
    failedGates: Object.freeze(failedGates)
  });
}

/** Accepted candidates rank first; deterministic seed/id tie-breaks make reruns auditable. */
export function rankAICandidates(candidates: readonly AICandidateEvaluation[]): readonly AICandidateEvaluation[] {
  return Object.freeze([...candidates].sort((left, right) =>
    Number(right.accepted) - Number(left.accepted)
    || right.aggregateScore - left.aggregateScore
    || left.seed - right.seed
    || left.candidateId.localeCompare(right.candidateId)
  ));
}
