# Third-party assets in this folder

## KayKit - Character Pack: Adventurers

Files: `barbarian.glb`, `knight.glb`
Author: Kay Lousberg
Source: <https://kaylousberg.itch.io/kaykit-adventurers>
Repository: <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0>
License: CC0 1.0 Universal (public domain dedication)

The upstream README states: "Free for personal and commercial use, no attribution
required. (CC0 Licensed)". This notice is kept anyway so the provenance of every
binary in the repo is documented.

### Modifications

Both files are derived from the upstream `Barbarian.glb` and `Knight.glb`
(`addons/kaykit_character_pack_adventures/Characters/gltf/`), processed by
`scripts/build-slap-assets.mjs`:

1. Animation clips reduced from 75 to 12: `Idle`, `Walking_A`, `Running_A`,
   `Unarmed_Melee_Attack_Punch_A`, `Unarmed_Melee_Attack_Punch_B`,
   `Unarmed_Melee_Attack_Kick`, `Hit_A`, `Death_A`, `Cheer`, `Dodge_Forward`,
   `Jump_Start`, `Jump_Land`.
2. Rigid, non-skinned prop meshes removed so the characters hold nothing:
   Barbarian lost `1H_Axe`, `1H_Axe_Offhand`, `2H_Axe`, `Barbarian_Round_Shield`,
   `Barbarian_Hat`, `Barbarian_Cape`, `Mug`. Knight lost `1H_Sword`,
   `1H_Sword_Offhand`, `2H_Sword`, `Badge_Shield`, `Rectangle_Shield`,
   `Round_Shield`, `Spike_Shield`, `Knight_Helmet`, `Knight_Cape`.
3. Geometry kept as authored (no decimation), primitives joined, then packed with
   `EXT_meshopt_compression` + `KHR_mesh_quantization`.
   Measured result: 3529 KiB upstream -> 431 KiB built (128 KiB gzipped).

Rebuild with `node scripts/build-slap-assets.mjs` (needs network on first run).
