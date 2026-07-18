import { z } from "zod";

import { PUBLISHED_SCENE_IDS } from "@/domains/scenes/catalog";

export const sessionCreateSchema = z.object({ profileId: z.uuid().optional() }).strict();

const vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const sessionPatchSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    crop: z
      .object({
        centerX: z.number().min(0).max(1),
        centerY: z.number().min(0).max(1),
        scale: z.number().min(1).max(8)
      })
      .strict()
      .optional(),
    camera: z.object({ position: vec3Schema, target: vec3Schema }).strict().optional(),
    sceneId: z.enum(PUBLISHED_SCENE_IDS).optional()
  })
  .strict()
  .refine(
    (value) => value.crop !== undefined || value.camera !== undefined || value.sceneId !== undefined,
    "At least one editable field is required"
  );

export const revisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
export const resumeExchangeSchema = z.object({ resumeToken: z.string().min(40).max(100) }).strict();
