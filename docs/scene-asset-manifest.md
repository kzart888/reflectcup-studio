# Scene asset release manifest

Generated for the 2026-07-19 scene pass. All third-party files below come from Poly Haven under CC0 1.0; the source and author credits remain in `scene-assets.md`. The 14 bundled Poly Haven files match the byte size and MD5 published by the official Poly Haven files API. Project-authored decals are deterministic outputs of `pnpm scene:bake` and contain no customer data.

These hashes are mirrored in `src/scenes/release-manifest.ts` and are part of the runtime v2 `SceneDescriptor.checksum`, together with visual parameters and explicit geometry/renderer pipeline versions. The v2 files use immutable versioned paths; the shared AO uses a content-hash path. Recompute the hashes and publish a new scene version whenever a visible asset changes. Never overwrite the pinned identity-only v1 checksums.

## Warm Craftsman home

Runtime prefix: `public/scenes/warm-craftsman-home/v2/`.

| Repository file | Bytes | SHA-256 | Provenance |
| --- | ---: | --- | --- |
| `environment-1k.hdr` | 1,662,018 | `fb0657b1145fa21107e5e925a9da6c8e84038ea6df585412e42400e8970670d1` | Poly Haven `warm_restaurant`, CC0, 1K HDR |
| `environment-2k.hdr` | 6,517,786 | `e3d281b3773ee013069e14243b530f21f219b387f5319da1e3c5193f04ce68a1` | Poly Haven `warm_restaurant`, CC0, 2K HDR |
| `textures/oak-color.jpg` | 336,305 | `d171f45ef01bc6e239b00dfaa4961bcd27f7d8e93e3962da3bd3d0ce703d802c` | Poly Haven `fine_grained_wood`, CC0, 1K diffuse |
| `textures/oak-normal.jpg` | 193,626 | `ba95eadc009818e161d0f753191f1bacc3fc861e593be0bc6d82b437f9ec8044` | Poly Haven `fine_grained_wood`, CC0, 1K OpenGL normal |
| `textures/oak-roughness.jpg` | 215,155 | `f281f682e62fe322303dfeaa13dac18b5cb9e113617fe0aca43605b49161d82b` | Poly Haven `fine_grained_wood`, CC0, 1K roughness |
| `table-shadow.png` | 21,818 | `7905ea45eda58f1a6533442006043e5707fa07ad580fb57132f069859d36da31` | ReflectCup Studio deterministic bake |

## Forest camp evening

Runtime prefix: `public/scenes/forest-camp-evening/v2/`.

| Repository file | Bytes | SHA-256 | Provenance |
| --- | ---: | --- | --- |
| `environment-1k.hdr` | 1,899,638 | `38a1fb0e3c3a8f36516107a9b6ca4d25b8ddf9196748607a68c5c06e234852da` | Poly Haven `dark_autumn_forest`, CC0, 1K HDR |
| `environment-2k.hdr` | 7,537,076 | `8aae232ebfcae34a8ee0154f4fbb793e659e7dfdf27e5e14beee67b42b5e32cc` | Poly Haven `dark_autumn_forest`, CC0, 2K HDR |
| `textures/walnut-color.jpg` | 754,754 | `d68da31655bf47024af893156a6a01a6c95bb60f55d97e2dc9bdd47be320e5b5` | Poly Haven `dark_wood`, CC0, 1K diffuse |
| `textures/walnut-normal.jpg` | 344,338 | `c42541f1bda0a14b39f120c24407eeba699af8ac85b371c7cef98ffd7d7b13bf` | Poly Haven `dark_wood`, CC0, 1K OpenGL normal |
| `textures/walnut-roughness.jpg` | 574,415 | `47ea12dbf649109b02eaa164dde9732a74e839957f29ad0ec7f5266b575d1835` | Poly Haven `dark_wood`, CC0, 1K roughness |
| `textures/bark-color.jpg` | 729,893 | `4213441aebcb72b9911f5a860e9ce74a61a8f6ce3b9c23d1f204173e7e7f6066` | Poly Haven `bark_brown_01`, CC0, 1K diffuse |
| `textures/bark-normal.jpg` | 1,226,534 | `9d1537b3429579436a62890bb7c5050a0172a15ce768787eacde81c5ccefc9cc` | Poly Haven `bark_brown_01`, CC0, 1K OpenGL normal |
| `textures/bark-roughness.jpg` | 201,307 | `4e7f62508cf77faebfeee15ffb571ff02c45c18d5174aa19fcb8b98506359c5c` | Poly Haven `bark_brown_01`, CC0, 1K roughness |
| `table-shadow.png` | 22,555 | `adca9e9828f197667b69136bc3c1f5ff71d3ecdf99dd54ae15a97c763312d82f` | ReflectCup Studio deterministic bake |

## Neutral studio and shared decals

The current studio release uses `public/scenes/studio-neutral/v2/`; its original root HDR remains available for the legacy release. Shared AO path: `public/scenes/shared/f30bf914fdcc7fc6/cup-contact-ao.png`.

| Repository file | Bytes | SHA-256 | Provenance |
| --- | ---: | --- | --- |
| `studio-neutral/v2/studio_small_08_1k.hdr` | 1,508,872 | `f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba` | Poly Haven `studio_small_08`, CC0, 1K HDR |
| `studio-neutral/v2/table-shadow.png` | 17,297 | `8883a7f375d4e5359afa3acc5f25b0030b94f58555f6885f91038f7f003e5070` | ReflectCup Studio deterministic bake |
| `shared/f30bf914fdcc7fc6/cup-contact-ao.png` | 17,250 | `f30bf914fdcc7fc6360e4a0f99a23dbb4ec38e45fdaf83c4edca13949a860b7e` | ReflectCup Studio deterministic bake |

## Budget check

The largest high-quality scene is `forest-camp-evening`: 11,368,317 bytes for its catalogued environment and material textures, or 11,408,122 bytes including the scene shadow and shared cup AO. This remains below the 12 MB scene-package ceiling. The warm scene totals 7,301,940 bytes including its decals; the neutral scene totals 1,543,419 bytes.
