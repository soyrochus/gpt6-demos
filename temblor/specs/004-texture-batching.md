# 004 Level texture batching

## Problem

Temblor groups images with identical width and height into GPU texture arrays so each image retains its native resolution and mip chain. The renderer currently requires every array in a level to fit in one bind group. Arena Gate in the Quake III Arena demo exceeds the 15 available color texture slots and fails during scene upload.

## Requirements

- Apply the 15-slot limit to each draw batch. A level may use more than 15 distinct image dimensions. Keep the separate lightmap array and the existing WebGPU device requirements.
- Upload each image layer and its mip chain once. Preserve native dimensions, including non-power-of-two sizes, repeat sampling, lightmaps, and the original layer selected by each material.
- Assign each material to a batch that contains the textures for all its active stages and every frame of its animations. Materials that use only lightmaps or vertex color require no color slots. If one material alone exceeds the slot budget, identify that material in the load error.
- Preserve the order of opaque world geometry, actors and effects, translucent world geometry, and the first-person weapon. Preserve face order within each world pass, including when consecutive translucent faces require different bindings.
- Prepare GPU bindings during scene upload and reuse them throughout the match. Levels that fit in one bind group should keep a single group.

## Verification

- Add public regression coverage for the slot boundary, mixed-size animations, array-layer selection across batches, and ordered draw ranges. The public tests must run without proprietary data.
- Build the browser release and exercise the bundled Trial by Error arena.
- Import Arena Gate from the locally supplied demo PK3, enter play, reach the five-frag result and start a rematch. Inspect animated flame and lava surfaces for texture-selection errors. Existing limitations of the shader interpreter are independent of this change.
- Keep third-party demo data and captures from it out of the repository history.
