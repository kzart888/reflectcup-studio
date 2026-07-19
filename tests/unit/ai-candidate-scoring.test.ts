import { describe, expect, it } from "vitest";

import {
  evaluateAICandidate,
  rankAICandidates,
  type AICandidateMeasurement
} from "@/domains/ai/candidate-scoring";

function measurement(overrides: Partial<AICandidateMeasurement> = {}): AICandidateMeasurement {
  return {
    candidateId: "candidate-1",
    seed: 10,
    scorer: { id: "reflectcup-metric-suite", version: 1 },
    metrics: {
      lowFrequencyMsSsim: 0.86,
      edgeF1: 0.76,
      lpips: 0.24,
      promptAlignmentRatio: 0.94,
      featureSimilarityGap: 0.2
    },
    ...overrides
  };
}

describe("AI candidate acceptance and ranking", () => {
  it("accepts a candidate only when every provisional gate passes", () => {
    const result = evaluateAICandidate(measurement());
    expect(result.accepted).toBe(true);
    expect(result.scorer).toEqual({ id: "reflectcup-metric-suite", version: 1 });
    expect(result.thresholdPolicy).toMatchObject({ id: "reflectcup-provisional-acceptance", version: 1 });
    expect(result.failedGates).toEqual([]);
    expect(result.aggregateScore).toBeGreaterThan(0);
    expect(result.aggregateScore).toBeLessThanOrEqual(1);
  });

  it("reports every failed optical, naturalness and leakage gate", () => {
    const result = evaluateAICandidate(measurement({
      metrics: {
        lowFrequencyMsSsim: 0.7,
        edgeF1: 0.6,
        lpips: 0.4,
        promptAlignmentRatio: 0.8,
        featureSimilarityGap: 0.1
      }
    }));
    expect(result.accepted).toBe(false);
    expect(result.failedGates).toEqual([
      "low-frequency-ms-ssim",
      "edge-f1",
      "lpips",
      "prompt-alignment",
      "reflection-leakage-gap"
    ]);
  });

  it("applies exact OCR only to requests that explicitly require it", () => {
    expect(evaluateAICandidate(measurement({ requireExactOcr: false })).accepted).toBe(true);
    const required = evaluateAICandidate(measurement({ requireExactOcr: true }));
    expect(required.accepted).toBe(false);
    expect(required.failedGates).toContain("exact-ocr");
    expect(evaluateAICandidate(measurement({
      requireExactOcr: true,
      metrics: { ...measurement().metrics, exactOcrMatch: true }
    })).accepted).toBe(true);
  });

  it("ranks accepted candidates first and uses stable seed/id tie-breaks", () => {
    const acceptedB = evaluateAICandidate(measurement({ candidateId: "b", seed: 11 }));
    const acceptedA = evaluateAICandidate(measurement({ candidateId: "a", seed: 11 }));
    const acceptedEarlierSeed = evaluateAICandidate(measurement({ candidateId: "z", seed: 9 }));
    const rejected = evaluateAICandidate(measurement({
      candidateId: "high-but-rejected",
      seed: 1,
      requireExactOcr: true
    }));
    expect(rankAICandidates([rejected, acceptedB, acceptedA, acceptedEarlierSeed]).map((item) => item.candidateId))
      .toEqual(["z", "a", "b", "high-but-rejected"]);
  });

  it("rejects non-finite or out-of-domain measurements", () => {
    expect(() => evaluateAICandidate(measurement({
      metrics: { ...measurement().metrics, lpips: Number.NaN }
    }))).toThrow("lpips");
    expect(() => evaluateAICandidate(measurement({
      metrics: { ...measurement().metrics, featureSimilarityGap: 1.1 }
    }))).toThrow("featureSimilarityGap");
    expect(() => evaluateAICandidate(measurement({ seed: -1 }))).toThrow("unsigned 32-bit");
    expect(() => evaluateAICandidate(measurement(), {
      id: "test-thresholds",
      version: 1,
      values: {
        lowFrequencyMsSsim: 2,
        edgeF1: 0.7,
        lpips: 0.3,
        promptAlignmentRatio: 0.9,
        featureSimilarityGap: 0.15
      }
    })).toThrow("threshold.lowFrequencyMsSsim");
    expect(() => evaluateAICandidate(measurement({
      scorer: { id: "INVALID", version: 1 }
    }))).toThrow("scorer identity");
  });
});
