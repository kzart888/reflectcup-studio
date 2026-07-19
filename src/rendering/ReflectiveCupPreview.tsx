"use client";

import { AdaptiveDpr, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Component, Suspense, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GroundedSkybox } from "three/examples/jsm/objects/GroundedSkybox.js";
import type { CameraState, CropTransform, OpticalRuntime, PreviewRuntimeSettings, SceneQuality } from "@/lib/contracts";
import { getDishReflectionParameters } from "@/optics";
import type { DishReflectionParameters, OpticalProfile } from "@/optics";
import { createCupHandleGeometry, createInnerCupGeometry, CUP_RIM_RADIUS, CUP_WALL_THICKNESS } from "@/rendering/cup-geometry";
import { createDishGeometry, createDishSolidGeometry } from "@/rendering/dish-geometry";
import { cupFragmentShader, opticalVertexShader, plateFragmentShader } from "@/rendering/shaders";
import { groundedSkyboxResolution, subjectGeometryDetail } from "@/rendering/subject-quality";
import { getSceneDescriptor, type SceneDescriptor } from "@/scenes/catalog";
import { SceneBackdrop } from "@/scenes/SceneBackdrop";
import { PREVIEW_CAMERA_FAR_METRES } from "@/scenes/layout";
import { browserSceneRuntimeHints, initialSceneQuality } from "@/scenes/runtime-policy";

type Props = {
  sourceUrl?: string;
  sourceSize?: readonly [number, number];
  crop: CropTransform;
  cameraState: CameraState;
  opticalRuntime: OpticalRuntime;
  previewSettings: PreviewRuntimeSettings;
  sceneId?: string;
  className?: string;
  resetNonce?: number;
  resourceRetryNonce?: number;
  contextGeneration?: number;
  onCameraChange?: (position: readonly [number, number, number]) => void;
  onPreviewStateChange?: (state: PreviewLoadState) => void;
};

export type PreviewLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  error?: "webgl" | "optical" | "source";
};

type ResourceState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error" };

function useOpticalLut(runtime: OpticalRuntime, retryNonce: number): ResourceState<THREE.DataTexture> {
  const [loaded, setLoaded] = useState<ResourceState<THREE.DataTexture>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let current: THREE.DataTexture | undefined;
    void Promise.all([
      fetch(runtime.lut.url, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("LUT failed to load");
        return response.arrayBuffer();
      }),
      fetch(runtime.mask.url, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("LUT mask failed to load");
        return response.arrayBuffer();
      }),
    ]).then(([uvBuffer, maskBuffer]) => {
      if (controller.signal.aborted) return;
      const uv = new Float32Array(uvBuffer);
      const mask = new Uint8Array(maskBuffer);
      const pixels = runtime.lut.width * runtime.lut.height;
      if (uv.length !== pixels * 2 || mask.length !== pixels) throw new Error("LUT dimensions do not match the profile");
      const rgba = new Float32Array(pixels * 4);
      for (let pixel = 0; pixel < pixels; pixel += 1) {
        rgba[pixel * 4] = uv[pixel * 2];
        rgba[pixel * 4 + 1] = uv[pixel * 2 + 1];
        rgba[pixel * 4 + 2] = mask[pixel] / 255;
        rgba[pixel * 4 + 3] = 1;
      }
      const texture = new THREE.DataTexture(rgba, runtime.lut.width, runtime.lut.height, THREE.RGBAFormat, THREE.FloatType);
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.flipY = false;
      texture.needsUpdate = true;
      current = texture;
      setLoaded({ status: "ready", value: texture });
    }).catch(() => {
      if (!controller.signal.aborted) setLoaded({ status: "error" });
    });
    return () => {
      controller.abort();
      current?.dispose();
    };
  }, [retryNonce, runtime.lut.height, runtime.lut.url, runtime.lut.width, runtime.mask.url]);
  return loaded;
}

function useSourceTexture(sourceUrl: string | undefined, retryNonce: number): ResourceState<THREE.Texture> | { status: "idle" } {
  const [loaded, setLoaded] = useState<ResourceState<THREE.Texture> & { url?: string }>({ status: "loading" });
  useEffect(() => {
    if (!sourceUrl) return;
    let active = true;
    let current: THREE.Texture | undefined;
    new THREE.TextureLoader().load(sourceUrl, (texture) => {
      current = texture;
      if (!active) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      // LUT/source coordinates use top-origin image UVs, matching Sharp on
      // the server. Disabling the usual Three.js image flip keeps v=0 on the
      // original top row and prevents browser/production vertical inversion.
      texture.flipY = false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      setLoaded({ status: "ready", url: sourceUrl, value: texture });
    }, undefined, () => {
      if (active) setLoaded({ status: "error", url: sourceUrl });
    });
    return () => {
      active = false;
      current?.dispose();
    };
  }, [retryNonce, sourceUrl]);
  if (!sourceUrl) return { status: "idle" };
  if (loaded.url === sourceUrl) return loaded;
  return { status: "loading" };
}

function useOpticalUniforms(
  sourceTexture: THREE.Texture | null,
  lutTexture: THREE.DataTexture,
  sourceSize: readonly [number, number],
  crop: CropTransform,
) {
  return useMemo(() => ({
    sourceMap: { value: sourceTexture ?? lutTexture },
    opticalLut: { value: lutTexture },
    hasSource: { value: Boolean(sourceTexture) },
    sourceSize: { value: new THREE.Vector2(sourceSize[0], sourceSize[1]) },
    crop: { value: new THREE.Vector3(crop.centerX, crop.centerY, crop.scale) },
  }), [crop.centerX, crop.centerY, crop.scale, lutTexture, sourceSize, sourceTexture]);
}

function ProfileContactAo({ geometry, url }: { geometry: THREE.BufferGeometry; url: string }) {
  const contactTextureSource = useLoader(THREE.TextureLoader, url);
  const contactTexture = useMemo(() => {
    const texture = contactTextureSource.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, [contactTextureSource]);
  useEffect(() => () => contactTexture.dispose(), [contactTexture]);
  return <mesh geometry={geometry} position={[0, 0.0002, 0]} renderOrder={3}>
    <meshBasicMaterial
      map={contactTexture}
      transparent
      depthWrite={false}
      toneMapped={false}
      opacity={0.28}
      polygonOffset
      polygonOffsetFactor={-3}
    />
  </mesh>;
}

function Dish({ profile, sourceTexture, lutTexture, sourceSize, crop, descriptor, keyLightMultiplier, quality }: {
  profile: OpticalProfile;
  sourceTexture: THREE.Texture | null;
  lutTexture: THREE.DataTexture;
  sourceSize: readonly [number, number];
  crop: CropTransform;
  descriptor: SceneDescriptor;
  keyLightMultiplier: number;
  quality: SceneQuality;
}) {
  const detail = subjectGeometryDetail(quality, descriptor.renderContract.rendererVersion);
  const topGeometry = useMemo(
    () => createDishGeometry(profile, detail.dishRadialSegments, detail.dishAngularSegments),
    [detail, profile],
  );
  const solidGeometry = useMemo(
    () => createDishSolidGeometry(profile, 0.002, detail.dishRadialSegments, detail.dishAngularSegments),
    [detail, profile],
  );
  const opticalUniforms = useOpticalUniforms(sourceTexture, lutTexture, sourceSize, crop);
  const uniforms = useMemo(() => ({
    ...opticalUniforms,
    heroLightDirection: { value: new THREE.Vector3(...descriptor.lighting.heroPosition).normalize() },
    heroLightColor: { value: new THREE.Color(descriptor.lighting.heroColor) },
    heroLightIntensity: { value: descriptor.lighting.heroIntensity * keyLightMultiplier },
    printAmbient: { value: descriptor.subject.printAmbient },
    ceramicBaseColor: { value: new THREE.Color("#f7f5ef") },
    opaquePlateBase: { value: profile.id === "curved-cup-v3" },
  }), [descriptor, keyLightMultiplier, opticalUniforms, profile.id]);
  useEffect(() => () => {
    topGeometry.dispose();
    solidGeometry.dispose();
  }, [solidGeometry, topGeometry]);
  const sphereCenterY = profile.dish.center[1] + profile.dish.sphereRadius;
  const rimY = sphereCenterY - Math.sqrt(
    profile.dish.sphereRadius * profile.dish.sphereRadius - profile.dish.radius * profile.dish.radius,
  );
  return <group>
    <mesh geometry={solidGeometry}>
      <meshPhysicalMaterial color="#f7f5ef" roughness={0.22} metalness={0} clearcoat={0.2} clearcoatRoughness={0.18} envMapIntensity={0.86} />
    </mesh>
    <mesh position={[profile.dish.center[0], rimY - 0.0006, profile.dish.center[2]]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[profile.dish.radius - 0.0006, 0.0006, 6, detail.dishRimTubularSegments]} />
      <meshPhysicalMaterial color="#f7f5ef" roughness={0.2} clearcoat={0.18} clearcoatRoughness={0.18} envMapIntensity={0.82} />
    </mesh>
    <mesh geometry={topGeometry} position={[0, 0.00012, 0]} renderOrder={2}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={opticalVertexShader}
        fragmentShader={plateFragmentShader}
        glslVersion={THREE.GLSL3}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        toneMapped
      />
    </mesh>
    {profile.id === "curved-cup-v3"
      ? <ProfileContactAo geometry={topGeometry} url={descriptor.assetUrls["cup-contact-ao"]} />
      : null}
  </group>;
}

type ShaderMaterialWithEnvironment = THREE.ShaderMaterial & { envMap: THREE.Texture };

export function createEnvironmentRotation(rotationY: number): THREE.Matrix3 {
  // Three.js transposes scene.backgroundRotation/environmentRotation before
  // passing them to its shaders. Keep the custom mirror shader in exactly the
  // same convention so the reflected environment lines up with the backdrop.
  return new THREE.Matrix3()
    .setFromMatrix4(new THREE.Matrix4().makeRotationY(rotationY))
    .transpose();
}

function Cup({ profile, dish, sourceTexture, lutTexture, environmentTexture, sourceSize, crop, descriptor, quality }: {
  profile: OpticalProfile;
  dish: DishReflectionParameters;
  sourceTexture: THREE.Texture | null;
  lutTexture: THREE.DataTexture;
  environmentTexture: THREE.Texture;
  sourceSize: readonly [number, number];
  crop: CropTransform;
  descriptor: SceneDescriptor;
  quality: SceneQuality;
}) {
  const detail = subjectGeometryDetail(quality, descriptor.renderContract.rendererVersion);
  const outerGeometry = useMemo(() => new THREE.LatheGeometry(
    profile.cup.radialProfile.map((point) => new THREE.Vector2(point.radius, point.y)),
    detail.cupOuterSegments,
  ), [detail, profile]);
  const innerGeometry = useMemo(
    () => createInnerCupGeometry(profile, detail.cupInnerSegments),
    [detail, profile],
  );
  const handleGeometry = useMemo(
    () => createCupHandleGeometry(profile, detail.cupHandleTubularSegments, detail.cupHandleRadialSegments),
    [detail, profile],
  );
  const opticalUniforms = useOpticalUniforms(sourceTexture, lutTexture, sourceSize, crop);
  const environmentRotation = useMemo(
    () => createEnvironmentRotation(descriptor.background.rotationY),
    [descriptor.background.rotationY],
  );
  const uniforms = useMemo(() => ({
    ...opticalUniforms,
    envMap: { value: environmentTexture },
    environmentRotation: { value: environmentRotation },
    environmentIntensity: { value: descriptor.lighting.environmentIntensity },
    mirrorRoughness: { value: 0.025 },
    dishBaseColor: { value: new THREE.Color("#f7f5ef") },
    dishCenter: { value: new THREE.Vector3(...dish.dishCenter) },
    dishRadius: { value: dish.dishRadius },
    sphereRadius: { value: dish.sphereRadius },
    dishSag: { value: dish.dishSag },
  }), [descriptor.lighting.environmentIntensity, dish, environmentRotation, environmentTexture, opticalUniforms]);
  const mirrorMaterial = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: opticalVertexShader,
      fragmentShader: cupFragmentShader,
      glslVersion: THREE.GLSL3,
      toneMapped: true,
    }) as ShaderMaterialWithEnvironment;
    material.envMap = environmentTexture;
    return material;
  }, [environmentTexture, uniforms]);
  useEffect(() => () => {
    outerGeometry.dispose();
    innerGeometry.dispose();
    handleGeometry.dispose();
    mirrorMaterial.dispose();
  }, [handleGeometry, innerGeometry, mirrorMaterial, outerGeometry]);
  const top = profile.cup.radialProfile.at(-1)!;
  const bottom = profile.cup.radialProfile[0];
  const innerBottomRadius = Math.max(0.001, bottom.radius - CUP_WALL_THICKNESS);
  return <group position={profile.cup.axisOrigin as [number, number, number]}>
    <mesh geometry={outerGeometry}>
      <primitive object={mirrorMaterial} attach="material" />
    </mesh>
    <mesh geometry={innerGeometry}>
      <meshPhysicalMaterial color="#f7f6f2" roughness={0.18} metalness={0} clearcoat={0.22} clearcoatRoughness={0.16} envMapIntensity={0.95} side={THREE.BackSide} />
    </mesh>
    <mesh position={[0, top.y - CUP_RIM_RADIUS, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[top.radius - CUP_RIM_RADIUS, CUP_RIM_RADIUS, 8, detail.cupRimTubularSegments]} />
      <meshPhysicalMaterial color="#f7f6f2" roughness={0.16} clearcoat={0.26} clearcoatRoughness={0.14} envMapIntensity={1} />
    </mesh>
    <mesh position={[0, bottom.y - CUP_WALL_THICKNESS / 2, 0]}>
      <cylinderGeometry args={[bottom.radius, bottom.radius, CUP_WALL_THICKNESS, detail.cupBaseSegments]} />
      <meshPhysicalMaterial color="#f6f4ee" roughness={0.23} clearcoat={0.16} clearcoatRoughness={0.2} envMapIntensity={0.8} />
    </mesh>
    <mesh position={[0, bottom.y + CUP_WALL_THICKNESS, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[innerBottomRadius, detail.cupBaseSegments]} />
      <meshPhysicalMaterial color="#f7f6f2" roughness={0.2} clearcoat={0.2} clearcoatRoughness={0.18} envMapIntensity={0.9} side={THREE.DoubleSide} />
    </mesh>
    <mesh geometry={handleGeometry}>
      <meshPhysicalMaterial color="#f7f6f2" roughness={0.19} clearcoat={0.22} clearcoatRoughness={0.15} envMapIntensity={0.92} />
    </mesh>
  </group>;
}

function useSceneEnvironment(
  descriptor: SceneDescriptor,
  quality: SceneQuality,
  contextGeneration: number
): { source: THREE.Texture; pmrem?: THREE.Texture } {
  const loadedEnvironment = useLoader(HDRLoader, descriptor.qualityAssets[quality].environment);
  const environment = useMemo(() => {
    const texture = loadedEnvironment.clone();
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    return texture;
  }, [loadedEnvironment]);
  const { gl, invalidate } = useThree();
  const resourceKey = `${descriptor.id}:${descriptor.version}:${quality}:${contextGeneration}`;
  const targetRef = useRef<{
    key: string;
    target: THREE.WebGLRenderTarget;
  } | undefined>(undefined);
  const staleTargetsRef = useRef<THREE.WebGLRenderTarget[]>([]);
  const [targetState, setTargetState] = useState<{
    key: string;
    target: THREE.WebGLRenderTarget;
  }>();
  useLayoutEffect(() => {
    let active = true;
    const generator = new THREE.PMREMGenerator(gl);
    generator.compileEquirectangularShader();
    const target = generator.fromEquirectangular(environment);
    generator.dispose();
    const previous = targetRef.current;
    const next = { key: resourceKey, target };
    targetRef.current = next;
    if (previous) staleTargetsRef.current.push(previous.target);
    // Never expose a target under a different resource key. The microtask
    // keeps the effect free of cascading synchronous React renders while
    // still scheduling the paired PMREM before the next animation frame.
    queueMicrotask(() => {
      if (!active) return;
      setTargetState(next);
      invalidate();
    });
    return () => { active = false; };
  }, [environment, gl, invalidate, resourceKey]);
  useEffect(() => {
    if (!targetState) return;
    const stale = staleTargetsRef.current.splice(0);
    for (const target of stale) {
      if (target !== targetState.target) target.dispose();
    }
  }, [targetState]);
  useEffect(() => () => {
    targetRef.current?.target.dispose();
    for (const target of staleTargetsRef.current.splice(0)) target.dispose();
    targetRef.current = undefined;
  }, []);
  useEffect(() => () => {
    environment.dispose();
  }, [environment]);
  return {
    source: environment,
    pmrem: targetState?.key === resourceKey ? targetState.target.texture : undefined,
  };
}

const retainedSceneCacheKeys: string[] = [];
const retainedSceneDescriptors = new Map<string, SceneDescriptor>();

function sceneCacheKey(descriptor: SceneDescriptor): string {
  return `${descriptor.id}:v${descriptor.version}:${descriptor.checksum}`;
}

function retainSceneAssetCache(descriptor: SceneDescriptor): void {
  const key = sceneCacheKey(descriptor);
  const previousIndex = retainedSceneCacheKeys.indexOf(key);
  if (previousIndex >= 0) retainedSceneCacheKeys.splice(previousIndex, 1);
  retainedSceneCacheKeys.push(key);
  retainedSceneDescriptors.set(key, descriptor);
  if (retainedSceneCacheKeys.length <= 2) return;

  const evictedKey = retainedSceneCacheKeys.shift();
  const evicted = evictedKey ? retainedSceneDescriptors.get(evictedKey) : undefined;
  if (evictedKey) retainedSceneDescriptors.delete(evictedKey);
  if (!evicted) return;
  const retainedUrls = new Set(
    retainedSceneCacheKeys
      .map((retainedKey) => retainedSceneDescriptors.get(retainedKey))
      .filter((scene): scene is SceneDescriptor => Boolean(scene))
      .flatMap((scene) => Object.values(scene.assetUrls)),
  );
  for (const url of Object.values(evicted.assetUrls)) {
    if (retainedUrls.has(url)) continue;
    if (url.toLowerCase().endsWith(".hdr")) useLoader.clear(HDRLoader, url);
    else if (url.toLowerCase().endsWith(".glb")) useLoader.clear(GLTFLoader, url);
    else useLoader.clear(THREE.TextureLoader, url);
  }
}

type SceneEnvironmentSnapshot = {
  background: THREE.Scene["background"];
  environment: THREE.Scene["environment"];
  backgroundBlurriness: number;
  backgroundIntensity: number;
  environmentIntensity: number;
  backgroundRotation: THREE.Euler;
  environmentRotation: THREE.Euler;
};

function captureSceneEnvironment(scene: THREE.Scene): SceneEnvironmentSnapshot {
  return {
    background: scene.background,
    environment: scene.environment,
    backgroundBlurriness: scene.backgroundBlurriness,
    backgroundIntensity: scene.backgroundIntensity,
    environmentIntensity: scene.environmentIntensity,
    backgroundRotation: scene.backgroundRotation.clone(),
    environmentRotation: scene.environmentRotation.clone(),
  };
}

function applySceneEnvironment(
  scene: THREE.Scene,
  descriptor: SceneDescriptor,
  source: THREE.Texture,
  pmrem: THREE.Texture,
  solidBackground: THREE.Color,
) {
  scene.background = descriptor.background.mode === "environment" ? source : solidBackground;
  scene.environment = pmrem;
  scene.backgroundBlurriness = descriptor.background.blur;
  scene.backgroundIntensity = descriptor.background.intensity;
  scene.environmentIntensity = descriptor.lighting.environmentIntensity;
  scene.backgroundRotation.set(0, descriptor.background.rotationY, 0);
  scene.environmentRotation.set(0, descriptor.background.rotationY, 0);
}

function restoreSceneEnvironment(scene: THREE.Scene, snapshot: SceneEnvironmentSnapshot) {
  scene.background = snapshot.background;
  scene.environment = snapshot.environment;
  scene.backgroundBlurriness = snapshot.backgroundBlurriness;
  scene.backgroundIntensity = snapshot.backgroundIntensity;
  scene.environmentIntensity = snapshot.environmentIntensity;
  scene.backgroundRotation.copy(snapshot.backgroundRotation);
  scene.environmentRotation.copy(snapshot.environmentRotation);
}

function GroundedSceneBackground({ descriptor, quality }: {
  descriptor: SceneDescriptor;
  quality: SceneQuality;
}) {
  const url = descriptor.qualityAssets[quality].background;
  const projection = descriptor.background.groundProjection;
  if (!url || !projection) return null;
  return <GroundedSceneBackgroundAsset descriptor={descriptor} url={url} projection={projection} quality={quality} />;
}

function GroundedSceneBackgroundAsset({ descriptor, url, projection, quality }: {
  descriptor: SceneDescriptor;
  url: string;
  projection: NonNullable<SceneDescriptor["background"]["groundProjection"]>;
  quality: SceneQuality;
}) {
  const source = useLoader(THREE.TextureLoader, url);
  const { invalidate } = useThree();
  const texture = useMemo(() => {
    const result = source.clone();
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = THREE.RepeatWrapping;
    result.wrapT = THREE.ClampToEdgeWrapping;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.needsUpdate = true;
    return result;
  }, [source]);
  const skybox = useMemo(() => {
    const result = new GroundedSkybox(
      texture,
      projection.captureHeight,
      projection.radius,
      groundedSkyboxResolution(quality, projection.resolution),
    );
    result.name = "grounded-forest-environment";
    result.position.set(0, projection.groundLevel + projection.captureHeight, 0);
    result.rotation.y = descriptor.background.rotationY;
    result.renderOrder = -1_000;
    result.frustumCulled = false;
    result.material.color.setScalar(descriptor.background.intensity);
    // The JPEG is already display-referred and tone-mapped. Sending it
    // through the renderer's ACES pass again darkens it and breaks the visual
    // match with the separately prefiltered HDR environment.
    result.material.toneMapped = false;
    return result;
  }, [descriptor.background.intensity, descriptor.background.rotationY, projection, quality, texture]);
  useEffect(() => {
    invalidate();
    return () => {
      skybox.geometry.dispose();
      skybox.material.dispose();
      texture.dispose();
    };
  }, [invalidate, skybox, texture]);
  return <primitive object={skybox} dispose={null} />;
}

function SceneEnvironment({ descriptor, source, pmrem, quality }: {
  descriptor: SceneDescriptor;
  source: THREE.Texture;
  pmrem: THREE.Texture;
  quality: SceneQuality;
}) {
  const { scene, invalidate } = useThree();
  const solidBackground = useMemo(() => new THREE.Color(descriptor.background.color), [descriptor.background.color]);
  useLayoutEffect(() => {
    const previous = captureSceneEnvironment(scene);
    applySceneEnvironment(scene, descriptor, source, pmrem, solidBackground);
    invalidate();
    return () => restoreSceneEnvironment(scene, previous);
  }, [descriptor, invalidate, pmrem, scene, solidBackground, source]);
  return descriptor.background.mode === "grounded-environment"
    ? <GroundedSceneBackground descriptor={descriptor} quality={quality} />
    : null;
}

function CameraController({ profile, onCameraChange, resetNonce, cameraState }: Pick<Props, "onCameraChange" | "resetNonce" | "cameraState"> & { profile: OpticalProfile }) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const callback = useRef(onCameraChange);
  const handledResetNonce = useRef(resetNonce);
  useEffect(() => { callback.current = onCameraChange; }, [onCameraChange]);
  const { camera, invalidate, performance } = useThree();
  useEffect(() => {
    const isBestViewReset = handledResetNonce.current !== resetNonce;
    handledResetNonce.current = resetNonce;
    const position = isBestViewReset ? profile.designCamera.position : cameraState.position;
    const target = profile.designCamera.target;
    camera.position.set(...position);
    camera.lookAt(...target);
    controls.current?.target.set(...target);
    controls.current?.update();
    if (isBestViewReset) callback.current?.(profile.designCamera.position);
    invalidate();
  }, [camera, cameraState.position, invalidate, profile.designCamera.position, profile.designCamera.target, resetNonce]);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const setTestCamera = (event: Event) => {
      const position = (event as CustomEvent<{ position?: readonly [number, number, number] }>).detail?.position;
      if (!position || position.length !== 3 || position.some((value) => !Number.isFinite(value))) return;
      camera.position.set(...position);
      camera.lookAt(...profile.designCamera.target);
      controls.current?.target.set(...profile.designCamera.target);
      controls.current?.update();
      invalidate();
    };
    window.addEventListener("reflectcup:set-test-camera", setTestCamera);
    return () => window.removeEventListener("reflectcup:set-test-camera", setTestCamera);
  }, [camera, invalidate, profile.designCamera.target]);
  return <OrbitControls
    ref={controls}
    makeDefault
    enablePan={false}
    enableDamping
    dampingFactor={0.075}
    minDistance={0.22}
    maxDistance={0.9}
    minPolarAngle={THREE.MathUtils.degToRad(15)}
    maxPolarAngle={THREE.MathUtils.degToRad(75)}
    target={profile.designCamera.target as [number, number, number]}
    onStart={() => performance.regress()}
    onChange={() => invalidate()}
    onEnd={() => callback.current?.([camera.position.x, camera.position.y, camera.position.z])}
  />;
}

function SceneContents({ sourceUrl, sourceSize = [1, 1], crop, cameraState, opticalRuntime, previewSettings, sceneId = "studio-neutral", onCameraChange, onPreviewStateChange, resetNonce, resourceRetryNonce = 0, contextGeneration = 0 }: Props) {
  const descriptor = getSceneDescriptor(sceneId);
  const profile = opticalRuntime.profile;
  const dish = useMemo(() => getDishReflectionParameters(profile), [profile]);
  const baselineQuality = initialSceneQuality(browserSceneRuntimeHints());
  const [highQualityAllowed, setHighQualityAllowed] = useState(true);
  const [qualityState, setQualityState] = useState<{ sceneId: string; quality: SceneQuality }>(() => ({
    sceneId: descriptor.id,
    quality: baselineQuality,
  }));
  // Derive the baseline synchronously so a scene that had reached High cannot
  // make a different/evicted scene cold-load its 2K tier. The scene's idle
  // callback records its own quality later; no render-phase reset is needed.
  const quality = highQualityAllowed
    ? qualityState.sceneId === descriptor.id ? qualityState.quality : baselineQuality
    : "low";
  const sourceTextureState = useSourceTexture(sourceUrl, resourceRetryNonce);
  const lutTextureState = useOpticalLut(opticalRuntime, resourceRetryNonce);
  const environment = useSceneEnvironment(descriptor, quality, contextGeneration);
  useEffect(() => {
    retainSceneAssetCache(descriptor);
  }, [descriptor]);
  useEffect(() => {
    const hints = browserSceneRuntimeHints();
    if (!highQualityAllowed || hints.saveData || hints.coarsePointer) return;
    let timeout: number | undefined;
    let idle: number | undefined;
    const upgrade = () => startTransition(() => setQualityState({ sceneId: descriptor.id, quality: "high" }));
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      idle = idleWindow.requestIdleCallback(upgrade, { timeout: 2_000 });
    } else {
      timeout = setTimeout(upgrade, 1_200) as unknown as number;
    }
    return () => {
      if (idle !== undefined) idleWindow.cancelIdleCallback?.(idle);
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [descriptor.id, highQualityAllowed]);
  useEffect(() => {
    if (!sourceUrl) {
      onPreviewStateChange?.({ status: "idle" });
      return;
    }
    if (lutTextureState.status === "error") {
      onPreviewStateChange?.({ status: "error", error: "optical" });
      return;
    }
    if (sourceTextureState.status === "error") {
      onPreviewStateChange?.({ status: "error", error: "source" });
      return;
    }
    onPreviewStateChange?.({
      status: lutTextureState.status === "ready" && sourceTextureState.status === "ready" && environment.pmrem ? "ready" : "loading",
    });
  }, [environment.pmrem, lutTextureState.status, onPreviewStateChange, sourceTextureState.status, sourceUrl]);

  const opticalReady = lutTextureState.status === "ready";
  const sourceReady = sourceTextureState.status === "ready";
  return <>
    {environment.pmrem ? <SceneEnvironment descriptor={descriptor} source={environment.source} pmrem={environment.pmrem} quality={quality} /> : null}
    <ambientLight intensity={descriptor.lighting.ambientIntensity} />
    <directionalLight
      position={[...descriptor.lighting.heroPosition]}
      color={descriptor.lighting.heroColor}
      intensity={descriptor.lighting.heroIntensity * previewSettings.keyLightMultiplier}
    />
    <SceneBackdrop descriptor={descriptor} quality={quality} />
    {opticalReady ? <Dish profile={profile} sourceTexture={sourceReady ? sourceTextureState.value : null} lutTexture={lutTextureState.value} sourceSize={sourceSize} crop={crop} descriptor={descriptor} keyLightMultiplier={previewSettings.keyLightMultiplier} quality={quality} /> : null}
    {opticalReady && environment.pmrem ? <Cup profile={profile} dish={dish} sourceTexture={sourceReady ? sourceTextureState.value : null} lutTexture={lutTextureState.value} environmentTexture={environment.pmrem} sourceSize={sourceSize} crop={crop} descriptor={descriptor} quality={quality} /> : null}
    <PerformanceMonitor
      flipflops={2}
      onDecline={() => {
        setHighQualityAllowed(false);
      }}
      onFallback={() => {
        setHighQualityAllowed(false);
      }}
    />
    <AdaptiveDpr />
    <CameraController profile={profile} onCameraChange={onCameraChange} resetNonce={resetNonce} cameraState={cameraState} />
  </>;
}

class PreviewErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() {
    return this.state.failed ? <div role="alert">The 3D reflection preview could not be started.</div> : this.props.children;
  }
}

function WebGlLifecycle({ onStateChange, onRestored }: {
  onStateChange: (state: "loading" | "ready" | "error") => void;
  onRestored: () => void;
}) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    let failureTimer: number | undefined;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onStateChange("loading");
      failureTimer = window.setTimeout(() => onStateChange("error"), 800);
    };
    const handleRestored = () => {
      if (failureTimer) window.clearTimeout(failureTimer);
      onRestored();
      onStateChange("ready");
    };
    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    onStateChange("ready");
    return () => {
      if (failureTimer) window.clearTimeout(failureTimer);
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    };
  }, [gl, onRestored, onStateChange]);
  return null;
}

export function ReflectiveCupPreview(props: Props) {
  const { onPreviewStateChange, resourceRetryNonce, sourceUrl } = props;
  const [webGlState, setWebGlState] = useState<"loading" | "ready" | "error">("loading");
  const [contextGeneration, setContextGeneration] = useState(0);
  const [sceneState, setSceneState] = useState<PreviewLoadState>({ status: sourceUrl ? "loading" : "idle" });
  const reportSceneState = useCallback((state: PreviewLoadState) => setSceneState(state), []);
  const reportWebGlState = useCallback((state: "loading" | "ready" | "error") => setWebGlState(state), []);
  const reportWebGlFailure = useCallback(() => setWebGlState("error"), []);
  const reportWebGlRestored = useCallback(() => setContextGeneration((value) => value + 1), []);
  useEffect(() => {
    if (!sourceUrl) {
      onPreviewStateChange?.({ status: "idle" });
    } else if (webGlState === "error") {
      onPreviewStateChange?.({ status: "error", error: "webgl" });
    } else if (sceneState.status === "error") {
      onPreviewStateChange?.(sceneState);
    } else {
      onPreviewStateChange?.({ status: webGlState === "ready" && sceneState.status === "ready" ? "ready" : "loading" });
    }
  }, [onPreviewStateChange, sceneState, sourceUrl, webGlState]);
  const maxDpr = useMemo(() => {
    if (typeof window === "undefined") return 1.5;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const cap = coarse ? props.previewSettings.mobileDprCap : props.previewSettings.desktopDprCap;
    return Math.min(window.devicePixelRatio || 1, cap);
  }, [props.previewSettings.desktopDprCap, props.previewSettings.mobileDprCap]);
  return <div className={props.className} data-testid="reflection-preview">
    <PreviewErrorBoundary key={resourceRetryNonce} onError={reportWebGlFailure}>
      <Canvas
      frameloop="demand"
      dpr={[1, maxDpr]}
      camera={{ position: [...props.cameraState.position], fov: props.opticalRuntime.profile.designCamera.verticalFovDegrees, near: 0.02, far: PREVIEW_CAMERA_FAR_METRES }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = props.previewSettings.toneMappingExposure;
      }}
      fallback={<div>WebGL 2 is required for the reflection preview.</div>}
    >
      <WebGlLifecycle onStateChange={reportWebGlState} onRestored={reportWebGlRestored} />
      <Suspense fallback={null}><SceneContents {...props} contextGeneration={contextGeneration} onPreviewStateChange={reportSceneState} /></Suspense>
      </Canvas>
    </PreviewErrorBoundary>
  </div>;
}
