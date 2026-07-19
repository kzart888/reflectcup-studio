# Scene asset release manifest

Updated for the 2026-07-19 v4 composition pass. The current home/forest releases reuse their immutable v3 HDR/GLB/Cycles payloads and selected immutable v2 PBR textures; studio remains v2. The authoritative executable manifest is `src/scenes/release-manifest.ts`; tests independently verify every listed byte size, SHA-256 and canonical release checksum.

Poly Haven model/environment downloads are CC0. The tent derivative comes from Kenney's CC0 Survival Kit. Raw bundles remain ignored; public GLBs are normalised derivatives. Project-authored Cycles decals contain no customer data. Detailed source-bundle hashes and conversion validation are in [`scene-model-sources-v3.md`](scene-model-sources-v3.md).

## Current release identities

| Scene | Current version | Release checksum |
| --- | ---: | --- |
| `warm-craftsman-home` | 4 | `ee834113e1febd642ae02d0f135f3652d9e962ed437d40ef189d4af16a59079e` |
| `forest-camp-evening` | 4 | `457ae5440ee49a4bdcf597c656b92c26f7350f67e85e739fb86621fb2a40ecb5` |
| `studio-neutral` | 2 | `b2284d246bab7eecab47690467374eca132330bf95f7aee7d5c01ec927df5616` |

The v1 identities and former home/forest v2/v3 releases remain pinned in code for old snapshots/regression. The v4 layout does not rewrite any v3 asset byte.

## Warm Craftsman home v4 (v3 payload + v2 floor maps)

Primary reused payload prefix: `public/scenes/warm-craftsman-home/v3/`. The three room-floor maps are separately reused from `public/scenes/warm-craftsman-home/v2/textures/`; the v4 release checksum binds both exact path families.

| Release asset | Bytes | SHA-256 | Provenance / role |
| --- | ---: | --- | --- |
| `environment-1k.hdr` | 1,662,018 | `fb0657b1145fa21107e5e925a9da6c8e84038ea6df585412e42400e8970670d1` | Poly Haven Warm Restaurant, CC0; PMREM/environment-lighting input only, never the v4 visible background |
| `environment-2k.hdr` | 6,517,786 | `e3d281b3773ee013069e14243b530f21f219b387f5319da1e3c5193f04ce68a1` | High-tier PMREM input; same CC0 environment at 2K |
| `models/wooden-table-01.glb` | 540,264 | `4125d43bdd6a868819b059ed578236474163b7762b08afc03a7c68731ea2d3b9` | Poly Haven CC0 derivative; Meshopt + embedded PBR inputs |
| `models/wooden-table-01-low.glb` | 167,372 | `8fb0ac43adecc9ddb0c000a96b9d1af4c2a384650fa1489b058cefc70b732f19` | Low; unchanged geometry, 512 px embedded PBR inputs |
| `models/sofa-02.glb` | 402,360 | `92decfac18a97244a89632ba5b4190fac693e4155566fabfe21c893bf71ac2de` | Poly Haven CC0 derivative; Meshopt + embedded PBR inputs |
| `models/sofa-02-low.glb` | 170,872 | `b7c39901e5a85262ee17b84df6844fd417291065c02ac5c45f7b2942aa5f7c88` | Low; unchanged geometry, 512 px embedded PBR inputs |
| `models/potted-plant-04-low.glb` | 318,616 | `06b827280ba85b31063f2609ba545de2b9090abfb416d39a88ac1cea50db42fb` | Low; unchanged geometry, 512 px embedded PBR inputs |
| `models/potted-plant-04.glb` | 2,021,332 | `d87f71d151c100c584d84453caa7a9529b5f7de62c5147ce95a6874aa43794a0` | Medium/High; 1K embedded PBR inputs |
| `lighting/table-shadow.png` | 25,069 | `49bcdf89b3f1851993dd11c5c5e89d69bcc8d09c4c0613b31ea3173fac13ba6f` | Blender 5.2/Cycles fixed-subject projection |
| `public/profiles/curved-cup-v3/lighting/cup-contact-ao.png` | 42,746 | `38c8f6a435ec49dd22a25cc130a9ccbd12f153148b433120f5c0086547e8ebd4` | Blender 5.2/Cycles profile-specific display AO |
| `public/scenes/warm-craftsman-home/v2/textures/oak-color.jpg` | 336,305 | `d171f45ef01bc6e239b00dfaa4961bcd27f7d8e93e3962da3bd3d0ce703d802c` | Reused CC0 room-floor base colour |
| `public/scenes/warm-craftsman-home/v2/textures/oak-normal.jpg` | 193,626 | `ba95eadc009818e161d0f753191f1bacc3fc861e593be0bc6d82b437f9ec8044` | Reused CC0 room-floor tangent normal |
| `public/scenes/warm-craftsman-home/v2/textures/oak-roughness.jpg` | 215,155 | `f281f682e62fe322303dfeaa13dac18b5cb9e113617fe0aca43605b49161d82b` | Reused CC0 room-floor roughness |

## Forest camp evening v4 (v3 payload)

Reused payload prefix: `public/scenes/forest-camp-evening/v3/`. Forest v4 changes only code-bound composition/background parameters and publishes a new release checksum without copying the asset bytes to a misleading v4 directory.

| Release asset | Bytes | SHA-256 | Provenance / role |
| --- | ---: | --- | --- |
| `environment-1k.hdr` | 1,899,638 | `38a1fb0e3c3a8f36516107a9b6ca4d25b8ddf9196748607a68c5c06e234852da` | Poly Haven Dark Autumn Forest, CC0; background + PMREM input |
| `environment-2k.hdr` | 7,537,076 | `8aae232ebfcae34a8ee0154f4fbb793e659e7dfdf27e5e14beee67b42b5e32cc` | High tier; same CC0 environment at 2K |
| `models/outdoor-table-chair-set-01.glb` | 1,078,120 | `722f63754f52fc44ca10cc2479ce24c0eb7462b1d5e2b83aee9dbcb3f7ce55f7` | Poly Haven CC0 derivative; Meshopt + embedded PBR inputs |
| `models/outdoor-table-chair-set-01-low.glb` | 501,252 | `d28edb5ffcdcb05382f998686f67e24c8f59d136af05b94de2a2b8d881e3084c` | Low; unchanged geometry, 512 px embedded PBR inputs |
| `models/lantern-01-low.glb` | 867,708 | `60df83c65b8368ddb49e5a898caaf8a053a33f3c8e4909820454c4fb91f02639` | Low; unchanged geometry, 480 px embedded PBR inputs |
| `models/lantern-01.glb` | 2,182,772 | `20257bdde2d3c928d329cda19c0272057a2aafce1e62b1cca61391d156702356` | Medium/High; 1K embedded PBR inputs |
| `models/kenney-tent.glb` | 19,444 | `633eeff968f46eae534ff6b003c0d5dbf46f151f93cb5c186b5be8b9449eb2be` | Kenney Survival Kit CC0 derivative; Meshopt, colour-only mid/far prop |
| `lighting/table-shadow.png` | 52,479 | `f02241c4efbd8f8be78aae082f1070c5170bcf072e6756ae7f5d8f627b00902e` | Blender 5.2/Cycles fixed-subject projection |
| `public/profiles/curved-cup-v3/lighting/cup-contact-ao.png` | 42,746 | `38c8f6a435ec49dd22a25cc130a9ccbd12f153148b433120f5c0086547e8ebd4` | Blender 5.2/Cycles profile-specific display AO |

## Neutral studio v2

Runtime prefix: `public/scenes/studio-neutral/v2/`. Shared AO prefix: `public/scenes/shared/f30bf914fdcc7fc6/`.

| Release asset | Bytes | SHA-256 | Provenance / role |
| --- | ---: | --- | --- |
| `studio_small_08_1k.hdr` | 1,508,872 | `f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba` | Poly Haven Studio Small 08, CC0, 1K HDR |
| `table-shadow.png` | 17,297 | `8883a7f375d4e5359afa3acc5f25b0030b94f58555f6885f91038f7f003e5070` | Historical ReflectCup deterministic analytic decal |
| `shared/f30bf914fdcc7fc6/cup-contact-ao.png` | 17,250 | `f30bf914fdcc7fc6360e4a0f99a23dbb4ec38e45fdaf83c4edca13949a860b7e` | Historical ReflectCup deterministic analytic decal |

## Catalog budget check

Totals include the tier HDR, all tier model roles, table projection and contact AO exactly once.

| Current release | Low | Medium | High | Ceiling result |
| --- | ---: | ---: | ---: | --- |
| Home v4 | 3,131,779 B | 5,438,875 B | 10,294,643 B | passes 4/7/12 MB |
| Forest v4 | 3,383,267 B | 5,275,199 B | 10,912,637 B | passes 4/7/12 MB |
| Studio v2 | 1,543,419 B | 1,543,419 B | 1,543,419 B | passes 4/7/12 MB |

Medium uses the 1K environment; High uses the content-bound 2K environment while retaining the same 1K model inputs. The older v2 copies remain untouched for immutable v2 replay.

## Build/review outputs outside the release manifest

Review-only `static-irradiance-lightmap.png`, shadow/AO proofs and bake metadata live under `docs/assets/scenes/v3-lighting/`, outside public runtime URLs. They are documented in [`baked-lighting-v3.md`](baked-lighting-v3.md) and do not participate in the scene checksum. In particular, the irradiance PNG is staged input awaiting a geometry-matched UV2 receiver, not a deployed full-scene lightmap.

No KTX2 resource is listed because no current scene release ships or loads KTX2. Publishing KTX2, full UV2 lighting, a new environment, or any changed model/visual parameter requires a new immutable scene version and checksum.
