# Legacy asset boundary

The workspace stores the 2025 Flask/Three.js proof of concept, a 1024² Rhino/Grasshopper-derived mapping CSV, Blender/OBJ/GLB geometry, research reports, a CVPR paper and a ComfyUI workflow under the ignored `private/legacy-2025-poc/` directory. They are excluded from the public repository and are not runtime dependencies. A private `INVENTORY.md` records verified SHA-256 values.

Known evidence:

- The two historic mapping CSV copies are identical and contain 1,048,576 samples with roughly 52.009% valid entries.
- The two `transform_plate.py` copies are identical.
- The legacy renderer does not reflect the plate: its CubeCamera update is disabled and the cup samples only an environment texture.
- The historic plate UV and the Python top-view image use incompatible conventions.

Do not delete or rewrite these assets until the new nominal profile, goldens and private backup have been verified. When archived, retain one canonical copy plus hashes and a private inventory; temporary uploads/outputs remain disposable.
