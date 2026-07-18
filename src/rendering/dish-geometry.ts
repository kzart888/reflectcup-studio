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
