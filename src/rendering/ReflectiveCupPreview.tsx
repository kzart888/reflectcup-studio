"use client";

import { ContactShadows, Environment, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import type { CameraState, CropTransform, OpticalRuntime, PreviewRuntimeSettings, SceneQuality } from "@/lib/contracts";
import { getDishReflectionParameters } from "@/optics";
import type { DishReflectionParameters, OpticalProfile } from "@/optics";
import { createDishGeometry } from "@/rendering/dish-geometry";
import { cupFragmentShader, opticalVertexShader, plateFragmentShader } from "@/rendering/shaders";
import { getScenePreset } from "@/scenes/studio-neutral";

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

const HDR_PATH = "/scenes/studio-neutral/studio_small_08_1k.hdr";

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

function Dish({ profile, sourceTexture, lutTexture, sourceSize, crop }: {
  profile: OpticalProfile;
  sourceTexture: THREE.Texture | null;
  lutTexture: THREE.DataTexture;
  sourceSize: readonly [number, number];
  crop: CropTransform;
}) {
  const geometry = useMemo(() => createDishGeometry(profile), [profile]);
  const uniforms = useOpticalUniforms(sourceTexture, lutTexture, sourceSize, crop);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group>
    <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#f4f2ec" roughness={0.27} metalness={0.02} /></mesh>
    <mesh geometry={geometry} position={[0, 0.00012, 0]} renderOrder={2}>
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
  </group>;
}

function Cup({ profile, dish, sourceTexture, lutTexture, environmentTexture, sourceSize, crop }: {
  profile: OpticalProfile;
  dish: DishReflectionParameters;
  sourceTexture: THREE.Texture | null;
  lutTexture: THREE.DataTexture;
  environmentTexture: THREE.Texture;
  sourceSize: readonly [number, number];
  crop: CropTransform;
}) {
  const geometry = useMemo(() => new THREE.LatheGeometry(
    profile.cup.radialProfile.map((point) => new THREE.Vector2(point.radius, point.y)),
    128,
  ), [profile]);
  const opticalUniforms = useOpticalUniforms(sourceTexture, lutTexture, sourceSize, crop);
  const uniforms = useMemo(() => ({
    ...opticalUniforms,
    environmentMap: { value: environmentTexture },
    dishCenter: { value: new THREE.Vector3(...dish.dishCenter) },
    dishRadius: { value: dish.dishRadius },
    sphereRadius: { value: dish.sphereRadius },
    dishSag: { value: dish.dishSag },
  }), [dish, environmentTexture, opticalUniforms]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const top = profile.cup.radialProfile.at(-1)!;
  return <group position={profile.cup.axisOrigin as [number, number, number]}>
    <mesh geometry={geometry} castShadow>
      <shaderMaterial uniforms={uniforms} vertexShader={opticalVertexShader} fragmentShader={cupFragmentShader} glslVersion={THREE.GLSL3} toneMapped />
    </mesh>
    <mesh position={[0, top.y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <torusGeometry args={[top.radius, 0.00135, 12, 96]} />
      <meshStandardMaterial color="#b9a675" metalness={0.9} roughness={0.12} />
    </mesh>
    <mesh position={[0, top.y - 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[top.radius - 0.0015, 96]} />
      <meshStandardMaterial color="#292824" metalness={0.6} roughness={0.24} side={THREE.DoubleSide} />
    </mesh>
  </group>;
}

function CameraController({ profile, onCameraChange, resetNonce, cameraState }: Pick<Props, "onCameraChange" | "resetNonce" | "cameraState"> & { profile: OpticalProfile }) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const callback = useRef(onCameraChange);
  const handledResetNonce = useRef(resetNonce);
  useEffect(() => { callback.current = onCameraChange; }, [onCameraChange]);
  const { camera, invalidate } = useThree();
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
    onChange={() => invalidate()}
    onEnd={() => callback.current?.([camera.position.x, camera.position.y, camera.position.z])}
  />;
}

function SceneContents({ sourceUrl, sourceSize = [1, 1], crop, cameraState, opticalRuntime, previewSettings, sceneId = "studio-neutral", onCameraChange, onPreviewStateChange, resetNonce, resourceRetryNonce = 0 }: Props) {
  const preset = getScenePreset(sceneId);
  const profile = opticalRuntime.profile;
  const dish = useMemo(() => getDishReflectionParameters(profile), [profile]);
  const [quality, setQuality] = useState<SceneQuality>("high");
  const sourceTextureState = useSourceTexture(sourceUrl, resourceRetryNonce);
  const lutTextureState = useOpticalLut(opticalRuntime, resourceRetryNonce);
  const environmentTexture = useLoader(HDRLoader, HDR_PATH);
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
      status: lutTextureState.status === "ready" && sourceTextureState.status === "ready" ? "ready" : "loading",
    });
  }, [lutTextureState.status, onPreviewStateChange, sourceTextureState.status, sourceUrl]);

  const opticalReady = lutTextureState.status === "ready";
  const sourceReady = sourceTextureState.status === "ready";
  return <>
    <color attach="background" args={[preset.background]} />
    <ambientLight intensity={0.45} />
    <directionalLight position={[0.42, 0.72, 0.36]} intensity={preset.keyLightIntensity[quality] * previewSettings.keyLightMultiplier} castShadow={quality !== "low"} shadow-mapSize-width={quality === "high" ? 1024 : 512} shadow-mapSize-height={quality === "high" ? 1024 : 512} />
    <Environment map={environmentTexture} background={false} />
    {opticalReady ? <Dish profile={profile} sourceTexture={sourceReady ? sourceTextureState.value : null} lutTexture={lutTextureState.value} sourceSize={sourceSize} crop={crop} /> : null}
    {opticalReady ? <Cup profile={profile} dish={dish} sourceTexture={sourceReady ? sourceTextureState.value : null} lutTexture={lutTextureState.value} environmentTexture={environmentTexture} sourceSize={sourceSize} crop={crop} /> : null}
    <mesh position={[0, -0.011, 0]} receiveShadow><cylinderGeometry args={[0.7, 0.7, 0.018, 96]} /><meshStandardMaterial color={preset.table} roughness={0.72} /></mesh>
    <ContactShadows position={[0, -0.001, 0]} opacity={0.28} scale={0.62} blur={2.2} far={0.28} resolution={preset.contactShadowResolution[quality]} frames={1} />
    <PerformanceMonitor flipflops={2} onDecline={() => setQuality((current) => current === "high" ? "medium" : "low")} onIncline={() => setQuality((current) => current === "low" ? "medium" : "high")} />
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

function WebGlLifecycle({ onStateChange }: { onStateChange: (state: "loading" | "ready" | "error") => void }) {
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
  }, [gl, onStateChange]);
  return null;
}

export function ReflectiveCupPreview(props: Props) {
  const { onPreviewStateChange, resourceRetryNonce, sourceUrl } = props;
  const [webGlState, setWebGlState] = useState<"loading" | "ready" | "error">("loading");
  const [sceneState, setSceneState] = useState<PreviewLoadState>({ status: sourceUrl ? "loading" : "idle" });
  const reportSceneState = useCallback((state: PreviewLoadState) => setSceneState(state), []);
  const reportWebGlState = useCallback((state: "loading" | "ready" | "error") => setWebGlState(state), []);
  const reportWebGlFailure = useCallback(() => setWebGlState("error"), []);
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
      camera={{ position: [...props.cameraState.position], fov: props.opticalRuntime.profile.designCamera.verticalFovDegrees, near: 0.02, far: 3 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      shadows="basic"
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = props.previewSettings.toneMappingExposure;
      }}
      fallback={<div>WebGL 2 is required for the reflection preview.</div>}
    >
      <WebGlLifecycle onStateChange={reportWebGlState} />
      <Suspense fallback={null}><SceneContents {...props} onPreviewStateChange={reportSceneState} /></Suspense>
      </Canvas>
    </PreviewErrorBoundary>
  </div>;
}
