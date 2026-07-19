"""Bake immutable v3 lighting layers with Blender Cycles.

Run from the repository root:

    "D:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" \
      --background --factory-startup \
      --python tools/scenes/bake-lighting-v3.py -- --samples 32 --device CPU

The output is display-only.  It never reads or writes an optical LUT, a source
image, or a production-print PNG.  Blender is Z-up internally; the generated
textures are authored for the runtime XZ receiver plane (runtime Y-up).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from array import array
from dataclasses import dataclass
from pathlib import Path
import struct
import sys
import tempfile
import zlib

import bpy


BAKE_SEED = 260719
BLENDER_VERSION = ".".join(str(part) for part in bpy.app.version)
PLATE_RADIUS_M = 0.0912462
CUP_AXIS_X_M = -0.03
CUP_FOOT_RADIUS_M = 0.031952057
CUP_HEIGHT_M = 0.071911155
CUP_TOP_RADIUS_M = 0.04
DISH_SPHERE_RADIUS_M = 0.4212935
CONTACT_AO_DISTANCE_M = 0.012


@dataclass(frozen=True)
class SceneBake:
    scene_id: str
    width: int
    height: int
    physical_width_m: float
    physical_height_m: float
    tint: tuple[int, int, int]
    alpha_gain: float
    max_alpha: float
    world_strength: float
    lights: tuple[dict[str, object], ...]
    table_base: tuple[int, int, int]
    grain: tuple[int, int, int]


SCENE_BAKES = (
    SceneBake(
        scene_id="warm-craftsman-home",
        width=1024,
        height=768,
        physical_width_m=0.48,
        physical_height_m=0.36,
        tint=(39, 29, 21),
        alpha_gain=1.3,
        max_alpha=0.46,
        world_strength=0.17,
        lights=(
            {
                "name": "window-area",
                "type": "AREA",
                "location": (-0.34, -0.42, 0.86),
                "energy": 510.0,
                "size": 0.46,
                "color": (1.0, 0.82, 0.62),
            },
        ),
        table_base=(176, 123, 75),
        grain=(88, 53, 30),
    ),
    SceneBake(
        scene_id="forest-camp-evening",
        width=1024,
        height=768,
        physical_width_m=0.48,
        physical_height_m=0.36,
        tint=(18, 20, 17),
        alpha_gain=1.45,
        max_alpha=0.5,
        world_strength=0.105,
        lights=(
            {
                "name": "evening-sky-area",
                "type": "AREA",
                "location": (-0.42, 0.46, 0.92),
                "energy": 245.0,
                "size": 0.78,
                "color": (0.58, 0.70, 1.0),
            },
            {
                "name": "lantern-area",
                "type": "AREA",
                "location": (0.38, -0.45, 0.34),
                "energy": 175.0,
                "size": 0.16,
                "color": (1.0, 0.50, 0.19),
            },
        ),
        table_base=(83, 58, 45),
        grain=(37, 25, 20),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="ReflectCup Studio repository root",
    )
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--resolution-scale", type=float, default=1.0)
    parser.add_argument("--device", choices=("AUTO", "CPU", "OPTIX"), default="CPU")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if args.samples < 16:
        parser.error("--samples must be at least 16")
    if not 0.25 <= args.resolution_scale <= 1.0:
        parser.error("--resolution-scale must be between 0.25 and 1.0")
    return args


def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 90
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1
    scene.render.pixel_aspect_y = 1
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    return scene


def configure_cycles_device(scene: bpy.types.Scene, requested: str) -> str:
    if requested == "CPU":
        scene.cycles.device = "CPU"
        return "CPU"
    try:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "OPTIX"
        preferences.get_devices()
        enabled: list[str] = []
        for device in preferences.devices:
            device.use = device.type == "OPTIX"
            if device.use:
                enabled.append(device.name)
        if enabled:
            scene.cycles.device = "GPU"
            return "OPTIX:" + ", ".join(enabled)
    except (KeyError, RuntimeError, TypeError):
        if requested == "OPTIX":
            raise
    if requested == "OPTIX":
        raise RuntimeError("OPTIX was requested but Blender found no OPTIX device")
    scene.cycles.device = "CPU"
    return "CPU (AUTO fallback)"


def configure_cycles(
    scene: bpy.types.Scene,
    width: int,
    height: int,
    samples: int,
    device: str,
) -> str:
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True

    # Cycles is slower than a realtime shadow map, but this is an immutable
    # offline asset.  It gives the area-light projection a continuous penumbra;
    # CPU is the reproducible default and OPTIX remains an explicit option.
    scene.render.engine = "CYCLES"
    resolved_device = configure_cycles_device(scene, device)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.render.fps = 24
    scene.render.film_transparent = False
    # Kept in metadata so changing the quality setting changes the release.
    scene["reflectcup_samples"] = samples
    scene["reflectcup_seed"] = BAKE_SEED
    scene["reflectcup_device"] = resolved_device
    return resolved_device


def set_world(scene: bpy.types.Scene, strength: float, color: tuple[float, float, float]) -> None:
    world = bpy.data.worlds.new("ReflectCup baked world")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (*color, 1.0)
    background.inputs["Strength"].default_value = strength
    scene.world = world


def principled_material(name: str, color: tuple[float, float, float, float], roughness: float = 0.72):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0
    return material


def add_camera(scene: bpy.types.Scene, width_m: float, height_m: float) -> bpy.types.Object:
    data = bpy.data.cameras.new("Top orthographic camera")
    data.type = "ORTHO"
    data.ortho_scale = height_m
    data.lens = 35
    camera = bpy.data.objects.new("Top orthographic camera", data)
    camera.location = (0.0, 0.0, 1.0)
    camera.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    expected_ratio = width_m / height_m
    actual_ratio = scene.render.resolution_x / scene.render.resolution_y
    if abs(expected_ratio - actual_ratio) > 1e-6:
        raise RuntimeError("Render aspect ratio must match physical receiver extent")
    return camera


def add_area_light(spec: dict[str, object]) -> bpy.types.Object:
    data = bpy.data.lights.new(str(spec["name"]), type=str(spec["type"]))
    data.energy = float(spec["energy"])
    data.color = tuple(spec["color"])
    data.shape = "DISK"
    data.size = float(spec["size"])
    light = bpy.data.objects.new(str(spec["name"]), data)
    light.location = tuple(spec["location"])
    bpy.context.collection.objects.link(light)
    return light


def dish_height(radius: float) -> float:
    return DISH_SPHERE_RADIUS_M - math.sqrt(
        max(0.0, DISH_SPHERE_RADIUS_M * DISH_SPHERE_RADIUS_M - radius * radius)
    )


def add_bevel(obj: bpy.types.Object, width: float, segments: int = 4) -> None:
    modifier = obj.modifiers.new("manufacturing edge bevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments


def add_shadow_subject() -> list[bpy.types.Object]:
    """Add a dimensionally representative v3 saucer, cup and hidden handle."""
    objects: list[bpy.types.Object] = []
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=160,
        radius=PLATE_RADIUS_M,
        depth=0.012,
        location=(0.0, 0.0, 0.006),
    )
    dish = bpy.context.object
    dish.name = "curved-cup-v3 saucer shadow proxy"
    add_bevel(dish, 0.0014, 5)
    objects.append(dish)

    cup_base_z = 0.012
    bpy.ops.mesh.primitive_cone_add(
        vertices=160,
        radius1=CUP_FOOT_RADIUS_M,
        radius2=CUP_TOP_RADIUS_M,
        depth=CUP_HEIGHT_M,
        location=(CUP_AXIS_X_M, 0.0, cup_base_z + CUP_HEIGHT_M / 2),
    )
    cup = bpy.context.object
    cup.name = "curved-cup-v3 cup shadow proxy"
    add_bevel(cup, 0.00075, 4)
    objects.append(cup)

    # A closed torus is intentionally used as a robust shadow proxy: the half
    # intersecting the body is occluded, leaving the specified compact C form.
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.017,
        minor_radius=0.0035,
        major_segments=96,
        minor_segments=12,
        location=(CUP_AXIS_X_M - 0.027, 0.0, cup_base_z + 0.044),
        rotation=(math.pi / 2, 0.0, 0.0),
    )
    handle = bpy.context.object
    handle.name = "curved-cup-v3 handle shadow proxy"
    objects.append(handle)

    for obj in objects:
        obj.data.materials.append(principled_material(f"{obj.name} matte", (0.55, 0.55, 0.55, 1.0)))
    return objects


def render_pixels(scene: bpy.types.Scene) -> array:
    handle, temporary_name = tempfile.mkstemp(prefix="reflectcup-lighting-", suffix=".exr")
    os.close(handle)
    temporary_path = Path(temporary_name)
    previous_format = scene.render.image_settings.file_format
    previous_depth = scene.render.image_settings.color_depth
    scene.render.filepath = str(temporary_path)
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "ZIP"
    try:
        bpy.ops.render.render(write_still=True)
        result = bpy.data.images.load(str(temporary_path), check_existing=False)
        pixels = array("f", result.pixels[:])
        result_size = tuple(result.size[:])
        bpy.data.images.remove(result)
    finally:
        scene.render.image_settings.file_format = previous_format
        scene.render.image_settings.color_depth = previous_depth
        temporary_path.unlink(missing_ok=True)
    expected = scene.render.resolution_x * scene.render.resolution_y * 4
    if len(pixels) != expected:
        raise RuntimeError(
            f"Render Result returned {len(pixels)} floats for {result_size}, expected {expected}"
        )
    return pixels


def render_table_layers(
    config: SceneBake,
    samples: int,
    scale: float,
    device: str,
) -> tuple[bytes, bytes, dict[str, object]]:
    width = max(256, round(config.width * scale))
    height = max(192, round(config.height * scale))
    scene = reset_scene()
    resolved_device = configure_cycles(scene, width, height, samples, device)
    set_world(scene, config.world_strength, (0.55, 0.58, 0.62))
    add_camera(scene, config.physical_width_m, config.physical_height_m)

    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0.0, 0.0, 0.0))
    receiver = bpy.context.object
    receiver.name = f"{config.scene_id} table receiver"
    receiver.scale = (config.physical_width_m / 2, config.physical_height_m / 2, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    receiver.data.materials.append(principled_material("neutral receiver", (0.72, 0.72, 0.72, 1.0), 0.78))

    for light in config.lights:
        add_area_light(light)

    subject = add_shadow_subject()
    for obj in subject:
        obj.hide_render = True
    baseline = render_pixels(scene)

    for obj in subject:
        obj.hide_render = False
        obj.visible_camera = False
        obj.visible_glossy = True
        obj.visible_diffuse = True
        obj.visible_shadow = True
    shadowed = render_pixels(scene)

    shadow_rgba = bytearray(width * height * 4)
    lightmap_rgba = bytearray(width * height * 4)
    nonzero: list[int] = []
    alpha_sum = 0
    maximum = 0
    base_luminance = array("f")
    for y_top in range(height):
        source_y = height - 1 - y_top
        for x in range(width):
            source_offset = (source_y * width + x) * 4
            base_luminance.append(
                baseline[source_offset] * 0.2126
                + baseline[source_offset + 1] * 0.7152
                + baseline[source_offset + 2] * 0.0722
            )
    minimum_irradiance = min(base_luminance)
    maximum_irradiance = max(base_luminance)
    irradiance_span = max(1e-6, maximum_irradiance - minimum_irradiance)

    for y_top in range(height):
        source_y = height - 1 - y_top
        for x in range(width):
            source_offset = (source_y * width + x) * 4
            output_offset = (y_top * width + x) * 4
            base_lum = base_luminance[y_top * width + x]
            shaded_lum = (
                shadowed[source_offset] * 0.2126
                + shadowed[source_offset + 1] * 0.7152
                + shadowed[source_offset + 2] * 0.0722
            )
            raw = max(0.0, (base_lum - shaded_lum) / max(base_lum, 1e-5))
            effective_shadow = max(0.0, raw - 0.006)
            alpha = config.max_alpha * (1.0 - math.exp(-effective_shadow * config.alpha_gain))
            alpha_byte = round(alpha * 255)
            shadow_rgba[output_offset : output_offset + 4] = bytes((*config.tint, alpha_byte))
            if alpha_byte:
                nonzero.append(alpha_byte)
                alpha_sum += alpha_byte
                maximum = max(maximum, alpha_byte)

            # Baseline irradiance is staged as an opaque UV2 lightmap.  It is
            # normalized to retain material colour and never includes the
            # dynamic optical subject.
            irradiance = min(1.0, max(0.0, (base_lum - minimum_irradiance) / irradiance_span))
            level = round(205 + 50 * math.sqrt(irradiance))
            lightmap_rgba[output_offset : output_offset + 4] = bytes((level, level, level, 255))

    stats = alpha_stats(width, height, nonzero, alpha_sum, maximum)
    stats["renderDevice"] = resolved_device
    stats["baselineIrradianceLinear"] = {
        "min": round(minimum_irradiance, 6),
        "max": round(maximum_irradiance, 6),
    }
    return bytes(shadow_rgba), bytes(lightmap_rgba), stats


def create_dish_top_mesh(name: str, radial_steps: int = 72, segments: int = 192) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = [(0.0, 0.0, 0.0)]
    uv_coordinates: list[tuple[float, float]] = [(0.5, 0.5)]
    for radial in range(1, radial_steps + 1):
        radius = PLATE_RADIUS_M * radial / radial_steps
        z = dish_height(radius)
        for segment in range(segments):
            angle = 2 * math.pi * segment / segments
            x = radius * math.cos(angle)
            y = radius * math.sin(angle)
            vertices.append((x, y, z))
            uv_coordinates.append((0.5 + x / (2 * PLATE_RADIUS_M), 0.5 - y / (2 * PLATE_RADIUS_M)))

    faces: list[tuple[int, ...]] = []
    for segment in range(segments):
        faces.append((0, 1 + segment, 1 + (segment + 1) % segments))
    for radial in range(1, radial_steps):
        current = 1 + (radial - 1) * segments
        following = 1 + radial * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((current + segment, following + segment, following + nxt, current + nxt))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    dish = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(dish)

    uv_layer = mesh.uv_layers.new(name="printUV")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uv_coordinates[vertex_index]
    return dish


def add_conforming_cup_foot() -> bpy.types.Object:
    segments = 192
    inner_radius = CUP_FOOT_RADIUS_M - 0.0024
    outer_radius = CUP_FOOT_RADIUS_M
    vertices: list[tuple[float, float, float]] = []
    for top in (False, True):
        for radius in (inner_radius, outer_radius):
            for segment in range(segments):
                angle = 2 * math.pi * segment / segments
                x = CUP_AXIS_X_M + radius * math.cos(angle)
                y = radius * math.sin(angle)
                local_plate_z = dish_height(math.hypot(x, y))
                vertices.append((x, y, local_plate_z + (0.00028 if not top else 0.009)))

    def index(top: int, ring: int, segment: int) -> int:
        return top * segments * 2 + ring * segments + segment % segments

    faces: list[tuple[int, ...]] = []
    for segment in range(segments):
        nxt = segment + 1
        faces.extend(
            [
                (index(0, 1, segment), index(0, 1, nxt), index(1, 1, nxt), index(1, 1, segment)),
                (index(0, 0, nxt), index(0, 0, segment), index(1, 0, segment), index(1, 0, nxt)),
                (index(1, 0, segment), index(1, 1, segment), index(1, 1, nxt), index(1, 0, nxt)),
                (index(0, 0, nxt), index(0, 1, nxt), index(0, 1, segment), index(0, 0, segment)),
            ]
        )
    mesh = bpy.data.meshes.new("curved-cup-v3 conforming foot")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    foot = bpy.data.objects.new("curved-cup-v3 conforming foot", mesh)
    bpy.context.collection.objects.link(foot)
    return foot


def bake_contact_ao(samples: int, scale: float, device: str) -> tuple[bytes, dict[str, object]]:
    size = max(256, round(1024 * scale))
    scene = reset_scene()
    scene.render.engine = "CYCLES"
    resolved_device = configure_cycles_device(scene, device)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.max_bounces = 3
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 1
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    set_world(scene, 0.0, (1.0, 1.0, 1.0))

    add_camera(scene, 2 * PLATE_RADIUS_M, 2 * PLATE_RADIUS_M)
    dish = create_dish_top_mesh("curved-cup-v3 AO receiver")
    foot = add_conforming_cup_foot()

    material = bpy.data.materials.new("Cycles AO receiver")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = CONTACT_AO_DISTANCE_M
    ao.samples = max(32, min(samples, 128))
    material.node_tree.links.new(ao.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    dish.data.materials.append(material)
    foot.data.materials.append(principled_material("foot occluder", (0.4, 0.4, 0.4, 1.0)))

    foot.hide_render = True
    baseline = render_pixels(scene)
    foot.hide_render = False
    foot.visible_camera = False
    foot.visible_diffuse = True
    foot.visible_shadow = True
    occluded = render_pixels(scene)

    rgba = bytearray(size * size * 4)
    nonzero: list[int] = []
    alpha_sum = 0
    maximum = 0
    for y_top in range(size):
        source_y = size - 1 - y_top
        v = (y_top + 0.5) / size
        plate_y = (0.5 - v) * 2 * PLATE_RADIUS_M
        for x in range(size):
            u = (x + 0.5) / size
            plate_x = (u - 0.5) * 2 * PLATE_RADIUS_M
            source_offset = (source_y * size + x) * 4
            output_offset = (y_top * size + x) * 4
            base = baseline[source_offset] * 0.2126 + baseline[source_offset + 1] * 0.7152 + baseline[source_offset + 2] * 0.0722
            dark = occluded[source_offset] * 0.2126 + occluded[source_offset + 1] * 0.7152 + occluded[source_offset + 2] * 0.0722
            raw = max(0.0, base - dark)
            edge_distance = math.hypot(plate_x - CUP_AXIS_X_M, plate_y) - CUP_FOOT_RADIUS_M
            within_plate = math.hypot(plate_x, plate_y) <= PLATE_RADIUS_M
            if not within_plate or edge_distance < -0.0022 or edge_distance > 0.012:
                alpha = 0.0
            else:
                # Preserve the Cycles AO signal while applying the physically
                # specified manufacturing envelope: strong for 1-3 mm and
                # smoothly zero by 12 mm from the foot edge.
                outward = max(0.0, edge_distance)
                envelope = math.exp(-((outward / 0.0048) ** 1.45))
                alpha = min(0.52, max(0.0, raw * 1.55) * envelope)
            alpha_byte = round(alpha * 255)
            rgba[output_offset : output_offset + 4] = bytes((29, 25, 21, alpha_byte))
            if alpha_byte:
                nonzero.append(alpha_byte)
                alpha_sum += alpha_byte
                maximum = max(maximum, alpha_byte)

    stats = alpha_stats(size, size, nonzero, alpha_sum, maximum)
    stats.update(
        {
            "plateRadiusMm": PLATE_RADIUS_M * 1000,
            "cupAxisMm": [CUP_AXIS_X_M * 1000, 0],
            "cupFootRadiusMm": CUP_FOOT_RADIUS_M * 1000,
            "contactPeakBandMm": [1, 3],
            "fadeCutoffMm": 12,
            "aoDistanceMm": CONTACT_AO_DISTANCE_M * 1000,
            "renderDevice": resolved_device,
        }
    )
    return bytes(rgba), stats


def alpha_stats(width: int, height: int, nonzero: list[int], alpha_sum: int, maximum: int) -> dict[str, object]:
    sorted_values = sorted(nonzero)

    def percentile(fraction: float) -> int:
        if not sorted_values:
            return 0
        return sorted_values[min(len(sorted_values) - 1, round((len(sorted_values) - 1) * fraction))]

    return {
        "width": width,
        "height": height,
        "nonzeroPixels": len(nonzero),
        "coveragePercent": round(100 * len(nonzero) / (width * height), 4),
        "meanAlphaFullImage": round(alpha_sum / max(1, width * height), 4),
        "meanAlphaNonzero": round(alpha_sum / max(1, len(nonzero)), 4),
        "p50AlphaNonzero": percentile(0.5),
        "p95AlphaNonzero": percentile(0.95),
        "maxAlpha": maximum,
    }


def chunk(name: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + name + payload + struct.pack(">I", zlib.crc32(name + payload) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    if len(rgba) != width * height * 4:
        raise ValueError(f"Unexpected RGBA byte count for {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    scanlines = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(scanlines, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def make_proof(config: SceneBake, shadow_rgba: bytes, lightmap_rgba: bytes, width: int, height: int) -> bytes:
    output = bytearray(width * height * 4)
    scale_x = config.physical_width_m / width
    scale_y = config.physical_height_m / height
    for y in range(height):
        physical_y = (0.5 - (y + 0.5) / height) * config.physical_height_m
        for x in range(width):
            physical_x = ((x + 0.5) / width - 0.5) * config.physical_width_m
            offset = (y * width + x) * 4
            grain_wave = 0.5 + 0.5 * math.sin((physical_y / max(scale_y, 1e-6)) * 0.27 + math.sin(physical_x * 41) * 1.8)
            light = lightmap_rgba[offset] / 255
            base = [round((config.table_base[channel] * 0.88 + config.grain[channel] * 0.12 * grain_wave) * light) for channel in range(3)]
            alpha = shadow_rgba[offset + 3] / 255
            for channel in range(3):
                base[channel] = round(base[channel] * (1 - alpha) + shadow_rgba[offset + channel] * alpha)

            # Overlay a simple neutral subject silhouette after the lighting
            # layer, proving that the projection remains outside the saucer.
            radius = math.hypot(physical_x, physical_y)
            cup_radius = math.hypot(physical_x - CUP_AXIS_X_M, physical_y)
            if radius <= PLATE_RADIUS_M:
                shade = 228 + round(12 * max(0.0, 1 - radius / PLATE_RADIUS_M))
                base = [shade, shade - 2, shade - 7]
            if cup_radius <= CUP_FOOT_RADIUS_M:
                base = [124, 127, 126]
            output[offset : offset + 4] = bytes((*[max(0, min(255, value)) for value in base], 255))
    return bytes(output)


def make_contact_proof(ao_rgba: bytes, size: int) -> bytes:
    output = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            offset = (y * size + x) * 4
            u = (x + 0.5) / size
            v = (y + 0.5) / size
            plate_x = (u - 0.5) * 2 * PLATE_RADIUS_M
            plate_y = (0.5 - v) * 2 * PLATE_RADIUS_M
            radius = math.hypot(plate_x, plate_y)
            cup_radius = math.hypot(plate_x - CUP_AXIS_X_M, plate_y)
            base = [244, 241, 234] if radius <= PLATE_RADIUS_M else [210, 204, 194]
            alpha = ao_rgba[offset + 3] / 255
            base = [round(channel * (1 - alpha) + ao_rgba[offset + i] * alpha) for i, channel in enumerate(base)]
            if cup_radius <= CUP_FOOT_RADIUS_M - 0.0012:
                base = [153, 157, 156]
            output[offset : offset + 4] = bytes((*base, 255))
    return bytes(output)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    repo = args.repo_root.resolve()
    generated: list[Path] = []

    for config in SCENE_BAKES:
        shadow, lightmap, stats = render_table_layers(
            config,
            args.samples,
            args.resolution_scale,
            args.device,
        )
        width = max(256, round(config.width * args.resolution_scale))
        height = max(192, round(config.height * args.resolution_scale))
        runtime_output = repo / "public" / "scenes" / config.scene_id / "v3" / "lighting"
        evidence_output = repo / "docs" / "assets" / "scenes" / "v3-lighting" / config.scene_id
        shadow_path = runtime_output / "table-shadow.png"
        lightmap_path = evidence_output / "static-irradiance-lightmap.png"
        proof_path = evidence_output / "table-shadow-proof.png"
        write_png(shadow_path, width, height, shadow)
        write_png(lightmap_path, width, height, lightmap)
        write_png(proof_path, width, height, make_proof(config, shadow, lightmap, width, height))
        generated.extend((shadow_path, lightmap_path, proof_path))
        metadata = {
            "schemaVersion": 1,
            "sceneId": config.scene_id,
            "sceneVersion": 3,
            "bakeEngine": "Blender Cycles fixed area-light projection",
            "blenderVersion": BLENDER_VERSION,
            "seed": BAKE_SEED,
            "samplesContract": args.samples,
            "physicalExtentMetres": [config.physical_width_m, config.physical_height_m],
            "lights": config.lights,
            "shadowAlpha": stats,
            "runtimeContract": "display-only; never sample from optical export",
            "files": {
                path.name: {"bytes": path.stat().st_size, "sha256": sha256(path)}
                for path in (shadow_path, lightmap_path, proof_path)
            },
        }
        write_json(evidence_output / "bake.json", metadata)
        generated.append(evidence_output / "bake.json")
        print(f"Baked {config.scene_id}: {stats}")

    contact, stats = bake_contact_ao(args.samples, args.resolution_scale, args.device)
    contact_size = max(256, round(1024 * args.resolution_scale))
    runtime_output = repo / "public" / "profiles" / "curved-cup-v3" / "lighting"
    evidence_output = repo / "docs" / "assets" / "scenes" / "v3-lighting" / "curved-cup-v3"
    contact_path = runtime_output / "cup-contact-ao.png"
    proof_path = evidence_output / "cup-contact-ao-proof.png"
    write_png(contact_path, contact_size, contact_size, contact)
    write_png(proof_path, contact_size, contact_size, make_contact_proof(contact, contact_size))
    generated.extend((contact_path, proof_path))
    metadata = {
        "schemaVersion": 1,
        "opticalProfile": "curved-cup-v3",
        "bakeEngine": "Blender Cycles ambient-occlusion shader envelope",
        "blenderVersion": BLENDER_VERSION,
        "seed": BAKE_SEED,
        "samplesContract": args.samples,
        "contactAlpha": stats,
        "runtimeContract": "display-only plate overlay; never sample from optical export",
        "files": {
            path.name: {"bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in (contact_path, proof_path)
        },
    }
    write_json(evidence_output / "bake.json", metadata)
    generated.append(evidence_output / "bake.json")
    print(f"Baked curved-cup-v3 contact AO: {stats}")
    print("Generated files:")
    for path in generated:
        print(os.path.relpath(path, repo))


if __name__ == "__main__":
    main()
