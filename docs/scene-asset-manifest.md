# Scene asset release manifest

Updated for the 2026-07-20 home/forest v5 composition pass. The current catalog is home v5, forest v5 and studio v2. Home v5 reuses only the immutable v3 wooden-table/Cycles assets and profile contact AO, excludes the v4 sofa, plant, room shell and oak-floor maps, and binds versioned Lythwood Lounge HDR/LDR files. Home v4 remains unchanged as a legacy replay release. Forest v5 reuses immutable v3 table/lantern/Cycles assets but excludes the legacy tent, replaces the old forest environment with versioned Nature Reserve Forest HDR/LDR files, adds tiered Pine Forest prop GLBs without opaque ground and binds a transparent context-occlusion decal. The authoritative executable manifest is `src/scenes/release-manifest.ts`; tests independently verify every listed byte size, SHA-256 and canonical release checksum.

Poly Haven model/environment downloads are CC0. The historical tent derivative comes from Kenney's CC0 Survival Kit and remains only in forest v1-v4. Raw bundles remain ignored; public GLBs are normalised derivatives. The Pine Forest GLBs are curated selections from the official complete scene, not browser copies of the full 2.75 GB source. Project-authored display decals contain no customer data. Detailed source provenance and conversion validation are in [`scene-model-sources-v3.md`](scene-model-sources-v3.md).

## Current release identities

| Scene | Current version | Release checksum |
| --- | ---: | --- |
| `warm-craftsman-home` | 5 | `a69ed575767d84ee8105f8300bd4a3febb80931ad40bccb88147a70c04abeee1` |
| `forest-camp-evening` | 5 | `2d9e08cfa0c92ea284e95c3b8f39ddb0979d63b03248dce69d1a3cbe33b291f6` |
| `studio-neutral` | 2 | `b2284d246bab7eecab47690467374eca132330bf95f7aee7d5c01ec927df5616` |

The v1 identities and former home/forest v2/v3/v4 releases remain pinned in code for old snapshots/regression. Home v4 remains immutable but is no longer current. Neither v5 release rewrites any v1-v4 asset byte; inherited resources retain their existing `/v3/` or profile-addressed paths.

## Warm Craftsman home v5 (v3 table/Cycles payload + v5 Lythwood Lounge)

Reused table/shadow prefix: `public/scenes/warm-craftsman-home/v3/`. New environment/background prefix: `public/scenes/warm-craftsman-home/v5/`. Environment source: Poly Haven [Lythwood Lounge](https://polyhaven.com/a/lythwood_lounge), CC0. The profile contact AO remains under `public/profiles/curved-cup-v3/`. The v5 release does not reference the v4 sofa, plant, room shell or `public/scenes/warm-craftsman-home/v2/textures/` oak maps; those earlier bytes remain available only through immutable legacy releases.

| Release asset | Bytes | SHA-256 | Provenance / role |
| --- | ---: | --- | --- |
| `v3/models/wooden-table-01.glb` | 540,264 | `4125d43bdd6a868819b059ed578236474163b7762b08afc03a7c68731ea2d3b9` | Reused Poly Haven CC0 derivative; Medium/High Meshopt + embedded 1K PBR inputs |
| `v3/models/wooden-table-01-low.glb` | 167,372 | `8fb0ac43adecc9ddb0c000a96b9d1af4c2a384650fa1489b058cefc70b732f19` | Reused Low derivative; unchanged geometry, 512 px embedded PBR inputs |
| `v3/lighting/table-shadow.png` | 25,069 | `49bcdf89b3f1851993dd11c5c5e89d69bcc8d09c4c0613b31ea3173fac13ba6f` | Reused Blender 5.2/Cycles fixed-subject projection |
| `public/profiles/curved-cup-v3/lighting/cup-contact-ao.png` | 42,746 | `38c8f6a435ec49dd22a25cc130a9ccbd12f153148b433120f5c0086547e8ebd4` | Blender 5.2/Cycles profile-specific display AO |
| `v5/lythwood-lounge-1k-7de73ed75fbd5217.hdr` | 1,538,903 | `7de73ed75fbd52179152230198b3fb18bf8c36993b5608b724e899c426e53f78` | Poly Haven Lythwood Lounge, CC0, 1024 × 512 Radiance HDR; Low/Medium PMREM input |
| `v5/lythwood-lounge-2k-04cce69276d91353.hdr` | 6,090,881 | `04cce69276d91353c41804c3a6b2d65bfef0119372aac5707ab73790933e60b7` | Same CC0 environment at 2048 × 1024; High PMREM input |
| `v5/lythwood-lounge-background-low-0c7a9c83ac55e413.jpg` | 27,833 | `0c7a9c83ac55e413228bb8beabe8407b80de2885f3a80baf182497a8c3ae16dc` | 768 × 384 tonemapped Lythwood Lounge LDR; Low `GroundedSkybox` input |
| `v5/lythwood-lounge-background-1k-d56fb46a1cdbd555.jpg` | 51,291 | `d56fb46a1cdbd5556fe03ea5784571866a16dde40f07d10cee3d40ad85791ce9` | 1024 × 512 tonemapped Lythwood Lounge LDR; Medium `GroundedSkybox` input |
| `v5/lythwood-lounge-background-4k-a866ae33dfb08abf.webp` | 695,002 | `a866ae33dfb08abff5212feb596abe0a30b3462f2429347274a94eb8c3ec0367` | 4096 × 2048 tonemapped Lythwood Lounge WebP; High `GroundedSkybox` input |

The three public LDR files derive from Poly Haven's official 8192 × 4096 tonemapped JPG. The ignored source is 5,027,965 bytes with SHA-256 `14fb89bdaadfcc3f3974d1bad29656db0354bf7d96d72f69bc137d991d2fa119`; only the content-addressed public derivatives enter the release. The Lythwood Lounge HDR/LDR pair shares one source and orientation, but the inherited wooden table was authored separately. The `GroundedSkybox` contract is capture height 1.207282 m, radius 7.1 m, ground level -0.727282 m and yaw -2.6 rad; it is visual projection, not room geometry, collision or physical lighting.

## Forest camp evening v5 (v3 table/lantern payload + v5 environment/props)

Inherited table/lantern prefix: `public/scenes/forest-camp-evening/v3/`. New environment, visible background, Pine Forest props and context-occlusion prefix: `public/scenes/forest-camp-evening/v5/`. The profile contact AO remains under `public/profiles/curved-cup-v3/`. Forest v5 excludes the former v3/v4 Dark Autumn Forest HDR files and the Kenney tent from its current release payload; those bytes remain unchanged for v1-v4 replay.

| Release asset | Bytes | SHA-256 | Provenance / role |
| --- | ---: | --- | --- |
| `v3/models/outdoor-table-chair-set-01.glb` | 1,078,120 | `722f63754f52fc44ca10cc2479ce24c0eb7462b1d5e2b83aee9dbcb3f7ce55f7` | Reused Poly Haven CC0 derivative; Medium/High Meshopt + embedded 1K PBR inputs |
| `v3/models/outdoor-table-chair-set-01-low.glb` | 501,252 | `d28edb5ffcdcb05382f998686f67e24c8f59d136af05b94de2a2b8d881e3084c` | Reused Low derivative; unchanged geometry, 512 px embedded PBR inputs |
| `v3/models/lantern-01-low.glb` | 867,708 | `60df83c65b8368ddb49e5a898caaf8a053a33f3c8e4909820454c4fb91f02639` | Reused Low derivative; unchanged geometry, 480 px embedded PBR inputs |
| `v3/models/lantern-01.glb` | 2,182,772 | `20257bdde2d3c928d329cda19c0272057a2aafce1e62b1cca61391d156702356` | Reused Medium/High derivative; 1K embedded PBR inputs |
| `v3/lighting/table-shadow.png` | 52,479 | `f02241c4efbd8f8be78aae082f1070c5170bcf072e6756ae7f5d8f627b00902e` | Reused Blender 5.2/Cycles fixed-subject projection |
| `public/profiles/curved-cup-v3/lighting/cup-contact-ao.png` | 42,746 | `38c8f6a435ec49dd22a25cc130a9ccbd12f153148b433120f5c0086547e8ebd4` | Reused Blender 5.2/Cycles profile-specific display AO |
| `v5/environment-1k.hdr` | 1,900,770 | `6c943ddd683de2f3d9aaa62596961dfccdc9cf206adebfc198e70235ae5707cd` | Poly Haven Nature Reserve Forest, CC0, 1024 × 512 Radiance HDR; PMREM input in every tier, never the visible background |
| `v5/background-low.jpg` | 57,134 | `cb651d04b2c84832b8980dc9201440a7addde2e25e639b8a973e5806df5998ab` | 768 × 384 tonemapped Nature Reserve Forest LDR; Low `GroundedSkybox` input |
| `v5/background-1k.jpg` | 80,603 | `321b8127e08ae2a3bef5375f70cb971068a97f97d40f0527f026853c71bd5371` | 1024 × 512 tonemapped Nature Reserve Forest LDR; Medium `GroundedSkybox` input |
| `v5/background-4k.webp` | 2,894,558 | `b2c636a6a00b56f1b47a74428bcba301e956059a45188fbe46b3dc29f37168ee` | 4096 × 2048 Nature Reserve Forest LDR; High `GroundedSkybox` input, WebP quality 82 from official API-listed 8192 × 4096 tonemapped source |
| `v5/models/pine-forest-props-low-46a9ce4b9e1217a4.glb` | 454,776 | `46a9ce4b9e1217a40eedec5cca5e9c33f0564cfcc8ef1e076979749fda6b942e` | Curated Poly Haven Pine Forest CC0 prop derivative; content-addressed URL, Meshopt, 256 px embedded PBR images, 5,111 unique / 10,049 visible triangles |
| `v5/models/pine-forest-props-medium-3fa78f9e225c8e8f.glb` | 1,298,620 | `3fa78f9e225c8e8f1104cd5c672bb410e2ca9292aeeffa56fddeb90d8c4c287b` | Curated Poly Haven Pine Forest CC0 prop derivative; content-addressed URL, Meshopt, 512 px images, 8,785 unique / 15,111 visible triangles |
| `v5/models/pine-forest-props-high-149fc9facc78ecc4.glb` | 3,775,268 | `149fc9facc78ecc46a35ad302d58aef07d325c70a629df8fae78d35d14f192fa` | Curated Poly Haven Pine Forest CC0 prop derivative; content-addressed URL, Meshopt, 896 px images, 17,420 unique / 35,316 visible triangles |
| `v5/lighting/forest-context-occlusion.png` | 5,224 | `7bb82f102a9615220a204a70c4036d27b553f847f021e49fc9d908b63bc747bb` | 512 × 512 RGBA baked context-occlusion decal; display-only, shared by all tiers |

The High LDR was resized with Lanczos and encoded as WebP quality 82, method 6, from Poly Haven's official API-listed 8192 × 4096 tonemapped JPG. That private source is 55,510,227 bytes with SHA-256 `030e41402d91a708c2535034fa0685a3add1087a21494b8a5c205a3f8aa0fe90` and API MD5 `152888d4aceb516d5bbe7366d3a7be27`; only the 4096 × 2048 public derivative above enters the release payload.

The Nature Reserve Forest HDR/LDR inputs share one source and orientation. They are not authored with the separate Pine Forest complete scene used for the prop GLBs. The public GLBs contain only three trunks, twelve ferns, four moss rocks and one fallen-log derivative: 20 nodes, four materials and twelve embedded images, with no opaque ground node/material/images. The full 2.75 GB Pine Forest source is not a release asset. `GroundedSkybox` supplies the photographed visual ground but is not ground geometry, collision or physical lighting.

## Neutral studio v2

Runtime prefix: `public/scenes/studio-neutral/v2/`. Shared AO prefix: `public/scenes/shared/f30bf914fdcc7fc6/`.

| Release asset | Bytes | SHA-256 | Provenance / role |
| --- | ---: | --- | --- |
| `studio_small_08_1k.hdr` | 1,508,872 | `f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba` | Poly Haven Studio Small 08, CC0, 1K HDR |
| `table-shadow.png` | 17,297 | `8883a7f375d4e5359afa3acc5f25b0030b94f58555f6885f91038f7f003e5070` | Historical ReflectCup deterministic analytic decal |
| `shared/f30bf914fdcc7fc6/cup-contact-ao.png` | 17,250 | `f30bf914fdcc7fc6360e4a0f99a23dbb4ec38e45fdaf83c4edca13949a860b7e` | Historical ReflectCup deterministic analytic decal |

## Catalog budget check

Totals include the tier HDR, optional LDR background, all tier model roles, table projection, contact AO and optional context occlusion exactly once.

| Current release | Low | Medium | High | Ceiling result |
| --- | ---: | ---: | ---: | --- |
| Home v5 | 1,801,923 B | 2,198,273 B | 7,393,962 B | passes 4/7/12 MB |
| Forest v5 | 3,882,089 B | 6,641,334 B | 11,931,937 B | passes 4/7/12 MB |
| Studio v2 | 1,543,419 B | 1,543,419 B | 1,543,419 B | passes 4/7/12 MB |

Home Low/Medium use the 1K HDR while High uses the content-bound 2K HDR; the visible background advances from 768 px JPG to 1K JPG and 4K WebP, and only the table model is present. Forest uses one 1K HDR at every quality level; Medium/High advance the visible LDR background and Pine Forest prop derivative while retaining the same v3 full table/lantern models. No current forest tier includes the tent. Older v2/v3/v4 assets and identities remain untouched for immutable replay.

## Build/review outputs outside the release manifest

Review-only `static-irradiance-lightmap.png`, v3 shadow/AO proofs and bake metadata live under `docs/assets/scenes/v3-lighting/`, outside public runtime URLs. They are documented in [`baked-lighting-v3.md`](baked-lighting-v3.md) and do not participate in the scene checksum. In particular, the irradiance PNG is staged input awaiting a geometry-matched UV2 receiver, not a deployed full-scene lightmap. Forest v5's public context-occlusion PNG is a separate, explicitly listed display layer and must not be described as that UV2 bake.

No KTX2 resource is listed because no current scene release ships or loads KTX2. Publishing KTX2, full UV2 lighting, a new environment, or any changed model/visual parameter requires a new immutable scene version and checksum.
