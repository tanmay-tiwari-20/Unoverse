# Arena hero assets (optional)

This directory holds **optional** GLTF (`.glb`) "hero" props for the themed arenas.

## They are optional by design

Every arena is fully complete and performant **without any file here**. The arena
code renders a procedural version of each hero prop and only swaps in a `.glb`
when a valid, optimized file is present at the exact path below. A missing file,
a 404, or a bad asset falls back to the procedural prop with no error and no
frame-time cost — see `src/components/table/arenas/shared/gltf.tsx`.

This keeps the game's zero-mandatory-download architecture intact: the look and
FPS never depend on a binary asset existing.

## Expected slots

| Path | Used by | Procedural fallback |
| :--- | :--- | :--- |
| `space/station.glb` | Space Station | modular procedural station |
| `jungle/canopy-tree.glb` | Amazon Jungle | procedural canopy tree |
| `jungle/firefly.glb` | Amazon Jungle | glow-sprite fireflies |
| `jungle/butterfly.glb` | Amazon Jungle | procedural winged butterfly |
| `glacier/ice-formation.glb` | Frozen Glacier | procedural ice crystal cluster |
| `cyber/tower.glb` | Cyber City | procedural skyscraper |
| `volcano/temple.glb` | Volcano Temple | procedural temple ruins |

## Requirements for any asset you add

- **Format:** `.glb` (binary glTF 2.0).
- **Compression:** Draco geometry + meshopt are enabled in the loader — export
  with both where possible to keep downloads small.
- **Budget (mobile-safe):** aim for < ~40k triangles and < ~1–2 MB per hero
  asset; use baked PBR textures at ≤ 1K–2K. These are distant/background props.
- **Origin:** model's base at `y = 0`, facing `+Z`, roughly unit-scaled (the
  arena sets final position/rotation/scale).
- **Licensing:** only add assets you have the right to redistribute (e.g.
  CC0 / CC-BY with attribution recorded here).

Loads are additionally gated by the adaptive quality tier in each arena (hero
GLTFs are high/medium only), so low-end devices never fetch them.
