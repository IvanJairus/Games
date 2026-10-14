#!/usr/bin/env node
// Builds the Slap Arena brawler GLBs from KayKit (CC0) into public/models/.
// Licensing and provenance: public/models/NOTICE.md
//
// Two-stage on purpose:
//   1. node API  - drop rigid props (axes/shields/mugs), keep 12 animation clips
//   2. CLI       - gltf-transform optimize, which also joins primitives and
//                  collapses the thousands of tiny animation accessors that make
//                  the JSON chunk ~1 MiB on its own.
// Measured on 2026-10-14: stage 1 alone = 2324 KiB, stage 1+2 = 431 KiB (128 KiB gzipped).
//
// --simplify false keeps the low-poly silhouette; --palette false keeps one
// material per character so players can be tinted independently.
//
// Needs network on first run. Requires no repo dependencies: it shells out to npx.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO, Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample, dedup, weld } from '@gltf-transform/functions';

const SOURCE =
  'https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf';
const CHARACTERS = ['Barbarian', 'Knight'];
const KEEP_ANIMS = [
  'Idle',
  'Walking_A',
  'Running_A',
  'Unarmed_Melee_Attack_Punch_A',
  'Unarmed_Melee_Attack_Punch_B',
  'Unarmed_Melee_Attack_Kick',
  'Hit_A',
  'Death_A',
  'Cheer',
  'Dodge_Forward',
  'Jump_Start',
  'Jump_Land',
];

const OUT_DIR = path.resolve('public/models');
const WORK_DIR = path.resolve('.cache/kaykit');

// Only needed to run stage 1; stage 2 uses npx.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const nodesOf = (mesh) => mesh.listParents().filter((p) => p instanceof Node);

async function stage1(name) {
  const raw = path.join(WORK_DIR, `${name}.glb`);
  if (!fs.existsSync(raw)) {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    const res = await fetch(`${SOURCE}/${name}.glb`);
    if (!res.ok) throw new Error(`download ${name} failed: ${res.status}`);
    fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }

  const doc = await io.read(raw);
  const root = doc.getRoot();
  const keep = new Set(KEEP_ANIMS);
  for (const anim of root.listAnimations()) {
    if (!keep.has(anim.getName())) anim.dispose();
  }

  // Rigid props are parented to bones but not skinned; dropping them leaves every
  // brawler with empty hands, which is what a slap game needs.
  const dropped = [];
  for (const mesh of [...root.listMeshes()]) {
    const users = nodesOf(mesh);
    if (users.some((n) => n.getSkin())) continue;
    dropped.push(...users.map((n) => n.getName()).filter(Boolean));
    for (const n of users) n.dispose();
    mesh.dispose();
  }

  await doc.transform(prune({ keepSolid: false }), resample(), dedup(), weld());
  const mid = path.join(WORK_DIR, `${name}.mid.glb`);
  await io.write(mid, doc);
  return { mid, dropped };
}

function stage2(mid, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${name.toLowerCase()}.glb`);
  execFileSync(
    'npx',
    [
      '-y',
      '@gltf-transform/cli@4',
      'optimize',
      mid,
      out,
      '--compress',
      'meshopt',
      '--simplify',
      'false',
      '--palette',
      'false',
      '--instance',
      'false',
      '--join',
      'true',
    ],
    { stdio: 'pipe' }
  );
  return out;
}

for (const name of CHARACTERS) {
  const { mid, dropped } = await stage1(name);
  const out = stage2(mid, name);
  const kibs = fs.statSync(out).size / 1024;
  console.log(`${name}: ${kibs.toFixed(0)} KiB -> ${path.relative(process.cwd(), out)}`);
  console.log(`  props dibuang: ${dropped.join(', ')}`);
}
