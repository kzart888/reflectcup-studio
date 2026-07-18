import { describe, expect, it } from "vitest";
import {
  createNominalOpticalProfile,
  DISH_REFLECTION_GLSL,
  dot3,
  intersectDishCap,
  intersectRadialCup,
  length3,
  normalize3,
  plateUvToWorldPoint,
  reflect3,
  solveQuadratic,
  traceTargetToPlate,
  worldPointToPlateUv
} from "@/optics";

describe("optical vector and intersection math", () => {
  it("solves quadratics without losing root ordering", () => {
    expect(solveQuadratic(1, -5, 6)).toEqual([2, 3]);
    expect(solveQuadratic(0, 2, -8)).toEqual([4]);
    expect(solveQuadratic(1, 0, 1)).toEqual([]);
  });

  it("preserves ray length and reflection angle", () => {
    const incident = normalize3([-1, -0.5, 0.2]);
    const normal = normalize3([1, 0, 0]);
    const reflected = reflect3(incident, normal);
    expect(length3(reflected)).toBeCloseTo(1, 12);
    expect(Math.abs(dot3(incident, normal))).toBeCloseTo(Math.abs(dot3(reflected, normal)), 12);
    expect(reflected[0]).toBeGreaterThan(0);
    expect(reflected[1]).toBeLessThan(0);
  });

  it("intersects a piecewise radial cup and returns its analytic normal", () => {
    const hit = intersectRadialCup(
      { origin: [2, 0.5, 0], direction: [-1, 0, 0] },
      {
        axisOrigin: [0, 0, 0],
        radialProfile: [{ y: 0, radius: 1 }, { y: 1, radius: 1 }]
      }
    );
    expect(hit).not.toBeNull();
    expect(hit?.distance).toBeCloseTo(1, 12);
    expect(hit?.point).toEqual([1, 0.5, 0]);
    expect(hit?.normal[0]).toBeCloseTo(1, 12);
    expect(hit?.normal[1]).toBeCloseTo(0, 12);
    expect(hit?.normal[2]).toBeCloseTo(0, 12);
  });

  it("uses the measured spherical-cap sag and invertible print UV convention", () => {
    const { dish } = createNominalOpticalProfile();
    const center = plateUvToWorldPoint([0.5, 0.5], dish);
    const rim = plateUvToWorldPoint([1, 0.5], dish);
    expect(center?.[1]).toBeCloseTo(0, 10);
    expect(rim?.[1]).toBeCloseTo(dish.sag, 6);
    expect(rim && worldPointToPlateUv(rim, dish)).toEqual([1, 0.5]);

    const downwardRay = {
      origin: [dish.radius, 0.1, 0] as const,
      direction: [0, -1, 0] as const
    };
    const hit = intersectDishCap(downwardRay, dish);
    expect(hit?.point[1]).toBeCloseTo(dish.sag, 6);
    expect(hit?.normal[1]).toBeGreaterThan(0.97);
  });

  it("traces the nominal design-frame centre from camera to cup and dish", () => {
    const profile = createNominalOpticalProfile();
    const sample = traceTargetToPlate(profile, [0.5, 0.5]);
    expect(sample).not.toBeNull();
    expect(sample?.cupPoint[0]).toBeCloseTo(0.01, 5);
    expect(sample?.plateUv[0]).toBeGreaterThan(0.5);
    expect(sample?.plateUv[0]).toBeLessThanOrEqual(1);
    expect(sample?.plateUv[1]).toBeCloseTo(0.5, 5);
  });

  it("publishes the exact CPU print-UV convention for the cup shader", () => {
    expect(DISH_REFLECTION_GLSL).toContain("0.5 - local.y");
    expect(DISH_REFLECTION_GLSL).toContain("dishCenter + vec3(0.0, sphereRadius, 0.0)");
  });
});
