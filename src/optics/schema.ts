import { z } from "zod";

import { fnv1a64 } from "./checksum";
import type { OpticalProfile } from "./types";

const finiteNumber = z.number().finite();
const positiveDistance = finiteNumber.positive().max(10);
const vec3Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
const sampleSizeSchema = z.tuple([
  z.number().int().min(2).max(4096),
  z.number().int().min(2).max(4096)
]);
const checksum16Schema = z.string().regex(/^[0-9a-f]{16}$/);

export const opticalProfileSchema: z.ZodType<OpticalProfile> = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().trim().min(1).max(160),
    version: z.number().int().positive().max(1_000_000),
    status: z.enum(["draft", "published", "retired"]),
    units: z.literal("metres"),
    coordinateSystem: z
      .object({
        handedness: z.literal("right"),
        upAxis: z.literal("+Y"),
        platePlane: z.literal("XZ"),
        printUv: z.literal("+X,-Z")
      })
      .strict(),
    dish: z
      .object({
        radius: positiveDistance,
        sag: positiveDistance,
        sphereRadius: positiveDistance,
        center: vec3Schema
      })
      .strict(),
    cup: z
      .object({
        axisOrigin: vec3Schema,
        radialProfile: z
          .array(
            z
              .object({
                y: finiteNumber.min(-1).max(10),
                radius: positiveDistance
              })
              .strict()
          )
          .min(2)
          .max(512)
      })
      .strict(),
    designCamera: z
      .object({
        position: vec3Schema,
        target: vec3Schema,
        up: vec3Schema,
        verticalFovDegrees: finiteNumber.gt(1).lt(120),
        targetFrame: z
          .object({
            center: vec3Schema,
            width: positiveDistance,
            height: positiveDistance
          })
          .strict()
      })
      .strict(),
    mapping: z
      .object({
        targetSamples: sampleSizeSchema,
        lutSize: sampleSizeSchema,
        maxPlateEdge: positiveDistance,
        generatorVersion: z.string().trim().min(1).max(160)
      })
      .strict(),
    checksums: z
      .object({
        geometry: checksum16Schema,
        generator: checksum16Schema,
        lut: z.string().regex(/^[0-9a-f]{32}$/).optional()
      })
      .strict()
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.dish.sag >= profile.dish.radius) {
      context.addIssue({ code: "custom", path: ["dish", "sag"], message: "Dish sag must be smaller than its radius" });
    }
    if (profile.dish.sphereRadius <= profile.dish.radius) {
      context.addIssue({
        code: "custom",
        path: ["dish", "sphereRadius"],
        message: "Dish sphere radius must be larger than the printable radius"
      });
    }
    for (let index = 1; index < profile.cup.radialProfile.length; index += 1) {
      if (profile.cup.radialProfile[index].y <= profile.cup.radialProfile[index - 1].y) {
        context.addIssue({
          code: "custom",
          path: ["cup", "radialProfile", index, "y"],
          message: "Cup radial profile heights must increase strictly"
        });
      }
    }
    const cameraDelta = profile.designCamera.position.map(
      (value, index) => value - profile.designCamera.target[index]
    );
    if (cameraDelta.every((value) => Math.abs(value) < 1e-9)) {
      context.addIssue({ code: "custom", path: ["designCamera"], message: "Camera position and target must differ" });
    }
    if (profile.designCamera.up.every((value) => Math.abs(value) < 1e-9)) {
      context.addIssue({ code: "custom", path: ["designCamera", "up"], message: "Camera up vector must be non-zero" });
    }
    if (profile.mapping.maxPlateEdge > profile.dish.radius * 2) {
      context.addIssue({
        code: "custom",
        path: ["mapping", "maxPlateEdge"],
        message: "Maximum plate edge cannot exceed the dish diameter"
      });
    }

    const expectedGeometryChecksum = fnv1a64(
      JSON.stringify({ dish: profile.dish, cup: profile.cup, designCamera: profile.designCamera })
    );
    if (profile.checksums.geometry !== expectedGeometryChecksum) {
      context.addIssue({ code: "custom", path: ["checksums", "geometry"], message: "Geometry checksum does not match" });
    }
    if (profile.checksums.generator !== fnv1a64(profile.mapping.generatorVersion)) {
      context.addIssue({ code: "custom", path: ["checksums", "generator"], message: "Generator checksum does not match" });
    }
  });

export function parseOpticalProfile(input: unknown): OpticalProfile {
  return opticalProfileSchema.parse(input);
}
