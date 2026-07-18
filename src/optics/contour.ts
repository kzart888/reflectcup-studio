import { fnv1a64 } from "./checksum";
import type { TargetContourDocument, TargetContourPath, Vec2 } from "./types";

type GridPoint = readonly [number, number];
type Segment = readonly [GridPoint, GridPoint];

function pointKey(point: GridPoint): string {
  return `${point[0]},${point[1]}`;
}

function sample(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] !== 0;
}

/** Marching-squares segments in a doubled integer grid (odd coordinates are edge midpoints). */
function marchingSegments(mask: Uint8Array, width: number, height: number): Segment[] {
  const segments: Segment[] = [];
  const append = (x: number, y: number, first: "top" | "right" | "bottom" | "left", second: "top" | "right" | "bottom" | "left") => {
    const points = {
      top: [2 * x + 1, 2 * y] as const,
      right: [2 * x + 2, 2 * y + 1] as const,
      bottom: [2 * x + 1, 2 * y + 2] as const,
      left: [2 * x, 2 * y + 1] as const
    };
    segments.push([points[first], points[second]]);
  };

  for (let y = -1; y < height; y += 1) {
    for (let x = -1; x < width; x += 1) {
      const state = (sample(mask, width, height, x, y) ? 1 : 0) |
        (sample(mask, width, height, x + 1, y) ? 2 : 0) |
        (sample(mask, width, height, x + 1, y + 1) ? 4 : 0) |
        (sample(mask, width, height, x, y + 1) ? 8 : 0);
      switch (state) {
        case 1: append(x, y, "left", "top"); break;
        case 2: append(x, y, "top", "right"); break;
        case 3: append(x, y, "left", "right"); break;
        case 4: append(x, y, "right", "bottom"); break;
        // Resolve saddles as connected foreground, matching the 8-connected core component.
        case 5:
          append(x, y, "left", "bottom");
          append(x, y, "top", "right");
          break;
        case 6: append(x, y, "top", "bottom"); break;
        case 7: append(x, y, "left", "bottom"); break;
        case 8: append(x, y, "bottom", "left"); break;
        case 9: append(x, y, "bottom", "top"); break;
        case 10:
          append(x, y, "top", "left");
          append(x, y, "right", "bottom");
          break;
        case 11: append(x, y, "right", "bottom"); break;
        case 12: append(x, y, "right", "left"); break;
        case 13: append(x, y, "top", "right"); break;
        case 14: append(x, y, "left", "top"); break;
      }
    }
  }
  return segments;
}

function joinSegments(segments: readonly Segment[]): GridPoint[][] {
  const adjacency = new Map<string, GridPoint[]>();
  for (const [first, second] of segments) {
    const firstKey = pointKey(first);
    const secondKey = pointKey(second);
    adjacency.set(firstKey, [...(adjacency.get(firstKey) ?? []), second]);
    adjacency.set(secondKey, [...(adjacency.get(secondKey) ?? []), first]);
  }

  const consumed = new Set<string>();
  const edgeKey = (first: GridPoint, second: GridPoint) => {
    const a = pointKey(first);
    const b = pointKey(second);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  const loops: GridPoint[][] = [];
  for (const [start, initial] of segments) {
    if (consumed.has(edgeKey(start, initial))) continue;
    const loop: GridPoint[] = [start];
    let previous = start;
    let current = initial;
    consumed.add(edgeKey(previous, current));
    const maximumSteps = segments.length + 1;
    while (pointKey(current) !== pointKey(start) && loop.length <= maximumSteps) {
      loop.push(current);
      const neighbours = adjacency.get(pointKey(current)) ?? [];
      const next = neighbours.find((candidate) => (
        pointKey(candidate) !== pointKey(previous) && !consumed.has(edgeKey(current, candidate))
      )) ?? neighbours.find((candidate) => !consumed.has(edgeKey(current, candidate)));
      if (!next) break;
      previous = current;
      current = next;
      consumed.add(edgeKey(previous, current));
    }
    if (pointKey(current) === pointKey(start) && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function pointLineDistance(point: GridPoint, start: GridPoint, end: GridPoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplifyOpen(points: readonly GridPoint[], epsilon: number): GridPoint[] {
  if (points.length <= 2) return [...points];
  let maximum = 0;
  let split = -1;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(points[index], points[0], points.at(-1)!);
    if (distance > maximum) {
      maximum = distance;
      split = index;
    }
  }
  if (maximum <= epsilon || split < 0) return [points[0], points.at(-1)!];
  return [
    ...simplifyOpen(points.slice(0, split + 1), epsilon).slice(0, -1),
    ...simplifyOpen(points.slice(split), epsilon)
  ];
}

function simplifyClosed(points: readonly GridPoint[], epsilon: number): GridPoint[] {
  if (points.length <= 4) return [...points];
  let farthest = 1;
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = Math.hypot(points[index][0] - points[0][0], points[index][1] - points[0][1]);
    if (candidate > distance) {
      distance = candidate;
      farthest = index;
    }
  }
  const firstArc = simplifyOpen(points.slice(0, farthest + 1), epsilon);
  const secondArc = simplifyOpen([...points.slice(farthest), points[0]], epsilon);
  return [...firstArc.slice(0, -1), ...secondArc.slice(0, -1)];
}

function signedArea(points: readonly Vec2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function containsPoint(points: readonly Vec2[], point: Vec2): boolean {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const a = points[current];
    const b = points[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

export function buildTargetContourDocument(
  coreMask: Uint8Array,
  width: number,
  height: number
): TargetContourDocument {
  if (coreMask.length !== width * height) throw new Error("Target core mask dimensions do not match");
  const normalizedLoops = joinSegments(marchingSegments(coreMask, width, height))
    .map((loop) => simplifyClosed(loop, 1)) // doubled grid: 1 == half a source sample
    .filter((loop) => loop.length >= 3)
    .map((loop) => loop.map(([x, y]) => [
      Math.max(0, Math.min(1, x / 2 / (width - 1))),
      Math.max(0, Math.min(1, y / 2 / (height - 1)))
    ] as const));

  const paths: TargetContourPath[] = normalizedLoops
    .map((points, index, loops) => {
      const nesting = loops.reduce((count, candidate, candidateIndex) => (
        candidateIndex !== index && containsPoint(candidate, points[0]) ? count + 1 : count
      ), 0);
      return { role: nesting % 2 === 0 ? "outer" as const : "hole" as const, points };
    })
    .sort((left, right) => {
      if (left.role !== right.role) return left.role === "outer" ? -1 : 1;
      return Math.abs(signedArea(right.points)) - Math.abs(signedArea(left.points));
    });
  const content = {
    schemaVersion: 1 as const,
    coordinateSpace: "target-uv" as const,
    fillRule: "evenodd" as const,
    sourceSize: [width, height] as const,
    paths
  };
  return { ...content, checksum: fnv1a64(JSON.stringify(content)) };
}
