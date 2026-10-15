import * as THREE from 'three';

/** 8 red dashes with transparent gaps, tiled once around the rim. */
function makeDashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 16);
    const dashes = 8;
    const step = 256 / dashes;
    ctx.fillStyle = '#ff3b3b';
    for (let i = 0; i < dashes; i++) ctx.fillRect(i * step, 0, step * 0.55, 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function toon(color: number | string, opacity = 1): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity });
}

export function makeGradientTexture(top: string, mid: string, bottom: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Big inside-out sphere: gives the sky a horizon and makes the island read as floating. */
export function createSky(): { mesh: THREE.Mesh; dispose: () => void } {
  const geo = new THREE.SphereGeometry(220, 24, 16);
  const mat = new THREE.MeshBasicMaterial({
    map: makeGradientTexture('#5fb8f5', '#a8e0ff', '#ffe9c9'),
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return {
    mesh,
    dispose: () => {
      geo.dispose();
      mat.map?.dispose();
      mat.dispose();
    },
  };
}

export interface IslandOptions {
  radius: number;
}

export interface Island {
  group: THREE.Group;
  /** Pulses when a brawler is standing on the lip, before they slip. */
  setDanger(level: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function createIsland({ radius }: IslandOptions): Island {
  const group = new THREE.Group();
  const trash: Array<{ dispose: () => void }> = [];
  const keep = <T extends { dispose: () => void }>(x: T) => {
    trash.push(x);
    return x;
  };

  const grass = keep(toon('#5fd06a'));
  const grassDark = keep(toon('#3fae52'));
  const dirt = keep(toon('#a2683c'));
  const rock = keep(toon('#8a6a52'));
  const leaf = keep(toon('#2f9e52'));
  const trunk = keep(toon('#7a5230'));
  const capRed = keep(toon('#ff5d5d'));
  const capCream = keep(toon('#fff3d6'));

  const topGeo = keep(new THREE.CylinderGeometry(radius, radius * 0.99, 1.1, 40));
  const top = new THREE.Mesh(topGeo, grass);
  top.position.y = -0.55;
  top.receiveShadow = true;
  group.add(top);

  // Darker band hugging the lip: the edge has to read as "slippery" even before
  // the dashes are noticeable.
  const lipGeo = keep(new THREE.RingGeometry(radius - 1.5, radius - 0.1, 40, 1));
  lipGeo.rotateX(-Math.PI / 2);
  const lip = new THREE.Mesh(lipGeo, grassDark);
  lip.position.y = 0.011;
  lip.receiveShadow = true;
  group.add(lip);

  const dirtGeo = keep(new THREE.ConeGeometry(radius * 0.99, radius * 0.85, 28, 1));
  dirtGeo.rotateX(Math.PI);
  const underside = new THREE.Mesh(dirtGeo, dirt);
  underside.position.y = -1.1 - radius * 0.42;
  group.add(underside);

  // Chunky stones round the lip so the edge is legible from the play camera.
  const stoneGeo = keep(new THREE.DodecahedronGeometry(0.42, 0));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const s = new THREE.Mesh(stoneGeo, rock);
    s.position.set(Math.cos(a) * radius * 0.98, -0.35, Math.sin(a) * radius * 0.98);
    s.rotation.set(a, a * 2, a * 0.5);
    s.scale.setScalar(0.7 + (i % 3) * 0.22);
    s.castShadow = true;
    group.add(s);
  }

  const trunkGeo = keep(new THREE.CylinderGeometry(0.15, 0.21, 1.3, 8));
  const blobGeo = keep(new THREE.IcosahedronGeometry(0.78, 0));
  const trees: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tree = new THREE.Group();
    const stem = new THREE.Mesh(trunkGeo, trunk);
    stem.position.y = 0.65;
    stem.castShadow = true;
    const crown = new THREE.Mesh(blobGeo, leaf);
    crown.position.y = 1.6;
    crown.scale.set(1, 0.9, 1);
    crown.castShadow = true;
    tree.add(stem, crown);
    // On the lip, never in the ring. A tree that grows where the fighting happens
    // hides a brawler behind its crown at exactly the wrong moment.
    tree.position.set(Math.cos(a) * radius * 0.955, 0, Math.sin(a) * radius * 0.955);
    tree.userData.spin = 0.02 + i * 0.004;
    group.add(tree);
    trees.push(tree);
  }

  const mushroomStem = keep(new THREE.CylinderGeometry(0.09, 0.11, 0.26, 6));
  const mushroomCap = keep(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55));
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    // Keep the spawn circle (about half the radius) clear: a mushroom growing
    // under a brawler reads as a rendering glitch.
    const r = radius * (0.62 + ((i * 37) % 34) / 100);
    const m = new THREE.Group();
    const stem = new THREE.Mesh(mushroomStem, capCream);
    stem.position.y = 0.13;
    const cap = new THREE.Mesh(mushroomCap, capRed);
    cap.position.y = 0.26;
    m.add(stem, cap);
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.scale.setScalar(0.7 + (i % 3) * 0.3);
    group.add(m);
  }

  // Out-of-bounds ring: thick dashes on a flat torus, so u wraps cleanly around the
  // circumference. A plain RingGeometry maps its UVs as a square and smears the dashes.
  const dashTex = keep(makeDashTexture());
  const dangerGeo = keep(new THREE.TorusGeometry(radius - 0.72, 0.13, 4, 72));
  dangerGeo.rotateX(-Math.PI / 2);
  const dangerMat = keep(
    new THREE.MeshBasicMaterial({
      map: dashTex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const danger = new THREE.Mesh(dangerGeo, dangerMat);
  danger.position.y = 0.05;
  group.add(danger);


  let dangerLevel = 0;
  let elapsed = 0;

  return {
    group,
    setDanger(level: number) {
      dangerLevel = level;
    },
    update(dt: number) {
      elapsed += dt;
      dangerMat.opacity = dangerLevel > 0 ? 0.7 + Math.abs(Math.sin(elapsed * 8)) * 0.3 : 0.85;
      for (const t of trees) t.rotation.y += t.userData.spin * dt;
    },
    dispose() {
      for (const t of trash) t.dispose();
    },
  };
}

/** Clouds and drifting islets: pure depth cue, no gameplay role. */
export function createBackdrop(): { group: THREE.Group; update: (dt: number) => void; dispose: () => void } {
  const group = new THREE.Group();
  const trash: Array<{ dispose: () => void }> = [];
  const cloudMat = new THREE.MeshToonMaterial({ color: '#ffffff' });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  trash.push(cloudMat, cloudGeo);

  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let p = 0; p < puffs; p++) {
      const mesh = new THREE.Mesh(cloudGeo, cloudMat);
      mesh.scale.setScalar(1.5 + ((p * 7) % 5) * 0.4);
      mesh.position.set(p * 1.6 - puffs * 0.8, ((p * 13) % 4) * 0.25, ((p * 5) % 3) * 0.4);
      cloud.add(mesh);
    }
    const a = (i / 9) * Math.PI * 2;
    const dist = 34 + (i % 4) * 9;
    cloud.position.set(Math.cos(a) * dist, -6 + ((i * 17) % 22), Math.sin(a) * dist);
    cloud.userData.angle = a;
    cloud.userData.dist = dist;
    cloud.userData.speed = 0.012 + (i % 3) * 0.006;
    group.add(cloud);
  }

  return {
    group,
    update(dt: number) {
      for (const c of group.children) {
        c.userData.angle += c.userData.speed * dt;
        c.position.x = Math.cos(c.userData.angle) * c.userData.dist;
        c.position.z = Math.sin(c.userData.angle) * c.userData.dist;
      }
    },
    dispose: () => trash.forEach((t) => t.dispose()),
  };
}

export interface Burst {
  x: number;
  z: number;
  y?: number;
  color: THREE.ColorRepresentation;
  count?: number;
  spread?: number;
  speed?: number;
  life?: number;
  /** Fan the debris along a world direction instead of a full circle. */
  angle?: number;
}

/** Soft round sprite: the default square point reads as on-screen noise. */
function dotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One pooled Points buffer for every impact, dust and confetti in the scene. */
export class ParticleField {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  private static sprite: THREE.Texture | null = null;
  private readonly capacity: number;

  constructor(capacity = 420) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.positions[i * 3 + 1] = -999;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    if (!ParticleField.sprite) ParticleField.sprite = dotTexture();
    this.mat = new THREE.PointsMaterial({
      size: 0.34,
      map: ParticleField.sprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  burst(b: Burst): void {
    const count = b.count ?? 12;
    const spread = b.spread ?? Math.PI * 2;
    const speed = b.speed ?? 5.5;
    const life = b.life ?? 0.55;
    const color = new THREE.Color(b.color);
    const tmp = new THREE.Color();

    const base = Number.isFinite(b.angle) ? (b.angle as number) : Math.PI / 2;

    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const a = Math.random() * spread - spread / 2 + base;
      const up = 0.35 + Math.random() * 0.65;
      const s = speed * (0.55 + Math.random() * 0.75);
      this.positions[idx * 3] = b.x + (Math.random() - 0.5) * 0.3;
      this.positions[idx * 3 + 1] = (b.y ?? 1.0) + (Math.random() - 0.5) * 0.25;
      this.positions[idx * 3 + 2] = b.z + (Math.random() - 0.5) * 0.3;
      this.vel[idx * 3] = Math.cos(a) * s * (1 - up * 0.4);
      this.vel[idx * 3 + 1] = s * up;
      this.vel[idx * 3 + 2] = Math.sin(a) * s * (1 - up * 0.4);
      this.life[idx] = life;
      this.maxLife[idx] = life;
      tmp.copy(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.18);
      this.colors[idx * 3] = tmp.r;
      this.colors[idx * 3 + 1] = tmp.g;
      this.colors[idx * 3 + 2] = tmp.b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      dirty = true;
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.positions[o + 1] = -999;
        continue;
      }
      this.vel[o + 1] -= 15 * dt;
      this.positions[o] += this.vel[o] * dt;
      this.positions[o + 1] += this.vel[o + 1] * dt;
      this.positions[o + 2] += this.vel[o + 2] * dt;
      if (this.positions[o + 1] < 0.06 && this.vel[o + 1] < 0) {
        this.positions[o + 1] = 0.06;
        this.vel[o + 1] *= -0.35;
      }
    }
    if (dirty) this.geo.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * Ground marker under a brawler: a soft shadow for weight plus a saturated team
 * ring. The ring is what makes four look-alike characters readable at a glance.
 */
export function createGroundMarker(color: string): {
  group: THREE.Group;
  setColor: (c: string) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const shadowGeo = new THREE.CircleGeometry(0.62, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#123021', transparent: true, opacity: 0.3, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.02;
  shadow.renderOrder = 1;

  const rimGeo = new THREE.RingGeometry(0.62, 0.94, 24, 1);
  rimGeo.rotateX(-Math.PI / 2);
  const rimMat = new THREE.MeshBasicMaterial({ color: '#2a1b33', transparent: true, opacity: 0.55, depthWrite: false });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.y = 0.028;
  rim.renderOrder = 2;

  const ringGeo = new THREE.RingGeometry(0.62, 0.86, 24, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.032;
  ring.renderOrder = 3;

  group.add(shadow, rim, ring);
  return {
    group,
    setColor: (c: string) => ringMat.color.set(c),
    dispose: () => {
      shadowGeo.dispose();
      shadowMat.dispose();
      rimGeo.dispose();
      rimMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}
