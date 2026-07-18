import { describe, expect, it } from "vitest";

import { createCurvedCupOpticalProfile } from "@/optics";
import {
  CUP_HANDLE_RADIUS,
  CUP_WALL_THICKNESS,
  createCupHandleGeometry,
  createInnerCupProfile,
} from "@/rendering/cup-geometry";

describe("curved cup display geometry", () => {
  it("offsets every sampled inner-wall point by two millimetres", () => {
    const profile = createCurvedCupOpticalProfile();
    const inner = createInnerCupProfile(profile);

    expect(inner).toHaveLength(profile.cup.radialProfile.length);
    for (let index = 0; index < inner.length; index += 1) {
      const outer = profile.cup.radialProfile[index];
      const distance = Math.hypot(
        outer.radius - inner[index].radius,
        outer.y - inner[index].y,
      );
      expect(distance).toBeCloseTo(CUP_WALL_THICKNESS, 10);
      expect(inner[index].radius).toBeLessThan(outer.radius);
    }
  });

  it("keeps the C handle on the -X side and inside the plate rim", () => {
    const profile = createCurvedCupOpticalProfile();
    const handle = createCupHandleGeometry(profile);
    const positions = handle.getAttribute("position");
    const [cupX, , cupZ] = profile.cup.axisOrigin;
    let maximumPlateRadius = 0;
    let maximumLocalX = Number.NEGATIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const worldX = cupX + localX;
      const worldZ = cupZ + positions.getZ(index);
      maximumPlateRadius = Math.max(maximumPlateRadius, Math.hypot(worldX, worldZ));
      maximumLocalX = Math.max(maximumLocalX, localX);
      minimumY = Math.min(minimumY, positions.getY(index));
      maximumY = Math.max(maximumY, positions.getY(index));
    }

    expect(maximumLocalX).toBeLessThan(0);
    expect(maximumPlateRadius).toBeLessThanOrEqual(profile.dish.radius + 1e-6);
    expect(minimumY).toBeGreaterThan(profile.cup.radialProfile[0].y);
    expect(maximumY).toBeLessThan(profile.cup.radialProfile.at(-1)!.y);
    expect(handle.parameters.radius).toBe(CUP_HANDLE_RADIUS);
    handle.dispose();
  });
});
