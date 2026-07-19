import type { ComfyExecutor } from "./contracts";
import { AIExecutionDisabledError } from "./policy";

export function createDisabledComfyExecutor(
  id = "disabled-comfy",
  kind: ComfyExecutor["kind"] = "local",
  version = 1
): ComfyExecutor {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error("Comfy executor id is invalid");
  if (!Number.isInteger(version) || version < 1) throw new Error("Comfy executor version must be positive");
  const reject = async (): Promise<never> => {
    throw new AIExecutionDisabledError();
  };
  return Object.freeze({
    id,
    version,
    kind,
    enabled: false,
    submit: () => reject(),
    inspect: () => reject(),
    cancel: () => reject()
  });
}

export const DISABLED_COMFY_EXECUTOR = createDisabledComfyExecutor();
