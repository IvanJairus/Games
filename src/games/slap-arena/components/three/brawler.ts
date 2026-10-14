import * as THREE from 'three';

const INK = '#2a1b33';
const SKIN = '#ffd9b3';
const GLOVE = '#ff5d5d';

/** Shared across every brawler: same silhouette, only colours differ. */
const geo = {
  head: new THREE.SphereGeometry(0.62, 24, 18),
  body: new THREE.SphereGeometry(0.54, 24, 18),
  leg: new THREE.CapsuleGeometry(0.13, 0.12, 4, 10),
  glove: new THREE.SphereGeometry(0.34, 18, 14),
  cuff: new THREE.CylinderGeometry(0.2, 0.24, 0.14, 12),
  cap: new THREE.SphereGeometry(0.645, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
  // Back half of the skull: without this the character reads as a bare skin blob
  // from the camera angle that follows them.
  hair: new THREE.SphereGeometry(0.628, 22, 16, Math.PI * 0.42, Math.PI * 1.16),
  pom: new THREE.SphereGeometry(0.13, 12, 10),
  eye: new THREE.SphereGeometry(0.085, 12, 10),
  shine: new THREE.SphereGeometry(0.035, 8, 8),
  mouth: new THREE.TorusGeometry(0.17, 0.035, 6, 12, Math.PI * 0.85),
  brow: new THREE.CapsuleGeometry(0.035, 0.13, 3, 8),
};

const toonRamp = (() => {
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
  return new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: toonRamp() });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(INK), side: THREE.BackSide });

/** A second copy drawn from the back: cheap cartoon ink line, no shader needed. */
function outlined(mesh: THREE.Mesh, width = 0.055): THREE.Mesh {
  const shell = new THREE.Mesh(mesh.geometry, outlineMat);
  shell.scale.setScalar(1 + width);
  shell.renderOrder = -1;
  mesh.add(shell);
  return mesh;
}

export interface Pose {
  speed: number;
  /** 0..1 through the swing, negative when idle. */
  slapT: number;
  hitT: number;
  dashT: number;
  falling: boolean;
  cheering: boolean;
}

const IDLE: Pose = { speed: 0, slapT: -1, hitT: 0, dashT: 0, falling: false, cheering: false };

/**
 * Chunky procedural brawler: head is just over half the height, legs are stubs,
 * gloves are huge. Everything is primitives, so there is no model file, no
 * WebAssembly decoder and no squash limit, and the tint stays readable.
 */
export class BrawlerRig {
  readonly group = new THREE.Group();
  readonly height = 2.2;

  private head = new THREE.Group();
  private bodyPivot = new THREE.Group();
  private legL!: THREE.Mesh;
  private legR!: THREE.Mesh;
  private gloveL!: THREE.Group;
  private gloveR!: THREE.Group;
  private skinMat = toon(SKIN);
  private suitMat = toon('#4dabf7');
  private capMat = toon('#4dabf7');
  private gloveMat = toon(GLOVE);
  private eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(INK) });
  private shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private t = 0;

  constructor(colorHex: string) {
    this.suitMat.color.set(colorHex);
    this.capMat.color.set(colorHex);
    this.build();
  }

  private build(): void {
    const body = outlined(new THREE.Mesh(geo.body, this.suitMat));
    body.position.y = 0.72;
    body.castShadow = true;
    this.bodyPivot.add(body);

    this.legL = outlined(new THREE.Mesh(geo.leg, this.suitMat));
    this.legR = outlined(new THREE.Mesh(geo.leg, this.suitMat));
    this.legL.position.set(-0.22, 0.2, 0);
    this.legR.position.set(0.22, 0.2, 0);
    this.legL.castShadow = this.legR.castShadow = true;
    this.bodyPivot.add(this.legL, this.legR);

    const head = outlined(new THREE.Mesh(geo.head, this.skinMat));
    head.position.y = 1.56;
    head.castShadow = true;
    this.head.add(head);

    const cap = outlined(new THREE.Mesh(geo.cap, this.capMat), 0.045);
    cap.position.y = 1.6;
    cap.castShadow = true;
    const hair = new THREE.Mesh(geo.hair, this.capMat);
    hair.position.y = 1.56;
    hair.rotation.y = -Math.PI / 2;
    this.head.add(hair);
    const pom = outlined(new THREE.Mesh(geo.pom, this.shineMat), 0.16);
    pom.position.y = 2.19;
    this.head.add(cap, pom);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(geo.eye, this.eyeMat);
      eye.position.set(0.21 * side, 1.62, 0.53);
      const shine = new THREE.Mesh(geo.shine, this.shineMat);
      shine.position.set(0.21 * side - 0.03, 1.66, 0.6);
      const brow = new THREE.Mesh(geo.brow, this.eyeMat);
      brow.position.set(0.22 * side, 1.79, 0.5);
      brow.rotation.z = Math.PI / 2 - 0.18 * side;
      this.head.add(eye, shine, brow);
    }

    const mouth = new THREE.Mesh(geo.mouth, this.eyeMat);
    mouth.position.set(0, 1.4, 0.56);
    mouth.rotation.z = Math.PI + Math.PI * 0.075;
    this.head.add(mouth);

    for (const [side, holder] of [[-1, 'L'], [1, 'R']] as const) {
      const g = new THREE.Group();
      const glove = outlined(new THREE.Mesh(geo.glove, this.gloveMat));
      glove.castShadow = true;
      const cuff = outlined(new THREE.Mesh(geo.cuff, this.suitMat), 0.09);
      cuff.position.set(0.06 * side, 0.24, -0.1);
      g.add(glove, cuff);
      g.position.set(0.72 * side, 0.78, 0.12);
      if (holder === 'L') this.gloveL = g;
      else this.gloveR = g;
      this.bodyPivot.add(g);
    }

    this.group.add(this.bodyPivot, this.head);
  }

  setColor(colorHex: string): void {
    this.suitMat.color.set(colorHex);
    this.capMat.color.set(colorHex);
  }

  /** Drives the whole rig from simulation state; no clips, no mixer. */
  update(dt: number, pose: Pose = IDLE): void {
    this.t += dt;
    const moving = pose.speed > 0.6;
    const step = this.t * (6 + pose.speed * 0.9);

    // Idle breath and walk bounce share one curve so switching never pops.
    const bounce = moving ? Math.abs(Math.sin(step)) * 0.11 : Math.sin(this.t * 2.1) * 0.025;
    this.bodyPivot.position.y = bounce;
    this.head.position.y = bounce * 1.35;

    const lean = moving ? 0.13 : pose.falling ? 0 : 0.02;
    this.bodyPivot.rotation.x = -lean * Math.min(1, pose.speed / 5);

    const swing = moving ? Math.sin(step) * 0.55 : Math.sin(this.t * 1.6) * 0.05;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.legL.position.z = Math.sin(swing) * 0.12;
    this.legR.position.z = -Math.sin(swing) * 0.12;

    const bob = moving ? Math.cos(step) * 0.06 : 0;
    this.gloveL.position.set(-0.72, 0.78 + bob, 0.12);
    this.gloveR.position.set(0.72, 0.78 - bob, 0.12);
    this.gloveL.rotation.set(0, 0, 0.1);
    this.gloveR.rotation.set(0, 0, -0.1);

    if (pose.cheering) {
      this.gloveL.position.set(-0.6, 1.5, 0.1);
      this.gloveR.position.set(0.6, 1.5, 0.1);
      this.bodyPivot.position.y = Math.abs(Math.sin(this.t * 7)) * 0.24;
      this.head.position.y = this.bodyPivot.position.y * 1.2;
    }

    if (pose.slapT >= 0) {
      // Wind-up then a fast thrust, with the torso following so it reads as a swing.
      const k = pose.slapT;
      const thrust = k < 0.25 ? -0.16 * (k / 0.25) : 0.9 * Math.sin(((k - 0.25) / 0.75) * Math.PI);
      this.gloveR.position.set(0.72 - thrust * 0.18, 0.92, 0.12 + thrust * 0.95);
      this.gloveR.scale.setScalar(1 + thrust * 0.28);
      this.bodyPivot.rotation.y = -thrust * 0.42;
      this.head.rotation.y = -thrust * 0.16;
    } else {
      this.gloveR.scale.setScalar(1);
      this.bodyPivot.rotation.y = 0;
      this.head.rotation.y = 0;
    }

    if (pose.dashT > 0) {
      this.gloveL.position.z = 0.5;
      this.gloveR.position.z = 0.5;
      this.bodyPivot.rotation.x = -0.42;
      this.head.position.z = -0.12;
    } else {
      this.head.position.z = 0;
    }

    const squash = 1 - pose.hitT * 0.2;
    const stretch = 1 + pose.hitT * 0.26;
    this.group.scale.set(squash, stretch, squash);
    if (pose.hitT > 0) {
      this.head.rotation.x = pose.hitT * 0.5;
      this.bodyPivot.rotation.z = Math.sin(this.t * 40) * pose.hitT * 0.16;
    } else {
      this.head.rotation.x = 0;
      this.bodyPivot.rotation.z = 0;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material instanceof THREE.Material && m.material.dispose();
    });
  }
}

/** Geometries are module-level and shared; the app never unloads the arena scene twice in one page. */
export function disposeBrawlerGeometry(): void {
  for (const g of Object.values(geo)) g.dispose();
  outlineMat.dispose();
}
