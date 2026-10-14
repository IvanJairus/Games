import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import type { SlapSim } from '../engine/sim';
import { ARENA_RADIUS } from '../engine/physics';
import { BrawlerRig, loadBrawlerSource, type BrawlerSource } from './three/characters';
import { ParticleField, createBackdrop, createGroundMarker, createIsland, createSky, type Island } from './three/world';

export interface Arena3DHandle {
  impact(x: number, z: number, color: string, strength: number, label?: string): void;
  koBurst(x: number, z: number, color: string): void;
  confetti(): void;
  shake(amount: number): void;
}

interface Arena3DProps {
  sim: SlapSim;
  localId: string;
  reducedMotion: boolean;
  onError: (message: string) => void;
  onFps?: (fps: number, quality: 'high' | 'low') => void;
}

const BASE = import.meta.env.BASE_URL || '/';
const CHARACTER_URLS = [`${BASE}models/barbarian.glb`, `${BASE}models/knight.glb`];
const PALETTE_FALLBACK = '#4f8cff';

interface Entry {
  rig: BrawlerRig;
  group: THREE.Group;
  marker: ReturnType<typeof createGroundMarker>;
  label: HTMLDivElement;
  prevSlap: number;
  prevDash: number;
  wobble: number;
  renderX: number;
  renderZ: number;
}

const Arena3D = forwardRef<Arena3DHandle, Arena3DProps>(function Arena3D(
  { sim, localId, reducedMotion, onError, onFps },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Arena3DHandle | null>(null);

  useImperativeHandle(ref, () => ({
    impact: (x, z, color, strength, label) => apiRef.current?.impact(x, z, color, strength, label),
    koBurst: (x, z, color) => apiRef.current?.koBurst(x, z, color),
    confetti: () => apiRef.current?.confetti(),
    shake: (amount) => apiRef.current?.shake(amount),
  }));

  useEffect(() => {
    const container = containerRef.current;
    const labelLayer = labelLayerRef.current;
    if (!container || !labelLayer) return;
    // Function declarations below are hoisted, so TypeScript will not carry the
    // null-guard into them. These aliases do.
    const stage = container;
    const labels = labelLayer;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      onError('Perangkat ini tidak bisa menjalankan grafis 3D (WebGL tidak tersedia).');
      return;
    }

    let disposed = false;
    let contextLost = false;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    let quality: 'high' | 'low' = window.innerWidth < 720 ? 'low' : 'high';

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.35));
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const sky = createSky();
    scene.add(sky.mesh);
    scene.fog = new THREE.Fog(new THREE.Color('#bfe6ff'), 60, 190);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 500);
    camera.position.set(0, 14, 18);

    const hemi = new THREE.HemisphereLight('#ffffff', '#6fcf7c', 1.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4d6', 1.5);
    sun.position.set(12, 24, 10);
    sun.castShadow = quality === 'high';
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    const s = ARENA_RADIUS + 3;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    scene.add(sun);
    const rim = new THREE.DirectionalLight('#8ad2ff', 0.55);
    rim.position.set(-10, 8, -14);
    scene.add(rim);

    const island: Island = createIsland({ radius: ARENA_RADIUS });
    scene.add(island.group);
    const backdrop = createBackdrop();
    scene.add(backdrop.group);
    const particles = new ParticleField();
    scene.add(particles.points);

    const entries = new Map<string, Entry>();
    const sources: BrawlerSource[] = [];
    let loadError = false;

    const shake = { amount: 0, decay: 6 };
    const projected = new THREE.Vector3();

    function makeLabel(name: string, color: string, isLocal: boolean): HTMLDivElement {
      const el = document.createElement('div');
      el.className = `sa-tag${isLocal ? ' sa-tag--me' : ''}`;
      el.style.setProperty('--tag', color);
      el.textContent = name.length > 12 ? `${name.slice(0, 11)}\u2026` : name;
      labels.appendChild(el);
      return el;
    }

    function addEntry(id: string, name: string, color: string, modelIndex: number): Entry {
      const group = new THREE.Group();
      const rig = new BrawlerRig(sources[modelIndex % sources.length], color || PALETTE_FALLBACK);
      group.add(rig.group);
      const marker = createGroundMarker(color || PALETTE_FALLBACK);
      group.add(marker.group);
      scene.add(group);
      const p0 = sim.players[id];
      const entry: Entry = {
        rig,
        group,
        marker,
        label: makeLabel(name, color || PALETTE_FALLBACK, id === localId),
        prevSlap: 0,
        prevDash: 0,
        wobble: Math.random() * 6,
        renderX: p0.x,
        renderZ: p0.z,
      };
      entries.set(id, entry);
      return entry;
    }

    function removeEntry(id: string): void {
      const e = entries.get(id);
      if (!e) return;
      e.label.remove();
      e.rig.dispose();
      e.marker.dispose();
      e.group.parent?.remove(e.group);
      entries.delete(id);
    }

    function popText(x: number, z: number, text: string, color: string): void {
      const el = document.createElement('div');
      el.className = 'sa-pop';
      el.style.color = color;
      el.textContent = text;
      labels.appendChild(el);
      const at = new THREE.Vector3(x, 1.9, z).project(camera);
      const rect = stage.getBoundingClientRect();
      el.style.left = `${((at.x + 1) / 2) * rect.width}px`;
      el.style.top = `${((-at.y + 1) / 2) * rect.height}px`;
      window.setTimeout(() => el.remove(), 780);
    }

    apiRef.current = {
      impact(x, z, color, strength, label) {
        particles.burst({ x, z, y: 1.1, color, count: Math.round(8 + strength * 10), speed: 4 + strength * 4 });
        if (label) popText(x, z, label, color);
        if (!reducedMotion) shake.amount = Math.min(0.55, shake.amount + 0.16 * strength);
      },
      koBurst(x, z, color) {
        particles.burst({ x, z, y: 0.6, color, count: 16, speed: 7, life: 0.8 });
        if (!reducedMotion) shake.amount = Math.min(0.8, shake.amount + 0.34);
      },
      confetti() {
        const colors = ['#ffd166', '#ff6b6b', '#5fd06a', '#4dabf7', '#f783ac'];
        for (let i = 0; i < 5; i++) {
          particles.burst({
            x: (Math.random() - 0.5) * 6,
            z: (Math.random() - 0.5) * 6,
            y: 6 + Math.random() * 3,
            color: colors[i % colors.length],
            count: 26,
            speed: 3.4,
            life: 2.4,
          });
        }
      },
      shake(amount) {
        if (!reducedMotion) shake.amount = Math.min(0.9, shake.amount + amount);
      },
    };

    const clock = new THREE.Clock();
    let animId = 0;
    let frames = 0;
    let fpsTimer = 0;
    let slowFrames = 0;

    function pickAnimation(e: Entry, p: { isFalling: boolean; slapCooldown: number; dashCooldown: number; speed: number }): void {
      if (p.isFalling) {
        e.rig.once('Death_A');
        return;
      }
      if (e.prevSlap - p.slapCooldown > 0.15) {
        e.rig.once(Math.random() > 0.5 ? 'Unarmed_Melee_Attack_Punch_A' : 'Unarmed_Melee_Attack_Punch_B');
      }
      if (e.prevDash - p.dashCooldown > 0.5) {
        e.rig.once('Dodge_Forward');
      }
      if (p.speed > 0.7) e.rig.loop('Running_A', Math.min(1.35, 0.7 + p.speed * 0.06));
      else e.rig.loop('Idle');
      e.prevSlap = p.slapCooldown;
      e.prevDash = p.dashCooldown;
    }

    function frame(): void {
      animId = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      const { state } = sim;

      for (const id of entries.keys()) if (!state.players[id]) removeEntry(id);

      let danger = 0;
      const ids = Object.keys(state.players);
      ids.forEach((id, index) => {
        const p = state.players[id];
        let e = entries.get(id);
        if (!e) {
          if (sources.length === 0) return;
          e = addEntry(id, p.name, p.color, index);
        }
        const speed = Math.hypot(p.vx, p.vz);
        e.wobble += dt * (4 + speed);
        e.marker.setColor(p.color || PALETTE_FALLBACK);

        // A client only hears about remote brawlers 20 times a second, so draw them
        // where they should be between snapshots instead of teleporting on arrival.
        const interpolate = !sim.authoritative && id !== localId;
        const px = p.x;
        const pz = p.z;
        if (interpolate) {
          const ik = 1 - Math.pow(0.0001, dt);
          e.renderX += (px - e.renderX) * ik;
          e.renderZ += (pz - e.renderZ) * ik;
        } else {
          e.renderX = px;
          e.renderZ = pz;
        }

        if (p.isFalling) {
          e.group.position.set(e.renderX, p.fallY, e.renderZ);
          e.group.rotation.z += dt * 5.5;
          e.group.rotation.x = Math.sin(e.wobble) * 0.5;
          e.marker.group.visible = false;
        } else {
          e.group.position.set(e.renderX, 0, e.renderZ);
          e.group.rotation.y = -p.angle + Math.PI / 2;
          e.group.rotation.z = 0;
          e.group.rotation.x = 0;
          e.marker.group.visible = true;
          const airborne = Math.hypot(p.x, p.z) > ARENA_RADIUS - 0.4;
          if (airborne) danger = Math.max(danger, 1);
        }

        const bump = p.bump;
        const squash = 1 - bump * 0.16;
        const stretch = 1 + bump * 0.2;
        const bob = speed > 0.7 ? Math.abs(Math.sin(e.wobble * 1.6)) * 0.05 : 0;
        e.group.scale.set(squash, stretch, squash);
        e.group.position.y = (p.isFalling ? p.fallY : 0) + bob;

        pickAnimation(e, { isFalling: p.isFalling, slapCooldown: p.slapCooldown, dashCooldown: p.dashCooldown, speed });
        e.rig.update(dt);

        const label = e.label;
        projected.set(e.renderX, 2.35 + bob, e.renderZ).project(camera);
        if (projected.z > 1 || p.eliminated) {
          label.style.opacity = '0';
        } else {
          label.style.opacity = p.isFalling ? '0.35' : '1';
          label.style.transform = `translate(-50%,-50%) translate(${((projected.x + 1) / 2) * stage.clientWidth}px,${((-projected.y + 1) / 2) * stage.clientHeight}px)`;
        }
      });

      island.setDanger(danger);
      island.update(dt);
      backdrop.update(dt);
      particles.update(dt);

      // Framing: the focus point is pulled toward the island centre so the ring of
      // grass never leaves the screen, even when you are clinging to the lip.
      const me = state.players[localId];
      const leader = ids
        .map((id) => state.players[id])
        .sort((a, b) => b.score - a.score)
        .find((p) => !p.isFalling && !p.eliminated);
      const follow = me && !me.isFalling ? me : leader ?? me;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const aspect = w / Math.max(1, h);
      // Vertical FOV binds on wide screens, horizontal FOV on tall ones, so the
      // distance is derived from whichever axis is the tight fit.
      const fovRad = (camera.fov * Math.PI) / 180;
      const needV = (ARENA_RADIUS + 1.6) / Math.tan(fovRad / 2);
      const needH = (ARENA_RADIUS + 1.6) / (Math.tan(fovRad / 2) * aspect);
      const fit = Math.max(needV, needH);
      const wide = aspect > 1.4;
      const dist = fit * (wide ? 1.06 : 0.87);
      const high = fit * (wide ? 0.5 : 0.72);
      const fx = follow ? follow.x * 0.5 : 0;
      const fz = follow ? follow.z * 0.5 : 0;
      const k = 1 - Math.pow(0.0015, dt);

      camera.position.x += (fx - camera.position.x) * k;
      camera.position.y += (high - camera.position.y) * k;
      camera.position.z += (fz + dist - camera.position.z) * k;

      if (shake.amount > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shake.amount;
        camera.position.y += (Math.random() - 0.5) * shake.amount;
        shake.amount = Math.max(0, shake.amount - dt * shake.decay * shake.amount * 3 - dt * 0.12);
      }
      camera.lookAt(fx * 0.6, 1.1, fz * 0.6);

      renderer.render(scene, camera);

      frames++;
      fpsTimer += dt;
      if (fpsTimer >= 1) {
        const fps = frames / fpsTimer;
        frames = 0;
        fpsTimer = 0;
        if (fps < 45 && quality === 'high') {
          slowFrames++;
          if (slowFrames >= 2) {
            quality = 'low';
            slowFrames = 0;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
            renderer.shadowMap.enabled = false;
            sun.castShadow = false;
            for (const e of entries.values()) {
              e.group.traverse((o) => {
                if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
              });
            }
          }
        } else if (fps > 58) {
          slowFrames = 0;
        }
        onFps?.(Math.round(fps), quality);
      }
    }

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(animId);
      onError('Kartu grafis melepas koneksi 3D. Muat ulang halaman untuk lanjut main.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    window.addEventListener('resize', handleResize);

    (async () => {
      try {
        for (const url of CHARACTER_URLS) {
          const src = await loadBrawlerSource(url);
          if (disposed) return;
          sources.push(src);
        }
      } catch (err) {
        loadError = true;
        console.error('[slap-arena] gagal memuat model karakter', err);
        onError('Model karakter gagal dimuat. Periksa koneksi lalu muat ulang halaman.');
        return;
      }
      if (disposed || contextLost || loadError) return;
      frame();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      for (const id of [...entries.keys()]) removeEntry(id);
      island.dispose();
      backdrop.dispose();
      particles.dispose();
      sky.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, [sim, localId, reducedMotion, onError]);

  return (
    <div ref={containerRef} className="sa-stage" data-testid="slap-arena-stage">
      <div ref={labelLayerRef} className="sa-label-layer" aria-hidden="true" />
    </div>
  );
});

export { Arena3D };
export type { Arena3DProps };
