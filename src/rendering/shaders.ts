import { DISH_REFLECTION_GLSL } from "@/optics/glsl";

export const opticalVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const opticalSampling = /* glsl */ `
  uniform sampler2D sourceMap;
  uniform sampler2D opticalLut;
  uniform bool hasSource;
  uniform vec2 sourceSize;
  uniform vec3 crop;

  void accumulateOpticalLookup(ivec2 coordinate, float contribution, inout vec2 targetUv, inout float weight) {
    if (contribution <= 0.0) return;
    vec4 candidate = texelFetch(opticalLut, coordinate, 0);
    if (candidate.b < 0.5) return;
    targetUv += candidate.rg * contribution;
    weight += contribution;
  }

  vec4 sampleOpticalLookup(vec2 plateUv) {
    ivec2 dimensions = textureSize(opticalLut, 0);
    vec2 upper = vec2(dimensions - ivec2(1));
    vec2 pixel = clamp(plateUv * vec2(dimensions) - vec2(0.5), vec2(0.0), upper);
    ivec2 centre = ivec2(floor(pixel + vec2(0.5)));
    if (texelFetch(opticalLut, centre, 0).b < 0.5) return vec4(0.0);

    ivec2 lower = ivec2(floor(pixel));
    ivec2 higher = min(lower + ivec2(1), dimensions - ivec2(1));
    vec2 fraction = fract(pixel);
    vec2 targetUv = vec2(0.0);
    float weight = 0.0;
    accumulateOpticalLookup(lower, (1.0 - fraction.x) * (1.0 - fraction.y), targetUv, weight);
    accumulateOpticalLookup(ivec2(higher.x, lower.y), fraction.x * (1.0 - fraction.y), targetUv, weight);
    accumulateOpticalLookup(ivec2(lower.x, higher.y), (1.0 - fraction.x) * fraction.y, targetUv, weight);
    accumulateOpticalLookup(higher, fraction.x * fraction.y, targetUv, weight);
    return weight > 0.0 ? vec4(targetUv / weight, 1.0, 1.0) : vec4(0.0);
  }

  vec4 samplePrintedImage(vec2 plateUv) {
    if (!hasSource || any(lessThan(plateUv, vec2(0.0))) || any(greaterThan(plateUv, vec2(1.0)))) {
      return vec4(0.0);
    }
    vec4 lookup = sampleOpticalLookup(plateUv);
    if (lookup.b < 0.5) return vec4(0.0);

    float aspect = max(sourceSize.x / max(sourceSize.y, 1.0), 0.0001);
    vec2 baseSpan = aspect >= 1.0 ? vec2(1.0 / aspect, 1.0) : vec2(1.0, aspect);
    vec2 sourceUv = crop.xy + (lookup.rg - vec2(0.5)) * baseSpan / crop.z;
    if (any(lessThan(sourceUv, vec2(0.0))) || any(greaterThan(sourceUv, vec2(1.0)))) {
      return vec4(0.0);
    }
    vec4 sampled = texture(sourceMap, sourceUv);
    return vec4(sampled.rgb, lookup.b * sampled.a);
  }
`;

export const plateFragmentShader = /* glsl */ `
  precision highp float;
  layout(location = 0) out highp vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  uniform vec3 heroLightDirection;
  uniform vec3 heroLightColor;
  uniform float heroLightIntensity;
  uniform float printAmbient;
  ${opticalSampling}

  void main() {
    vec4 printColor = samplePrintedImage(vUv);
    if (printColor.a < 0.01) discard;
    vec3 normal = normalize(vWorldNormal);
    vec3 lightDirection = normalize(heroLightDirection);
    float diffuse = max(dot(normal, lightDirection), 0.0);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float ceramicHighlight = pow(max(dot(normal, halfDirection), 0.0), 46.0) * 0.11;
    vec3 illumination = vec3(printAmbient) + heroLightColor * diffuse * heroLightIntensity * 0.24;
    vec3 shaded = printColor.rgb * illumination + heroLightColor * ceramicHighlight;
    gl_FragColor = vec4(shaded, printColor.a * 0.965);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const cupFragmentShader = /* glsl */ `
  precision highp float;
  layout(location = 0) out highp vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  ${opticalSampling}

  uniform vec3 dishCenter;
  uniform float dishRadius;
  uniform float sphereRadius;
  uniform float dishSag;
  uniform sampler2D envMap;
  uniform mat3 environmentRotation;
  uniform float environmentIntensity;
  uniform float mirrorRoughness;
  uniform vec3 dishBaseColor;
  ${DISH_REFLECTION_GLSL}
  #include <cube_uv_reflection_fragment>

  vec3 sampleEnvironment(vec3 direction) {
    #ifdef ENVMAP_TYPE_CUBE_UV
      return textureCubeUV(envMap, environmentRotation * direction, mirrorRoughness).rgb * environmentIntensity;
    #else
      return vec3(0.18);
    #endif
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 incident = normalize(vWorldPosition - cameraPosition);
    vec3 reflectionDirection = normalize(reflect(incident, normal));
    vec3 environment = sampleEnvironment(reflectionDirection);
    vec3 plateHit;
    vec4 printed = vec4(0.0);
    bool dishWasHit = reflectCupIntersectDish(
      vWorldPosition + reflectionDirection * 0.0002,
      reflectionDirection,
      dishCenter,
      dishRadius,
      sphereRadius,
      dishSag,
      plateHit
    );
    if (dishWasHit) {
      vec2 printUv = reflectCupPrintUv(plateHit, dishCenter, dishRadius);
      printed = samplePrintedImage(printUv);
    }

    float facing = clamp(dot(-incident, normal), 0.0, 1.0);
    float fresnel = 0.76 + 0.24 * pow(1.0 - facing, 5.0);
    vec3 reflectedColor = environment * vec3(0.985, 0.99, 0.985);
    if (dishWasHit) {
      // The plate is an opaque ceramic surface even where the printable LUT
      // has no coverage. Transparency means "no ink", not a hole through
      // which the distant environment remains visible.
      reflectedColor = mix(dishBaseColor, printed.rgb, printed.a);
    }
    vec3 mirrorColor = reflectedColor * fresnel;
    mirrorColor += vec3(0.012);
    gl_FragColor = vec4(mirrorColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
