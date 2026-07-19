/**
 * Track A is intentionally an internal scaffold. These values are constants,
 * not environment-controlled feature flags, so deploying this commit cannot
 * accidentally expose AI controls or start network work.
 */
export const AI_TRACK_A_POLICY = Object.freeze({
  schemaVersion: 1 as const,
  stage: "internal-scaffold" as const,
  customerControlsEnabled: false as const,
  executionEnabled: false as const,
  networkExecutionEnabled: false as const
});

export class AIExecutionDisabledError extends Error {
  readonly code = "AI_EXECUTION_DISABLED";

  constructor(message = "AI generation is disabled in this build") {
    super(message);
    this.name = "AIExecutionDisabledError";
  }
}

export function assertAIExecutionEnabled(): never {
  throw new AIExecutionDisabledError();
}
