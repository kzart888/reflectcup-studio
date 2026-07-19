"use client";

import { RoundedBox } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { SceneQuality } from "@/lib/contracts";
import type { SceneDescriptor } from "@/scenes/catalog";

type SceneBackdropProps = {
  descriptor: SceneDescriptor;
  quality: SceneQuality;
};

const TABLE_TOP_Y = -0.0028;

function configureTexture(
  texture: THREE.Texture,
  colorSpace: THREE.ColorSpace,
  repeat: readonly [number, number],
): THREE.Texture {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function useConfiguredTexture(
  source: THREE.Texture,
  colorSpace: THREE.ColorSpace,
  repeat: readonly [number, number],
): THREE.Texture {
  const texture = useMemo(() => configureTexture(source.clone(), colorSpace, repeat), [colorSpace, repeat, source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function ColorTableMaterial({ url, repeat, tint, roughness }: {
  url: string;
  repeat: readonly [number, number];
  tint: string;
  roughness: number;
}) {
  const source = useLoader(THREE.TextureLoader, url);
  const color = useConfiguredTexture(source, THREE.SRGBColorSpace, repeat);
  return <meshStandardMaterial map={color} color={tint} roughness={roughness} metalness={0.01} envMapIntensity={0.72} />;
}

function DetailedTableMaterial({ urls, repeat, tint, roughness }: {
  urls: readonly [string, string, string];
  repeat: readonly [number, number];
  tint: string;
  roughness: number;
}) {
  const colorSource = useLoader(THREE.TextureLoader, urls[0]);
  const normalSource = useLoader(THREE.TextureLoader, urls[1]);
  const roughnessSource = useLoader(THREE.TextureLoader, urls[2]);
  const color = useConfiguredTexture(colorSource, THREE.SRGBColorSpace, repeat);
  const normal = useConfiguredTexture(normalSource, THREE.NoColorSpace, repeat);
  const roughnessMap = useConfiguredTexture(roughnessSource, THREE.NoColorSpace, repeat);
  return (
    <meshStandardMaterial
      map={color}
      normalMap={normal}
      normalScale={new THREE.Vector2(0.32, 0.32)}
      roughnessMap={roughnessMap}
      color={tint}
      roughness={roughness}
      metalness={0.01}
      envMapIntensity={0.76}
    />
  );
}

function WoodTable({ descriptor, quality, kind }: {
  descriptor: SceneDescriptor;
  quality: SceneQuality;
  kind: "oak" | "walnut";
}) {
  const colorUrl = descriptor.assetUrls[`${kind}-color`];
  const normalUrl = descriptor.assetUrls[`${kind}-normal`];
  const roughnessUrl = descriptor.assetUrls[`${kind}-roughness`];
  const repeat = kind === "oak" ? [2.4, 3.2] as const : [2.8, 4.2] as const;
  const tint = kind === "oak" ? "#e0b781" : "#a5785d";
  return (
    <group>
      <RoundedBox args={[1.42, 0.065, 1.82]} radius={0.022} smoothness={quality === "low" ? 2 : 4} position={[0, TABLE_TOP_Y - 0.0325, 0]}>
        {quality === "low"
          ? <ColorTableMaterial url={colorUrl} repeat={repeat} tint={tint} roughness={kind === "oak" ? 0.5 : 0.58} />
          : <DetailedTableMaterial urls={[colorUrl, normalUrl, roughnessUrl]} repeat={repeat} tint={tint} roughness={kind === "oak" ? 0.48 : 0.56} />}
      </RoundedBox>
      <mesh position={[0, -0.39, 0]}>
        <boxGeometry args={[1.18, 0.72, 1.45]} />
        <meshStandardMaterial color={kind === "oak" ? "#7b4f2c" : "#35251f"} roughness={0.74} />
      </mesh>
    </group>
  );
}

function BakedTableShadow({ descriptor }: { descriptor: SceneDescriptor }) {
  const source = useLoader(THREE.TextureLoader, descriptor.tableShadow.url);
  const texture = useMemo(() => {
    const result = source.clone();
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = THREE.ClampToEdgeWrapping;
    result.wrapT = THREE.ClampToEdgeWrapping;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.needsUpdate = true;
    return result;
  }, [source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      position={[descriptor.tableShadow.offset[0], TABLE_TOP_Y + 0.00015, descriptor.tableShadow.offset[1]]}
      rotation={[-Math.PI / 2, 0, descriptor.tableShadow.rotation]}
      renderOrder={1}
    >
      <planeGeometry args={[descriptor.tableShadow.size[0], descriptor.tableShadow.size[1]]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        opacity={descriptor.tableShadow.opacity}
        toneMapped={false}
      />
    </mesh>
  );
}

function HomeRoom({ descriptor, quality }: { descriptor: SceneDescriptor; quality: SceneQuality }) {
  const oakSource = useLoader(THREE.TextureLoader, descriptor.assetUrls["oak-color"]);
  const oakColor = useConfiguredTexture(oakSource, THREE.SRGBColorSpace, [1.4, 2]);
  const wall = <meshStandardMaterial color="#e8dfd1" roughness={0.93} side={THREE.DoubleSide} envMapIntensity={0.2} />;
  const trim = <meshStandardMaterial map={oakColor} color="#8c5c34" roughness={0.58} envMapIntensity={0.45} />;
  return (
    <group>
      <mesh position={[-1.52, 0.25, 0]}>
        <boxGeometry args={[0.05, 2.05, 3.5]} />{wall}
      </mesh>
      <mesh position={[-1.485, -0.48, 0]}>
        <boxGeometry args={[0.025, 0.52, 3.48]} />{trim}
      </mesh>
      <group position={[-1.475, 0.46, 0.58]}>
        <mesh>
          <boxGeometry args={[0.028, 0.94, 1.08]} />
          <meshBasicMaterial color="#b8d0cf" toneMapped={false} />
        </mesh>
        <mesh position={[0.026, 0.5, 0]}><boxGeometry args={[0.07, 0.07, 1.2]} />{trim}</mesh>
        <mesh position={[0.026, -0.5, 0]}><boxGeometry args={[0.07, 0.07, 1.2]} />{trim}</mesh>
        <mesh position={[0.026, 0, -0.56]}><boxGeometry args={[0.07, 1.06, 0.07]} />{trim}</mesh>
        <mesh position={[0.026, 0, 0.56]}><boxGeometry args={[0.07, 1.06, 0.07]} />{trim}</mesh>
        <mesh position={[0.03, 0, 0]}><boxGeometry args={[0.075, 0.98, 0.045]} />{trim}</mesh>
        <mesh position={[0.03, 0, 0]}><boxGeometry args={[0.075, 0.045, 1.12]} />{trim}</mesh>
      </group>
      <RoundedBox args={[0.42, 0.18, 1.42]} radius={0.045} smoothness={quality === "low" ? 2 : 4} position={[-1.2, -0.49, -0.28]}>
        <meshStandardMaterial color="#b6aa91" roughness={0.92} envMapIntensity={0.18} />
      </RoundedBox>
      <RoundedBox args={[0.17, 0.42, 0.58]} radius={0.045} smoothness={quality === "low" ? 2 : 4} position={[-1.34, -0.19, 0.05]} rotation={[0, 0, -0.05]}>
        <meshStandardMaterial color="#7f8968" roughness={0.96} envMapIntensity={0.12} />
      </RoundedBox>
      <RoundedBox args={[0.17, 0.37, 0.5]} radius={0.045} smoothness={quality === "low" ? 2 : 4} position={[-1.33, -0.22, -0.55]} rotation={[0.05, 0, 0.04]}>
        <meshStandardMaterial color="#d4c7b4" roughness={0.95} envMapIntensity={0.12} />
      </RoundedBox>
      <mesh position={[-1.33, -0.3, -1.28]}>
        <boxGeometry args={[0.28, 0.9, 0.48]} />
        <meshStandardMaterial map={oakColor} color="#724624" roughness={0.62} />
      </mesh>
      <group position={[0.43, 0.035, -0.5]}>
        <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[0.045, 0.035, 0.07, 20]} /><meshStandardMaterial color="#d8d0c4" roughness={0.42} /></mesh>
        <mesh position={[0, 0.14, 0]}><sphereGeometry args={[0.09, 16, 10]} /><meshStandardMaterial color="#62725a" roughness={0.9} /></mesh>
      </group>
    </group>
  );
}

const TREE_POSITIONS: readonly (readonly [number, number, number, number, number])[] = [
  [-1.65, 0.82, -1.18, 1.15, -0.08], [-1.72, 0.78, -0.38, 0.95, 0.04], [-1.55, 0.88, 0.58, 1.2, 0.03],
  [-1.82, 0.92, 1.35, 1.3, -0.06], [-0.78, 0.78, -1.62, 0.9, 0.05], [-0.1, 0.86, -1.82, 1.16, -0.03],
  [0.72, 0.8, -1.72, 0.86, 0.04], [1.42, 0.9, -1.42, 1.18, 0.02], [1.73, 0.78, -0.58, 0.92, -0.04],
  [1.68, 0.86, 0.34, 1.08, 0.04], [1.42, 0.82, 1.28, 1.0, -0.03], [0.64, 0.9, 1.72, 1.22, 0.05],
  [-0.2, 0.78, 1.84, 0.92, -0.04], [-0.94, 0.88, 1.68, 1.15, 0.02], [-2.1, 0.95, 0.05, 1.25, 0.03],
  [2.04, 0.94, 0.88, 1.3, -0.05], [0.2, 0.9, -2.18, 1.25, 0.04], [-0.45, 0.86, 2.18, 1.1, -0.03],
  [2.22, 0.82, -0.08, 0.95, 0.02], [-2.12, 0.84, -0.88, 1.0, -0.04], [1.1, 0.9, 2.02, 1.2, 0.03],
  [-1.45, 0.82, 2.0, 1.0, -0.02], [2.26, 0.9, -1.1, 1.18, 0.04], [-2.28, 0.92, 1.06, 1.22, -0.04],
];

function SimpleBarkMaterial({ descriptor }: { descriptor: SceneDescriptor }) {
  const colorSource = useLoader(THREE.TextureLoader, descriptor.assetUrls["bark-color"]);
  const color = useConfiguredTexture(colorSource, THREE.SRGBColorSpace, [1.2, 3.5]);
  return (
    <meshStandardMaterial
      map={color}
      color="#966e52"
      roughness={0.88}
      emissive="#160f0b"
      emissiveIntensity={0.18}
      envMapIntensity={0.34}
    />
  );
}

function DetailedBarkMaterial({ descriptor }: { descriptor: SceneDescriptor }) {
  const colorSource = useLoader(THREE.TextureLoader, descriptor.assetUrls["bark-color"]);
  const normalSource = useLoader(THREE.TextureLoader, descriptor.assetUrls["bark-normal"]);
  const roughnessSource = useLoader(THREE.TextureLoader, descriptor.assetUrls["bark-roughness"]);
  const color = useConfiguredTexture(colorSource, THREE.SRGBColorSpace, [1.2, 3.5]);
  const normal = useConfiguredTexture(normalSource, THREE.NoColorSpace, [1.2, 3.5]);
  const roughness = useConfiguredTexture(roughnessSource, THREE.NoColorSpace, [1.2, 3.5]);
  return (
    <meshStandardMaterial
      map={color}
      normalMap={normal}
      normalScale={new THREE.Vector2(0.42, 0.42)}
      roughnessMap={roughness}
      color="#966e52"
      roughness={0.88}
      emissive="#160f0b"
      emissiveIntensity={0.18}
      envMapIntensity={0.34}
    />
  );
}

function BarkMaterial({ descriptor, detailed }: { descriptor: SceneDescriptor; detailed: boolean }) {
  return detailed
    ? <DetailedBarkMaterial descriptor={descriptor} />
    : <SimpleBarkMaterial descriptor={descriptor} />;
}

function ForestTrees({ descriptor, quality }: { descriptor: SceneDescriptor; quality: SceneQuality }) {
  const count = TREE_POSITIONS.length;
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    for (let index = 0; index < count; index += 1) {
      const [x, heightJitter, z, scale, tilt] = TREE_POSITIONS[index];
      dummy.position.set(x, -0.75 + 0.91 * scale, z);
      dummy.rotation.set(tilt, index * 0.43, tilt * 0.6);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.current?.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, -0.75 + 1.72 * scale + (heightJitter - 0.85) * 0.24, z);
      dummy.rotation.set(tilt * 0.4, index * 0.71, tilt * 0.35);
      dummy.scale.set(0.46 * scale, 0.62 * scale, 0.46 * scale);
      dummy.updateMatrix();
      crowns.current?.setMatrixAt(index, dummy.matrix);
    }
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    if (crowns.current) crowns.current.instanceMatrix.needsUpdate = true;
  }, [count]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, count]} frustumCulled>
        <cylinderGeometry args={[0.065, 0.12, 1.82, quality === "low" ? 7 : 10, 1]} />
        <BarkMaterial descriptor={descriptor} detailed={quality === "high"} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, count]} frustumCulled>
        <dodecahedronGeometry args={[1, quality === "high" ? 1 : 0]} />
        <meshStandardMaterial color="#354735" roughness={1} emissive="#111b12" emissiveIntensity={0.16} envMapIntensity={0.18} />
      </instancedMesh>
    </>
  );
}

function Tent() {
  const geometry = useMemo(() => {
    const vertices = new Float32Array([
      -0.42, 0, -0.32, 0, 0.58, -0.32, 0.42, 0, -0.32,
      -0.42, 0, 0.32, 0, 0.58, 0.32, 0.42, 0, 0.32,
    ]);
    const indices = [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 3, 5, 0, 5, 2];
    const shape = new THREE.BufferGeometry();
    shape.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    shape.setIndex(indices);
    shape.computeVertexNormals();
    return shape;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[-1.28, -0.75, -0.78]} rotation={[0, 0.18, 0]}>
      <meshStandardMaterial color="#62594d" roughness={0.92} side={THREE.DoubleSide} envMapIntensity={0.25} />
    </mesh>
  );
}

function CampChair() {
  return (
    <group position={[-1.05, -0.56, 0.72]} rotation={[0, -0.28, 0]}>
      <mesh position={[0, 0.12, 0]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[0.38, 0.025, 0.4]} />
        <meshStandardMaterial color="#33322d" roughness={0.86} />
      </mesh>
      <mesh position={[-0.18, -0.08, 0]} rotation={[0, 0, -0.14]}><cylinderGeometry args={[0.012, 0.012, 0.58, 8]} /><meshStandardMaterial color="#3b2b22" roughness={0.62} /></mesh>
      <mesh position={[0.18, -0.08, 0]} rotation={[0, 0, 0.14]}><cylinderGeometry args={[0.012, 0.012, 0.58, 8]} /><meshStandardMaterial color="#3b2b22" roughness={0.62} /></mesh>
      <mesh position={[0, 0.42, 0.17]} rotation={[0.24, 0, 0]}>
        <boxGeometry args={[0.4, 0.42, 0.025]} />
        <meshStandardMaterial color="#2d302c" roughness={0.9} />
      </mesh>
    </group>
  );
}

function ForestCamp({ descriptor, quality }: { descriptor: SceneDescriptor; quality: SceneQuality }) {
  return (
    <group>
      <mesh position={[0, -0.755, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.7, 64]} />
        <meshStandardMaterial color="#263127" roughness={1} envMapIntensity={0.12} />
      </mesh>
      <ForestTrees descriptor={descriptor} quality={quality} />
      <Tent />
      <CampChair />
      <group position={[0.4, 0.045, -0.48]}>
        <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.045, 0.052, 0.04, 16]} /><meshStandardMaterial color="#26231f" roughness={0.72} /></mesh>
        <mesh position={[0, 0.105, 0]}><cylinderGeometry args={[0.03, 0.035, 0.13, 16]} /><meshPhysicalMaterial color="#ffd49a" emissive="#ff9f43" emissiveIntensity={1.4} transparent opacity={0.82} roughness={0.18} /></mesh>
        <mesh position={[0, 0.185, 0]}><cylinderGeometry args={[0.042, 0.032, 0.03, 16]} /><meshStandardMaterial color="#26231f" roughness={0.72} /></mesh>
        <mesh position={[0, 0.205, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.04, 0.006, 8, 24, Math.PI]} /><meshStandardMaterial color="#26231f" roughness={0.7} /></mesh>
      </group>
    </group>
  );
}

function NeutralStudio() {
  return (
    <group>
      <mesh position={[0, TABLE_TOP_Y - 0.03, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.06, 96]} />
        <meshStandardMaterial color="#d8d2c8" roughness={0.72} envMapIntensity={0.55} />
      </mesh>
    </group>
  );
}

export function SceneBackdrop({ descriptor, quality }: SceneBackdropProps) {
  return (
    <group name={`scene-backdrop-${descriptor.id}`}>
      {descriptor.id === "warm-craftsman-home" ? <><WoodTable descriptor={descriptor} quality={quality} kind="oak" /><HomeRoom descriptor={descriptor} quality={quality} /></> : null}
      {descriptor.id === "forest-camp-evening" ? <><WoodTable descriptor={descriptor} quality={quality} kind="walnut" /><ForestCamp descriptor={descriptor} quality={quality} /></> : null}
      {descriptor.id === "studio-neutral" ? <NeutralStudio /> : null}
      <BakedTableShadow descriptor={descriptor} />
    </group>
  );
}
