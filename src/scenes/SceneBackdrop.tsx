"use client";

import { RoundedBox } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { SceneQuality } from "@/lib/contracts";
import type { SceneDescriptor } from "@/scenes/catalog";

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

const TABLE_TOP_Y = -0.0028;
const HOME_TABLE_Y_SCALE = 1.32;
const HOME_FLOOR_Y = TABLE_TOP_Y - 0.54885 * HOME_TABLE_Y_SCALE;
// Measured from the published GLB with the two chair nodes excluded.  The
// previous 0.725922 m estimate left the highest slats 6.09 mm too high and
// visibly intersecting the 2 mm saucer bottom.
const CAMP_TABLE_HEIGHT = 0.732011735;
const CAMP_FLOOR_Y = TABLE_TOP_Y - CAMP_TABLE_HEIGHT;

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

function HomeScene({ descriptor, quality }: SceneBackdropProps) {
  const models = descriptor.qualityAssets[quality].models;
  return (
    <group name="warm-craftsman-home-v3">
      <Suspense fallback={<LoadingTable color="#b37b45" />}>
        <SceneModel
          url={models.table}
          name="cc0-wooden-table"
          position={[0, HOME_FLOOR_Y, 0]}
          scale={[1, HOME_TABLE_Y_SCALE, 1]}
          materialTint="#e3edf9"
          roughnessFloor={0.56}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.sofa}
          name="cc0-sofa"
          position={[-1.5, -0.38, -0.8]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={0.55}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.plant}
          name="cc0-potted-plant"
          position={[-1.1, -0.1, 0.85]}
          rotation={[0, 0.45, 0]}
          scale={0.55}
        />
      </Suspense>
      <BakedGroundOcclusion descriptor={descriptor} y={HOME_FLOOR_Y} />
    </group>
  );
}

function CampScene({ descriptor, quality }: SceneBackdropProps) {
  const models = descriptor.qualityAssets[quality].models;
  return (
    <group name="forest-camp-evening-v3">
      <Suspense fallback={<LoadingTable color="#674a39" />}>
        <SceneModel
          url={models.tableSet}
          name="cc0-outdoor-table-chair-set"
          position={[0.0797, CAMP_FLOOR_Y, -0.0711]}
          rotation={[0, -0.08, 0]}
          hiddenNodeNames={[
            "outdoor_table_chair_set_01_chair_01",
            "outdoor_table_chair_set_01_chair_02",
          ]}
          materialTint="#735f53"
          roughnessFloor={0.5}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.tent}
          name="cc0-kenney-tent"
          position={[-1.78, CAMP_FLOOR_Y, -1.34]}
          rotation={[0, 0.34, 0]}
          scale={0.28}
          materialTint="#596052"
          roughnessFloor={0.78}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SceneModel
          url={models.lantern}
          name="cc0-lantern"
          position={[-0.18, TABLE_TOP_Y, 0.24]}
          rotation={[0, -0.2, 0]}
          scale={0.4}
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
