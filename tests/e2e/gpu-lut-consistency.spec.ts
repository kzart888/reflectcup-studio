import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import type { PlateTargetLut } from "../../src/optics";
import { samplePlateTargetLut } from "../../src/optics";
import { opticalSampling } from "../../src/rendering/shaders";

test("WebGL2 uses the same mask-weighted LUT interpolation as the CPU", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "one WebGL2 execution is sufficient");
  await page.goto("/");

  const width = 5;
  const height = 4;
  const targetUv = new Float32Array(width * height * 2);
  const validMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      targetUv[pixel * 2] = 0.08 + x * 0.19 + y * 0.011;
      targetUv[pixel * 2 + 1] = 0.12 + y * 0.22 + x * 0.007;
      validMask[pixel] = (x === 1 && y === 1) || (x === 4 && y === 2) ? 0 : 255;
    }
  }
  const lut: PlateTargetLut = { width, height, targetUv, validMask };
  const outputWidth = 23;
  const outputHeight = 19;

  const gpu = await page.evaluate(({ width, height, targetUv, validMask, outputWidth, outputHeight, opticalSampling }) => {
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 unavailable");

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
      in vec2 position;
      out vec2 plateUv;
      void main() { plateUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      in vec2 plateUv;
      out vec4 result;
      ${opticalSampling}
      void main() { vec4 lookup = sampleOpticalLookup(plateUv); result = vec4(lookup.rg, lookup.b, 1.0); }
    `);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    const packed = new Float32Array(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      packed[pixel * 4] = targetUv[pixel * 2];
      packed[pixel * 4 + 1] = targetUv[pixel * 2 + 1];
      packed[pixel * 4 + 2] = validMask[pixel] / 255;
      packed[pixel * 4 + 3] = 1;
    }
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, packed);
    gl.uniform1i(gl.getUniformLocation(program, "opticalLut"), 0);

    gl.viewport(0, 0, outputWidth, outputHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(outputWidth * outputHeight * 4);
    gl.readPixels(0, 0, outputWidth, outputHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return Array.from(pixels);
  }, { width, height, targetUv: Array.from(targetUv), validMask: Array.from(validMask), outputWidth, outputHeight, opticalSampling });

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const expected = samplePlateTargetLut(lut, [(x + 0.5) / outputWidth, (y + 0.5) / outputHeight]);
      const offset = (y * outputWidth + x) * 4;
      expect(gpu[offset + 2] > 127).toBe(Boolean(expected));
      if (expected) {
        expect(Math.abs(gpu[offset] / 255 - expected[0])).toBeLessThanOrEqual(1.5 / 255);
        expect(Math.abs(gpu[offset + 1] / 255 - expected[1])).toBeLessThanOrEqual(1.5 / 255);
      }
    }
  }
});

test("the published nominal LUT keeps the CPU and GPU hit masks aligned", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "one WebGL2 execution is sufficient");
  await page.goto("/");

  const width = 512;
  const height = 512;
  const targetBytes = Uint8Array.from(readFileSync("public/optical-profiles/nominal-v1/plate-to-target.rg32f"));
  const validMask = Uint8Array.from(readFileSync("public/optical-profiles/nominal-v1/plate-valid-mask.bin"));
  const lut: PlateTargetLut = {
    width,
    height,
    targetUv: new Float32Array(targetBytes.buffer),
    validMask,
  };
  const outputWidth = 257;
  const outputHeight = 257;

  const gpuMask = await page.evaluate(async ({ outputWidth, outputHeight, opticalSampling }) => {
    const [targetResponse, maskResponse] = await Promise.all([
      fetch("/optical-profiles/nominal-v1/plate-to-target.rg32f"),
      fetch("/optical-profiles/nominal-v1/plate-valid-mask.bin"),
    ]);
    if (!targetResponse.ok || !maskResponse.ok) throw new Error("Published nominal optical assets could not be loaded");
    const targetUv = new Float32Array(await targetResponse.arrayBuffer());
    const validMask = new Uint8Array(await maskResponse.arrayBuffer());
    const width = 512;
    const height = 512;
    if (targetUv.length !== width * height * 2 || validMask.length !== width * height) {
      throw new Error("Published nominal optical assets have unexpected dimensions");
    }

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 unavailable");
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
      in vec2 position;
      out vec2 plateUv;
      void main() { plateUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      in vec2 plateUv;
      out vec4 result;
      ${opticalSampling}
      void main() { vec4 lookup = sampleOpticalLookup(plateUv); result = vec4(lookup.b, 0.0, 0.0, 1.0); }
    `);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    const packed = new Float32Array(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      packed[pixel * 4] = targetUv[pixel * 2];
      packed[pixel * 4 + 1] = targetUv[pixel * 2 + 1];
      packed[pixel * 4 + 2] = validMask[pixel] / 255;
      packed[pixel * 4 + 3] = 1;
    }
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, packed);
    gl.uniform1i(gl.getUniformLocation(program, "opticalLut"), 0);

    gl.viewport(0, 0, outputWidth, outputHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(outputWidth * outputHeight * 4);
    gl.readPixels(0, 0, outputWidth, outputHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const result = new Uint8Array(outputWidth * outputHeight);
    for (let pixel = 0; pixel < result.length; pixel += 1) result[pixel] = pixels[pixel * 4] > 127 ? 1 : 0;
    return Array.from(result);
  }, { outputWidth, outputHeight, opticalSampling });

  const cpuMask = new Uint8Array(outputWidth * outputHeight);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      cpuMask[y * outputWidth + x] = samplePlateTargetLut(lut, [(x + 0.5) / outputWidth, (y + 0.5) / outputHeight]) ? 1 : 0;
    }
  }

  const nearCpuContour = (x: number, y: number) => {
    const center = cpuMask[y * outputWidth + x];
    for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
      for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (sampleX < 0 || sampleY < 0 || sampleX >= outputWidth || sampleY >= outputHeight) return true;
        if (cpuMask[sampleY * outputWidth + sampleX] !== center) return true;
      }
    }
    return false;
  };
  let intersection = 0;
  let union = 0;
  let compared = 0;
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      if (nearCpuContour(x, y)) continue;
      const pixel = y * outputWidth + x;
      const cpu = cpuMask[pixel] === 1;
      const gpu = gpuMask[pixel] === 1;
      if (cpu && gpu) intersection += 1;
      if (cpu || gpu) union += 1;
      compared += 1;
    }
  }
  const maskIou = intersection / union;
  testInfo.annotations.push({ type: "acceptance", description: `nominal LUT CPU/GPU core-mask IoU=${maskIou.toFixed(6)}` });
  expect(compared).toBeGreaterThan(outputWidth * outputHeight * 0.7);
  expect(union).toBeGreaterThan(outputWidth * outputHeight * 0.05);
  expect(maskIou).toBeGreaterThanOrEqual(0.995);
});
