import * as THREE from "three";
import type { OpticalProfile } from "@/optics";

export function createDishGeometry(profile: OpticalProfile, radialSegments = 42, angularSegments = 128): THREE.BufferGeometry {
  const { radius, sphereRadius, center } = profile.dish;
  const sphereCenterY = center[1] + sphereRadius;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= radialSegments; ring += 1) {
    const radial = (ring / radialSegments) * radius;
    const y = sphereCenterY - Math.sqrt(sphereRadius * sphereRadius - radial * radial);
    for (let segment = 0; segment <= angularSegments; segment += 1) {
      const angle = (segment / angularSegments) * Math.PI * 2;
      const x = Math.cos(angle) * radial;
      const z = Math.sin(angle) * radial;
      positions.push(x, y, z);
      const normal = new THREE.Vector3(-x, sphereCenterY - y, -z).normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(x / (radius * 2) + 0.5, 0.5 - z / (radius * 2));
    }
  }

  const stride = angularSegments + 1;
  for (let ring = 0; ring < radialSegments; ring += 1) {
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const a = ring * stride + segment;
      const b = a + 1;
      const c = (ring + 1) * stride + segment + 1;
      const d = (ring + 1) * stride + segment;
      // Counter-clockwise from above (+Y). The previous winding faced the
      // underside of the dish, so WebGL's default back-face culling made the
      // printable surface disappear from the customer camera.
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createDishSolidGeometry(
  profile: OpticalProfile,
  thickness = 0.002,
  radialSegments = 42,
  angularSegments = 128,
): THREE.BufferGeometry {
  const top = createDishGeometry(profile, radialSegments, angularSegments);
  const topPositions = top.getAttribute("position") as THREE.BufferAttribute;
  const topNormals = top.getAttribute("normal") as THREE.BufferAttribute;
  const topUvs = top.getAttribute("uv") as THREE.BufferAttribute;
  const topIndex = top.getIndex()!;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < topPositions.count; index += 1) {
    positions.push(topPositions.getX(index), topPositions.getY(index), topPositions.getZ(index));
    normals.push(topNormals.getX(index), topNormals.getY(index), topNormals.getZ(index));
    uvs.push(topUvs.getX(index), topUvs.getY(index));
  }
  for (let index = 0; index < topIndex.count; index += 1) indices.push(topIndex.getX(index));

  const bottomOffset = positions.length / 3;
  for (let index = 0; index < topPositions.count; index += 1) {
    positions.push(topPositions.getX(index), topPositions.getY(index) - thickness, topPositions.getZ(index));
    normals.push(-topNormals.getX(index), -topNormals.getY(index), -topNormals.getZ(index));
    uvs.push(topUvs.getX(index), topUvs.getY(index));
  }
  for (let index = 0; index < topIndex.count; index += 3) {
    const a = topIndex.getX(index) + bottomOffset;
    const b = topIndex.getX(index + 1) + bottomOffset;
    const c = topIndex.getX(index + 2) + bottomOffset;
    indices.push(a, c, b);
  }

  const stride = angularSegments + 1;
  const outerStart = radialSegments * stride;
  for (let segment = 0; segment <= angularSegments; segment += 1) {
    const topVertex = outerStart + segment;
    const x = topPositions.getX(topVertex);
    const z = topPositions.getZ(topVertex);
    const y = topPositions.getY(topVertex);
    const radial = new THREE.Vector3(x, 0, z).normalize();
    positions.push(x, y, z, x, y - thickness, z);
    normals.push(radial.x, 0, radial.z, radial.x, 0, radial.z);
    uvs.push(segment / angularSegments, 1, segment / angularSegments, 0);
  }
  const sideOffset = bottomOffset * 2;
  for (let segment = 0; segment < angularSegments; segment += 1) {
    const a = sideOffset + segment * 2;
    const b = a + 1;
    const c = a + 3;
    const d = a + 2;
    indices.push(a, b, c, a, c, d);
  }

  top.dispose();
  const solid = new THREE.BufferGeometry();
  solid.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  solid.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  solid.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  solid.setIndex(indices);
  solid.computeBoundingSphere();
  return solid;
}
