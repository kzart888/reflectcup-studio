"use client";

import { RoundedBox } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { SceneQuality } from "@/lib/contracts";
import type { SceneDescriptor } from "@/scenes/catalog";
import {
  CAMP_FLOOR_Y,
  CAMP_SCENE_LAYOUT,
  HOME_FLOOR_Y,
  HOME_SCENE_LAYOUT,
  LEGACY_CAMP_SCENE_LAYOUT_V3,
  LEGACY_HOME_SCENE_LAYOUT_V3,
  TABLE_TOP_Y,
} from "@/scenes/layout";

type SceneBackdropProps = {
  descriptor: SceneDescriptor;
  quality: SceneQuality;
};

type SceneModelProps = {
  url: string;
  name: string;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: number | readonly [number, number, number];
  hiddenNodeNames?: readonly string[];
  materialTint?: string;
  roughnessFloor?: number;
};

const MATERIAL_TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "alphaMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
] as const;

function cloneOwnedMaterial(
  source: THREE.Material,
  textureCache: Map<THREE.Texture, THREE.Texture>,
): THREE.Material {
  const material = source.clone();
  const record = material as unknown as Record<string, unknown>;
  for (const key of MATERIAL_TEXTURE_KEYS) {
    const texture = record[key];
    if (!(texture instanceof THREE.Texture)) continue;
    let ownedTexture = textureCache.get(texture);
    if (!ownedTexture) {
      ownedTexture = texture.clone();
      ownedTexture.anisotropy = Math.max(4, ownedTexture.anisotropy);
      ownedTexture.needsUpdate = true;
      textureCache.set(texture, ownedTexture);
    }
    record[key] = ownedTexture;
  }
  if (material instanceof THREE.MeshStandardMaterial) {
    // Poly Haven's glTF derivatives pack AO/roughness/metallic in R/G/B.
    // GLTFLoader wires G/B to roughnessMap/metalnessMap; because the source
    // files omit an explicit occlusionTexture, connect the same texture's R
    // channel here.  All derivatives use the primary UV set.
    if (!material.aoMap && material.roughnessMap && material.metalnessMap
      && material.roughnessMap === material.metalnessMap) {
      material.aoMap = material.roughnessMap;
      material.aoMapIntensity = 0.82;
      material.needsUpdate = true;
    }
  }
  return material;
}

function cloneOwnedScene(source: THREE.Group, options: {
  hiddenNodeNames: ReadonlySet<string>;
  materialTint?: string;
  roughnessFloor?: number;
}): THREE.Group {
  const clone = source.clone(true);
  const textureCache = new Map<THREE.Texture, THREE.Texture>();
  const materialCache = new Map<THREE.Material, THREE.Material>();
  const configuredMaterials = new Set<THREE.Material>();
  const ownMaterial = (material: THREE.Material): THREE.Material => {
    const cached = materialCache.get(material);
    if (cached) return cached;
    const owned = cloneOwnedMaterial(material, textureCache);
    materialCache.set(material, owned);
    return owned;
  };
  clone.traverse((object) => {
    if (options.hiddenNodeNames.has(object.name)) object.visible = false;
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map(ownMaterial)
      : ownMaterial(object.material);
    object.castShadow = false;
    object.receiveShadow = false;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      if (configuredMaterials.has(material)) continue;
      configuredMaterials.add(material);
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (options.materialTint) material.color.multiply(new THREE.Color(options.materialTint));
      if (options.roughnessFloor !== undefined) {
        material.roughness = Math.max(options.roughnessFloor, material.roughness);
      }
    }
  });
  return clone;
}

function disposeOwnedScene(scene: THREE.Group): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      const record = material as unknown as Record<string, unknown>;
      for (const key of MATERIAL_TEXTURE_KEYS) {
        const texture = record[key];
        if (texture instanceof THREE.Texture) textures.add(texture);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function SceneModel({
  url,
  name,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  hiddenNodeNames = [],
  materialTint,
  roughnessFloor,
}: SceneModelProps) {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  }) as GLTF;
  const hiddenNodeSignature = hiddenNodeNames.join("\0");
  const scene = useMemo(() => cloneOwnedScene(gltf.scene, {
    hiddenNodeNames: new Set(hiddenNodeSignature ? hiddenNodeSignature.split("\0") : []),
    materialTint,
    roughnessFloor,
  }), [gltf.scene, hiddenNodeSignature, materialTint, roughnessFloor]);
  useEffect(() => () => disposeOwnedScene(scene), [scene]);
  return (
    <primitive
      object={scene}
      name={name}
      position={[...position]}
      rotation={[...rotation]}
      scale={typeof scale === "number" ? scale : [...scale]}
      dispose={null}
    />
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
      name="baked-subject-shadow"
      position={[descriptor.tableShadow.offset[0], TABLE_TOP_Y + 0.00018, descriptor.tableShadow.offset[1]]}
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

function BakedGroundOcclusion({ descriptor, y }: { descriptor: SceneDescriptor; y: number }) {
  if (!descriptor.groundOcclusion) return null;
  return <BakedGroundOcclusionAsset descriptor={descriptor} y={y} />;
}

function BakedGroundOcclusionAsset({ descriptor, y }: { descriptor: SceneDescriptor; y: number }) {
  const occlusion = descriptor.groundOcclusion!;
  const source = useLoader(THREE.TextureLoader, occlusion.url);
  const texture = useMemo(() => {
    const result = source.clone();
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = THREE.ClampToEdgeWrapping;
    result.wrapT = THREE.ClampToEdgeWrapping;
    result.needsUpdate = true;
    return result;
  }, [source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      name="baked-scene-occlusion"
      position={[occlusion.offset[0], y + 0.0004, occlusion.offset[1]]}
      rotation={[-Math.PI / 2, 0, occlusion.rotation]}
      renderOrder={0}
    >
      <planeGeometry args={[occlusion.size[0], occlusion.size[1]]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} opacity={occlusion.opacity} toneMapped={false} />
    </mesh>
  );
}

function LoadingTable({ color }: { color: string }) {
  return (
    <RoundedBox args={[1.38, 0.055, 0.72]} radius={0.018} smoothness={3} position={[0, TABLE_TOP_Y - 0.0275, 0]}>
      <meshStandardMaterial color={color} roughness={0.54} metalness={0.01} envMapIntensity={0.7} />
    </RoundedBox>
  );
}

function useOwnedSurfaceTextures(urls: readonly string[], repeat: readonly [number, number]) {
  const sources = useLoader(THREE.TextureLoader, [...urls]);
  const textures = useMemo(() => sources.map((source, index) => {
    const texture = source.clone();
    texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = Math.max(4, texture.anisotropy);
    texture.needsUpdate = true;
    return texture;
  }), [repeat, sources]);
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);
  return textures;
}

function HomeRoomShell({ descriptor }: { descriptor: SceneDescriptor }) {
  const textureUrls = [
    descriptor.assetUrls["room-floor-color"],
    descriptor.assetUrls["room-floor-normal"],
    descriptor.assetUrls["room-floor-roughness"],
  ] as const;
  const repeat = useMemo(() => [5, 5] as const, []);
  const [colorMap, normalMap, roughnessMap] = useOwnedSurfaceTextures(textureUrls, repeat);
  const wallY = HOME_FLOOR_Y + 1.42;
  const trimY = HOME_FLOOR_Y + 0.74;
  return (
    <group name="large-craftsman-room-shell">
      <mesh name="room-oak-floor" position={[0, HOME_FLOOR_Y - 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.2, 5.8]} />
        <meshStandardMaterial
          map={colorMap}
          normalMap={normalMap}
          normalScale={new THREE.Vector2(0.42, 0.42)}
          roughnessMap={roughnessMap}
          roughness={0.78}
          metalness={0}
          envMapIntensity={0.48}
        />
      </mesh>
      <mesh name="room-back-wall" position={[-2.95, wallY, 0]}>
        <boxGeometry args={[0.08, 2.85, 5.8]} />
        <meshStandardMaterial color="#e7dfd1" roughness={0.9} envMapIntensity={0.2} />
      </mesh>
      <mesh name="room-front-wall" position={[2.95, wallY, 0]}>
        <boxGeometry args={[0.08, 2.85, 5.8]} />
        <meshStandardMaterial color="#ded3c3" roughness={0.92} envMapIntensity={0.18} />
      </mesh>
      <mesh name="room-left-wall" position={[0, wallY, -2.86]}>
        <boxGeometry args={[5.9, 2.85, 0.08]} />
        <meshStandardMaterial color="#eee7da" roughness={0.92} envMapIntensity={0.2} />
      </mesh>
      <mesh name="room-right-wall" position={[0, wallY, 2.86]}>
        <boxGeometry args={[5.9, 2.85, 0.08]} />
        <meshStandardMaterial color="#e2d7c7" roughness={0.92} envMapIntensity={0.18} />
      </mesh>
      <mesh name="room-ceiling" position={[0, HOME_FLOOR_Y + 2.84, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.2, 5.8]} />
        <meshStandardMaterial color="#eee8dc" roughness={0.94} envMapIntensity={0.14} side={THREE.DoubleSide} />
      </mesh>
      {[-1.75, 0, 1.75].map((z) => (
        <mesh key={z} name="craftsman-window" position={[-2.902, HOME_FLOOR_Y + 1.64, z]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.82, 1.28]} />
          <meshStandardMaterial color="#9fb2b6" emissive="#b9c8c7" emissiveIntensity={0.22} roughness={0.34} metalness={0.02} />
        </mesh>
      ))}
      {[-2.1, -1.05, 0, 1.05, 2.1].map((z) => (
        <mesh key={z} name="craftsman-wall-stile" position={[-2.885, trimY, z]}>
          <boxGeometry args={[0.035, 0.72, 0.045]} />
          <meshStandardMaterial color="#f3ecdf" roughness={0.82} />
        </mesh>
      ))}
      <mesh name="craftsman-chair-rail" position={[-2.88, HOME_FLOOR_Y + 1.08, 0]}>
        <boxGeometry args={[0.04, 0.055, 5.5]} />
        <meshStandardMaterial color="#f5ede0" roughness={0.8} />
      </mesh>
    </group>
  );
}

function ForestContextGeometry() {
  return (
    <group name="wide-forest-context">
      <mesh name="forest-earth-ground" position={[-0.2, CAMP_FLOOR_Y - 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.6, 6]} />
        <meshStandardMaterial color="#2b2b24" roughness={1} metalness={0} envMapIntensity={0.16} />
      </mesh>
    </group>
  );
}

function HomeScene({ descriptor, quality }: SceneBackdropProps) {
  const models = descriptor.qualityAssets[quality].models;
  const layout = descriptor.version >= 4 ? HOME_SCENE_LAYOUT : LEGACY_HOME_SCENE_LAYOUT_V3;
  return (
    <group name={`warm-craftsman-home-v${descriptor.version}`}>
      {descriptor.version >= 4 ? <HomeRoomShell descriptor={descriptor} /> : null}
      <Suspense fallback={<LoadingTable color="#b37b45" />}>
        <SceneModel
          url={models.table}
          name="cc0-wooden-table"
          position={layout.table.position}
          rotation={layout.table.rotation}
          scale={layout.table.scale}
          materialTint="#e3edf9"
          roughnessFloor={0.56}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.sofa}
          name="cc0-sofa"
          position={layout.sofa.position}
          rotation={layout.sofa.rotation}
          scale={layout.sofa.scale}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.plant}
          name="cc0-potted-plant"
          position={layout.plant.position}
          rotation={layout.plant.rotation}
          scale={layout.plant.scale}
        />
      </Suspense>
      <BakedGroundOcclusion descriptor={descriptor} y={HOME_FLOOR_Y} />
    </group>
  );
}

function CampScene({ descriptor, quality }: SceneBackdropProps) {
  const models = descriptor.qualityAssets[quality].models;
  const legacyLayout = descriptor.version < 4;
  const layout = legacyLayout ? LEGACY_CAMP_SCENE_LAYOUT_V3 : CAMP_SCENE_LAYOUT;
  return (
    <group name={`forest-camp-evening-v${descriptor.version}`}>
      {descriptor.version >= 4 ? <ForestContextGeometry /> : null}
      <Suspense fallback={<LoadingTable color="#674a39" />}>
        <SceneModel
          url={models.tableSet}
          name="cc0-outdoor-table-chair-set"
          position={layout.tableSet.position}
          rotation={layout.tableSet.rotation}
          hiddenNodeNames={LEGACY_CAMP_SCENE_LAYOUT_V3.tableSet.hiddenNodeNames}
          materialTint="#735f53"
          roughnessFloor={0.5}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.tent}
          name="cc0-kenney-tent"
          position={layout.tent.position}
          rotation={layout.tent.rotation}
          scale={layout.tent.scale}
          materialTint="#b9b69b"
          roughnessFloor={0.78}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.lantern}
          name="cc0-lantern"
          position={layout.lantern.position}
          rotation={layout.lantern.rotation}
          scale={layout.lantern.scale}
        />
      </Suspense>
      <BakedGroundOcclusion descriptor={descriptor} y={CAMP_FLOOR_Y} />
    </group>
  );
}

function NeutralStudio() {
  return (
    <mesh position={[0, TABLE_TOP_Y - 0.03, 0]}>
      <cylinderGeometry args={[0.72, 0.72, 0.06, 96]} />
      <meshStandardMaterial color="#d8d2c8" roughness={0.72} envMapIntensity={0.55} />
    </mesh>
  );
}

export function SceneBackdrop({ descriptor, quality }: SceneBackdropProps) {
  return (
    <group name={`scene-backdrop-${descriptor.id}`}>
      {descriptor.id === "warm-craftsman-home" ? <HomeScene descriptor={descriptor} quality={quality} /> : null}
      {descriptor.id === "forest-camp-evening" ? <CampScene descriptor={descriptor} quality={quality} /> : null}
      {descriptor.id === "studio-neutral" ? <NeutralStudio /> : null}
      <BakedTableShadow descriptor={descriptor} />
    </group>
  );
}
