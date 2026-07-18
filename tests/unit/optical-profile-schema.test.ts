import { describe, expect, it } from "vitest";

import { createNominalOpticalProfile, generateOpticalProfile, opticalProfileSchema } from "@/optics";

describe("strict optical profile schema", () => {
  it("accepts the generated nominal seed document", () => {
    const generated = generateOpticalProfile(createNominalOpticalProfile({ status: "published" }));
    expect(opticalProfileSchema.parse(generated.profile)).toEqual(generated.profile);
  });

  it("rejects unknown fields and coordinate conventions", () => {
    const generated = generateOpticalProfile(createNominalOpticalProfile());
    expect(opticalProfileSchema.safeParse({ ...generated.profile, unexpected: true }).success).toBe(false);
    expect(
      opticalProfileSchema.safeParse({
        ...generated.profile,
        coordinateSystem: { ...generated.profile.coordinateSystem, printUv: "+X,+Z" }
      }).success
    ).toBe(false);
  });

  it("rejects geometry or generator changes whose checksums were not updated", () => {
    const generated = generateOpticalProfile(createNominalOpticalProfile());
    expect(
      opticalProfileSchema.safeParse({
        ...generated.profile,
        dish: { ...generated.profile.dish, radius: generated.profile.dish.radius + 0.001 }
      }).success
    ).toBe(false);
    expect(
      opticalProfileSchema.safeParse({
        ...generated.profile,
        mapping: { ...generated.profile.mapping, generatorVersion: "tampered-generator" }
      }).success
    ).toBe(false);
  });
});
