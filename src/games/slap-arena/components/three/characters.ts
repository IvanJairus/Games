import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface BrawlerSource {
  scene: THREE.Group;
  clips: Record<string, THREE.AnimationClip>;
}

let gradientMap: THREE.DataTexture | null = null;

/** Hard 3-band ramp: this is what makes the shading read as "cartoon" instead of "grey blob". */
function toonRamp(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const steps = new Uint8Array([70, 145, 215, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientMap = tex;
  return tex;
}

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

export async function loadBrawlerSource(url: string): Promise<BrawlerSource> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const clips: Record<string, THREE.AnimationClip> = {};
  for (const clip of gltf.animations) clips[clip.name] = clip;
  return { scene: gltf.scene, clips };
}

/** Bakes the toon material + player costume into a fresh, independently animatable copy. */
export class BrawlerRig {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction | undefined>();
  private current: THREE.AnimationAction | null = null;
  private disposables: Array<{ dispose: () => void }> = [];
  private bodyMaterials: THREE.MeshToonMaterial[] = [];
  readonly height = 1.72;

  constructor(src: BrawlerSource, colorHex: string) {
    const model = SkeletonUtils.clone(src.scene) as THREE.Group;
    const color = new THREE.Color(colorHex);

    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const original = mesh.material as THREE.MeshStandardMaterial;
      const toon = new THREE.MeshToonMaterial({
        map: original.map ?? null,
        // Multiply the baked atlas only lightly: a full-strength tint turns tan skin muddy.
        color: new THREE.Color(0xffffff).lerp(color, 0.3),
        gradientMap: toonRamp(),
      });
      mesh.material = toon;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      this.bodyMaterials.push(toon);
      this.disposables.push(toon);
    });

    this.group.add(model);
    this.mixer = new THREE.AnimationMixer(model);

    for (const clip of Object.values(src.clips)) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    this.attachCostume(model, color);
  }

  /** Gloves + cap carry the player colour at full saturation, so identity stays readable. */
  private attachCostume(model: THREE.Group, color: THREE.Color): void {
    const fabric = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
    const dark = new THREE.MeshToonMaterial({
      color: color.clone().multiplyScalar(0.55),
      gradientMap: toonRamp(),
    });
    this.disposables.push(fabric, dark);

    const gloveGeo = new THREE.SphereGeometry(0.2, 12, 10);
    const cuffGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.12, 10);
    this.disposables.push(gloveGeo, cuffGeo);

    for (const suffix of ['hand.l', 'hand.r'] as const) {
      const bone = findBone(model, suffix);
      if (!bone) continue;
      const glove = new THREE.Mesh(gloveGeo, fabric);
      glove.position.set(0, 0.12, 0.02);
      glove.castShadow = true;
      const cuff = new THREE.Mesh(cuffGeo, dark);
      cuff.position.set(0, -0.02, 0);
      bone.add(glove, cuff);
    }

    const head = findBone(model, 'head');
    if (head) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), fabric);
      cap.position.set(0, 0.14, 0);
      cap.castShadow = true;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), dark);
      pom.position.set(0, 0.4, 0);
      head.add(cap, pom);
      this.disposables.push(cap.geometry, pom.geometry);
    }
  }

  play(name: string, fade = 0.12): void {
    const next = this.actions.get(name) ?? null;
    if (next === this.current || !next) return;
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    if (this.current) this.current.fadeOut(fade);
    next.fadeIn(fade);
    this.current = next;
  }

  loop(name: string, timeScale = 1): void {
    const action = this.actions.get(name);
    if (!action) return;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.setEffectiveTimeScale(timeScale);
    this.play(name);
  }

  /** One-shot clips (punch, hit, death) must not loop. */
  once(name: string, timeScale = 1): void {
    const action = this.actions.get(name);
    if (!action) return;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.setEffectiveTimeScale(timeScale);
    this.play(name);
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  setColor(colorHex: string): void {
    const color = new THREE.Color(colorHex);
    for (const m of this.bodyMaterials) m.color.set(new THREE.Color(0xffffff).lerp(color, 0.3));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const d of this.disposables) d.dispose();
  }
}
