import * as THREE from 'three';
import type { FxGates } from '../../engine/fxMode';

const INK = '#2a1b33';
const SKIN = '#ffd9b3';
const HAIR = '#7a5230';
const CREAM = '#fff6e5';

const HEAD_R = 0.62;
const HEAD_Y = 1.68;
const BODY_R = 0.54;
const BODY_Y = 0.72;

/** Shared across every brawler: same silhouette, only colours differ. */
const geo = {
  head: new THREE.SphereGeometry(HEAD_R, 26, 20),
  body: new THREE.SphereGeometry(BODY_R, 26, 20),
  leg: new THREE.CapsuleGeometry(0.14, 0.1, 4, 10),
  glove: new THREE.SphereGeometry(0.36, 20, 16),
  cuff: new THREE.CylinderGeometry(0.21, 0.25, 0.13, 12),
  // Beanie dome down to the equator. Its rim is the eye line, so the face band
  // below stays skin; going deeper buries the eyes under the hat.
  cap: new THREE.SphereGeometry(HEAD_R + 0.03, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
  brim: new THREE.TorusGeometry(HEAD_R * 0.99, 0.075, 8, 26),
  // 120 degrees of hair at the nape only. phi 0 points at -X and grows toward +Z,
  // so the face (phi = PI/2) stays uncovered while the back stops being bare skin.
  hair: new THREE.SphereGeometry(HEAD_R + 0.014, 20, 10, Math.PI * 0.75, Math.PI * 1.5, Math.PI * 0.54, Math.PI * 0.3),
  pom: new THREE.SphereGeometry(0.12, 12, 10),
  eye: new THREE.SphereGeometry(0.095, 14, 12),
  shine: new THREE.SphereGeometry(0.035, 8, 8),
  mouth: new THREE.TorusGeometry(0.15, 0.032, 6, 14, Math.PI * 0.8),
};

const ramp = (() => {
  let tex: THREE.DataTexture | null = null;
  return () => {
    if (!tex) {
      const steps = new Uint8Array([70, 145, 215, 255]);
      tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
    }
    return tex;
  };
})();

function toon(color: string): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: ramp() });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(INK), side: THREE.BackSide });

/** A slightly larger copy drawn from behind: cartoon ink line without a shader. */
function outlined(mesh: THREE.Mesh, width = 0.085): THREE.Mesh {
  const shell = new THREE.Mesh(mesh.geometry, outlineMat);
  shell.scale.setScalar(1 + width);
  shell.renderOrder = -1;
  // Doubles the draw calls of the whole cast, so the low tier needs to find these back.
  shell.userData.outline = true;
  mesh.add(shell);
  return mesh;
}

/**
 * A red-suited brawler wearing red gloves has no visible hands, which is exactly
 * what happened to Bob. Move the gloves off the suit hue when they would collide.
 */
function gloveColor(suitHex: string): string {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(suitHex).getHSL(hsl);
  return hsl.h < 0.06 || hsl.h > 0.94 ? CREAM : '#ff5d5d';
}

export interface Pose {
  speed: number;
  /** 0..1 through the swing, -1 when idle. */
  slapT: number;
  hitT: number;
  dashT: number;
  falling: boolean;
  cheering: boolean;
  /** 0..1 through the wind-up, -1 when not holding the button. */
  charge: number;
  /** Banked charge 0..1 at the moment the slap lands, for a harder follow-through. */
  air: number;
}

const IDLE: Pose = { speed: 0, slapT: -1, hitT: 0, dashT: 0, falling: false, cheering: false, charge: -1, air: 0 };

/**
 * Chunky procedural brawler: head just over half the height, stub legs, oversized
 * gloves, beanie with a pom. Primitives only, so there is no model file to load.
 */
export class BrawlerRig {
  readonly group = new THREE.Group();
  readonly height = 2.3;

  private head = new THREE.Group();
  private bodyPivot = new THREE.Group();
  private legL!: THREE.Mesh;
  private legR!: THREE.Mesh;
  private gloveL!: THREE.Group;
  private gloveR!: THREE.Group;
  private suitMat = toon('#4dabf7');
  private capMat = toon('#4dabf7');
  private brimMat = toon('#3d7fbe');
  private gloveMat = toon('#ff5d5d');
  private skinMat = toon(SKIN);
  private hairMat = toon(HAIR);
  private inkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(INK) });
  private lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CREAM) });
  private t = Math.random() * 6;

  constructor(colorHex: string) {
    this.setColor(colorHex);
    this.build();
  }

  private build(): void {
    const body = outlined(new THREE.Mesh(geo.body, this.suitMat));
    body.position.y = BODY_Y;
    body.castShadow = true;
    this.bodyPivot.add(body);

    this.legL = outlined(new THREE.Mesh(geo.leg, this.suitMat), 0.12);
    this.legR = outlined(new THREE.Mesh(geo.leg, this.suitMat), 0.12);
    this.legL.position.set(-0.23, 0.19, 0);
    this.legR.position.set(0.23, 0.19, 0);
    this.legL.castShadow = this.legR.castShadow = true;
    this.bodyPivot.add(this.legL, this.legR);

    const head = outlined(new THREE.Mesh(geo.head, this.skinMat));
    head.position.y = HEAD_Y;
    head.castShadow = true;
    const hair = new THREE.Mesh(geo.hair, this.hairMat);
    hair.position.y = HEAD_Y;
    const cap = outlined(new THREE.Mesh(geo.cap, this.capMat), 0.05);
    cap.position.y = HEAD_Y;
    cap.castShadow = true;
    const brim = outlined(new THREE.Mesh(geo.brim, this.brimMat), 0.1);
    brim.position.y = HEAD_Y;
    brim.rotation.x = Math.PI / 2;
    const pom = outlined(new THREE.Mesh(geo.pom, this.lightMat), 0.18);
      pom.position.y = HEAD_Y + HEAD_R + 0.08;
    this.head.add(head, hair, cap, brim, pom);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(geo.eye, this.inkMat);
      eye.position.set(0.22 * side, HEAD_Y - 0.2, 0.55);
      const shine = new THREE.Mesh(geo.shine, this.lightMat);
      shine.position.set(0.22 * side - 0.04, HEAD_Y - 0.16, 0.6);
      this.head.add(eye, shine);
    }

    const mouth = new THREE.Mesh(geo.mouth, this.inkMat);
    mouth.position.set(0, HEAD_Y - 0.35, 0.47);
    mouth.rotation.z = Math.PI * 1.1;
    this.head.add(mouth);

    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const glove = outlined(new THREE.Mesh(geo.glove, this.gloveMat), 0.09);
      glove.castShadow = true;
      const cuff = outlined(new THREE.Mesh(geo.cuff, this.inkMat), 0.1);
      cuff.position.set(0.05 * side, 0.27, -0.06);
      g.add(glove, cuff);
      g.position.set(0.66 * side, 0.74, 0.1);
      if (side < 0) this.gloveL = g;
      else this.gloveR = g;
      this.bodyPivot.add(g);
    }

    this.group.add(this.bodyPivot, this.head);
  }

  setColor(colorHex: string): void {
    const suit = new THREE.Color(colorHex);
    this.suitMat.color.copy(suit);
    this.capMat.color.copy(suit);
    this.brimMat.color.copy(suit.clone().multiplyScalar(0.72));
    this.gloveMat.color.set(gloveColor(colorHex));
  }

  /** Toggles the two costs this rig carries: the ink shells and the shadow casters. */
  setDetail(gates: Pick<FxGates, 'outlines' | 'shadows'>): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.userData.outline) m.visible = gates.outlines;
      else m.castShadow = gates.shadows;
    });
  }

  /** Drives the whole rig from simulation state; no clips, no mixer. */
  update(dt: number, pose: Pose = IDLE): void {
    this.t += dt;
    const moving = pose.speed > 0.6;
    const charging = pose.charge >= 0;
    const cr = charging ? Math.min(1, pose.charge) : 0;
    const step = this.t * (6 + pose.speed * 0.9);

    // Idle breath and walk bounce share one curve so switching never pops.
    const bounce = moving ? Math.abs(Math.sin(step)) * 0.12 : Math.sin(this.t * 2.1) * 0.03;
    this.bodyPivot.position.y = bounce - cr * 0.06;
    this.head.position.y = bounce * 1.3 - cr * 0.06;
    this.bodyPivot.rotation.x = moving ? -0.12 * Math.min(1, pose.speed / 5) : 0;

    // Planting the legs is what sells the pause: a swinging arm on marching legs reads
    // as running, not as winding up.
    const swing = charging ? 0 : moving ? Math.sin(step) * 0.6 : Math.sin(this.t * 1.6) * 0.05;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.legL.position.z = Math.sin(swing) * 0.13;
    this.legR.position.z = -Math.sin(swing) * 0.13;

    const bob = moving && !charging ? Math.cos(step) * 0.07 : 0;
    this.gloveL.position.set(-0.66, 0.74 + bob, 0.1);
    this.gloveR.position.set(0.66, 0.74 - bob, 0.1);
    this.gloveL.rotation.set(0, 0, 0.12);
    this.gloveR.rotation.set(0, 0, -0.12);
    this.gloveL.scale.setScalar(1);
    this.gloveR.scale.setScalar(1);

    if (pose.cheering) {
      this.gloveL.position.set(-0.56, 1.46, 0.06);
      this.gloveR.position.set(0.56, 1.46, 0.06);
      this.bodyPivot.position.y = Math.abs(Math.sin(this.t * 7)) * 0.26;
      this.head.position.y = this.bodyPivot.position.y * 1.15;
    }

    if (charging) {
      // The glove travels back and the torso turns against it, so the release has
      // somewhere to come from. Past four fifths the hold shakes.
      this.gloveR.position.set(0.66 + cr * 0.14, 0.74 + cr * 0.34, 0.1 - cr * 0.66);
      this.gloveR.scale.setScalar(1 + cr * 0.24);
      this.bodyPivot.rotation.y = cr * 0.5;
      this.head.rotation.y = cr * 0.16;
      if (cr > 0.8) {
        const tremble = Math.sin(this.t * 46) * (cr - 0.8) * 0.1;
        this.bodyPivot.position.y += tremble;
        this.gloveR.position.x += tremble;
      }
    }

    if (pose.slapT >= 0) {
      // Wind-up, then a fast thrust with the torso following so it reads as a swing.
      // A banked charge deepens the thrust instead of speeding it up, which is the
      // difference between a harder hit and a shorter animation.
      const k = pose.slapT;
      const extra = Math.max(0, Math.min(1, pose.air));
      const thrust =
        k < 0.25
          ? -0.16 * (k / 0.25) * (1 + extra)
          : (0.9 + extra * 0.45) * Math.sin(((k - 0.25) / 0.75) * Math.PI);
      this.gloveR.position.set(
        0.66 - thrust * 0.2,
        0.88 + extra * 0.1,
        0.1 + thrust * (0.98 + extra * 0.34)
      );
      this.gloveR.scale.setScalar(1 + thrust * (0.3 + extra * 0.4));
      this.bodyPivot.rotation.y = -thrust * (0.45 + extra * 0.3);
      this.head.rotation.y = -thrust * 0.18;
    } else if (!charging) {
      this.bodyPivot.rotation.y = 0;
      this.head.rotation.y = 0;
    }

    if (pose.dashT > 0) {
      this.gloveL.position.z = 0.48;
      this.gloveR.position.z = 0.48;
      this.bodyPivot.rotation.x = -0.4;
    }

    const squash = 1 - pose.hitT * 0.22;
    const stretch = 1 + pose.hitT * 0.28;
    this.group.scale.set(squash, stretch, squash);
    this.head.rotation.x = pose.hitT * 0.5;
    this.bodyPivot.rotation.z = pose.hitT > 0 ? Math.sin(this.t * 40) * pose.hitT * 0.16 : 0;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material instanceof THREE.Material) m.material.dispose();
    });
  }
}
