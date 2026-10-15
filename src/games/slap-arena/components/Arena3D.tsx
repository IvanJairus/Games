import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import type { SlapSim } from '../engine/sim';
import type { PlayerState } from '../engine/types';
import { ARENA_RADIUS, CHARGE_MAX_TIME, DASH_DURATION, SLAP_ANIM_TIME, chargeFromHold } from '../engine/physics';
import { fxGates, levelAtMount, type FxLevel, type FxMode } from '../engine/fxMode';
import { BrawlerRig, type Pose } from './three/brawler';
import { ParticleField, createBackdrop, createGroundMarker, createIsland, createSky, type Island } from './three/world';

interface CamHold {
  x: number;
  y: number;
  z: number;
  lx: number;
  ly: number;
  lz: number;
}

export interface Arena3DHandle {
  impact(x: number, z: number, color: string, strength: number, label?: string, angle?: number): void;
  koBurst(x: number, z: number, color: string, charge?: number): void;
  confetti(): void;
  shake(amount: number): void;
  /** Text only, at a world position: the verdict of a slap that hit nothing. */
  float(x: number, z: number, text: string, color: string, variant?: 'miss' | 'max'): void;
  /** Holds the swing of these brawlers for a few frames without touching positions. */
  freeze(ids: string[], ms: number): void;
}

interface Arena3DProps {
  sim: SlapSim;
  localId: string;
  reducedMotion: boolean;
  /** Read once for the WebGL context; later changes arrive through `applyMode`. */
  fxMode: FxMode;
  onError: (message: string) => void;
  onLevel?: (level: FxLevel) => void;
}

const PALETTE_FALLBACK = '#4dabf7';
const SLAP_SWING = 0.3;
const DASH_ANIM = 0.22;
/** How long a held swing lingers, and how much of a frame it eats. */
const FREEZE_RATE = 0.32;
/** A remote brawler is drawn this far along its own velocity, in metres. */
const MAX_LEAD = 0.6;
const LEAD_SECONDS = 0.08;

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
  markerColor?: string;
  slapT: number;
  dashT: number;
  /** Local hit reaction, so a client's remote brawlers stop being squashed. */
  hitT: number;
  /** Seconds of slowed rig playback left. Never touches the simulated position. */
  freezeT: number;
  /** Drives a client-side KO sink; `fallY` is not part of the snapshot. */
  fallT: number;
  prevY: number;
  labelX: number;
  labelY: number;
}

const Arena3D = forwardRef<Arena3DHandle, Arena3DProps>(function Arena3D(
  { sim, localId, reducedMotion, fxMode, onError, onLevel },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Arena3DHandle | null>(null);
  const applyModeRef = useRef<((mode: FxMode) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    impact: (x, z, color, strength, label, angle) => apiRef.current?.impact(x, z, color, strength, label, angle),
    koBurst: (x, z, color, charge) => apiRef.current?.koBurst(x, z, color, charge),
    confetti: () => apiRef.current?.confetti(),
    shake: (amount) => apiRef.current?.shake(amount),
    float: (x, z, text, color, variant) => apiRef.current?.float(x, z, text, color, variant),
    freeze: (ids, ms) => apiRef.current?.freeze(ids, ms),
  }));

  // A new preference must not rebuild the WebGL context, and must not reach the sim's
  // identity either, so it arrives through this narrow side door.
  useEffect(() => {
    applyModeRef.current?.(fxMode);
  }, [fxMode]);

  useEffect(() => {
    const container = containerRef.current;
    const labelLayer = labelLayerRef.current;
    if (!container || !labelLayer) return;
    // Function declarations below are hoisted, so TypeScript will not carry the
    // null-guard into them. These aliases do.
    const stage = container;
    const labels = labelLayer;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    let mode: FxMode = fxMode;
    let level: FxLevel = levelAtMount(fxMode, window.innerWidth);
    let gates = fxGates(level);

    let renderer: THREE.WebGLRenderer;
    try {
      // antialias is fixed for the life of the context, which is why the preference is
      // read at mount instead of only once the frame rate is known.
      renderer = new THREE.WebGLRenderer({
        antialias: gates.antialias,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      onError('Perangkat ini tidak bisa menjalankan grafis 3D (WebGL tidak tersedia).');
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, gates.maxPixelRatio));
    renderer.shadowMap.enabled = gates.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const sky = createSky();
    scene.add(sky.mesh);
    scene.fog = new THREE.Fog(new THREE.Color('#bfe6ff'), 60, 190);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 500);
    camera.position.set(0, 14, 18);

    // A green ground bounce is what turned every face olive: the sky colour must
    // not be the only thing feeding the underside of a character.
    const hemi = new THREE.HemisphereLight('#ffffff', '#cfd6dd', 1.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4d6', 1.5);
    sun.position.set(12, 24, 10);
    sun.castShadow = gates.shadows;
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

    let camHold: () => CamHold | null = () => null;

    // Dev-only: lets the visual probe hold the camera still and frame one brawler,
    // which is the only way to review the character model up close.
    if (import.meta.env.DEV) {
      const w = window as unknown as {
        __slapCam?: THREE.Camera;
        __slapCamHold?: CamHold | null;
        __slapDiag?: {
          quality: () => string;
          shadows: () => boolean;
          pixelRatio: () => number;
          fps: () => number;
        };
      };
      w.__slapCam = camera;
      camHold = () => w.__slapCamHold ?? null;
      // Adaptive quality had no observable output, so nothing could prove it ever fired.
      w.__slapDiag = {
        quality: () => level,
        shadows: () => renderer.shadowMap.enabled,
        pixelRatio: () => renderer.getPixelRatio(),
        fps: () => Math.round(lastFps),
      };
    }

    const entries = new Map<string, Entry>();

    const shake = { amount: 0, decay: 6 };
    const projected = new THREE.Vector3();
    const popAt = new THREE.Vector3();
    const livePops: HTMLDivElement[] = [];
    // Reading the stage box inside the frame that already wrote every label transform
    // forces a synchronous layout, once per landed hit.
    let stageW = stage.clientWidth || window.innerWidth;
    let stageH = stage.clientHeight || window.innerHeight;
    let frameNo = 0;

    function makeLabel(name: string, color: string, isLocal: boolean): HTMLDivElement {
      const el = document.createElement('div');
      el.className = `sa-tag${isLocal ? ' sa-tag--me' : ''}`;
      el.style.setProperty('--tag', color);
      el.textContent = name.length > 12 ? `${name.slice(0, 11)}\u2026` : name;
      labels.appendChild(el);
      return el;
    }

    function addEntry(id: string, name: string, color: string): Entry {
      const group = new THREE.Group();
      const rig = new BrawlerRig(color || PALETTE_FALLBACK);
      rig.setDetail(gates);
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
        slapT: -1,
        dashT: 0,
        hitT: 0,
        freezeT: 0,
        fallT: 0,
        prevY: 0,
        labelX: -999,
        labelY: -999,
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

    function popText(
      x: number,
      z: number,
      text: string,
      color: string,
      variant?: 'miss' | 'max'
    ): void {
      // Chained hits must not stack an unbounded row of animated divs.
      while (livePops.length >= gates.popTextMax) livePops.shift()?.remove();
      const el = document.createElement('div');
      el.className = variant ? `sa-pop sa-pop--${variant}` : 'sa-pop';
      el.style.color = color;
      el.textContent = text;
      labels.appendChild(el);
      livePops.push(el);
      const at = popAt.set(x, variant === 'miss' ? 2.35 : 1.9, z).project(camera);
      el.style.left = `${((at.x + 1) / 2) * stageW}px`;
      el.style.top = `${((-at.y + 1) / 2) * stageH}px`;
      window.setTimeout(() => {
        const i = livePops.indexOf(el);
        if (i >= 0) livePops.splice(i, 1);
        el.remove();
      }, 780);
    }

    apiRef.current = {
      impact(x, z, color, strength, label, angle) {
        const count = gates.particles ? Math.round((8 + strength * 10) * gates.particleScale) : 4;
        particles.burst({
          x,
          z,
          y: 1.1,
          color,
          count,
          speed: 4 + strength * 4,
          spread: 1.4 + strength,
          angle,
        });
        if (label) popText(x, z, label, color);
        if (gates.shake && !reducedMotion) shake.amount = Math.min(0.55, shake.amount + 0.16 * strength);
      },
      koBurst(x, z, color, charge = 0) {
        const count = gates.particles ? Math.round((16 + charge * 14) * gates.particleScale) : 5;
        particles.burst({ x, z, y: 0.6, color, count, speed: 7 + charge * 3, life: 0.8 });
        if (gates.shake && !reducedMotion) shake.amount = Math.min(0.8, shake.amount + 0.34 + charge * 0.2);
      },
      confetti() {
        if (!gates.particles) return;
        const colors = ['#ffd166', '#ff6b6b', '#5fd06a', '#4dabf7', '#f783ac'];
        for (let i = 0; i < 5; i++) {
          particles.burst({
            x: (Math.random() - 0.5) * 6,
            z: (Math.random() - 0.5) * 6,
            y: 6 + Math.random() * 3,
            color: colors[i % colors.length],
            count: Math.round(26 * gates.particleScale),
            speed: 3.4,
            life: 2.4,
          });
        }
      },
      shake(amount) {
        if (gates.shake && !reducedMotion) shake.amount = Math.min(0.9, shake.amount + amount);
      },
      float(x, z, text, color, variant) {
        popText(x, z, text, color, variant);
      },
      freeze(ids, ms) {
        const hold = Math.min(ms, gates.hitFreezeMs);
        if (hold <= 0) return;
        for (const id of ids) {
          const e = entries.get(id);
          if (e) e.freezeT = Math.max(e.freezeT, hold / 1000);
        }
      },
    };

    const clock = new THREE.Clock();
    let animId = 0;
    let frames = 0;
    let fpsTimer = 0;
    let fpsAvg = 0;
    let lastFps = 0;
    let slowSeconds = 0;
    let fastSeconds = 0;
    /** Only an automatic downgrade is ever allowed to climb back up. */
    let autoDropped = false;
    const downgradeTimes: number[] = [];

    /** Everything below can change after the context exists. `antialias` cannot. */
    function applyLevel(next: FxLevel): void {
      if (next === level) return;
      level = next;
      gates = fxGates(level);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, gates.maxPixelRatio));
      renderer.shadowMap.enabled = gates.shadows;
      sun.castShadow = gates.shadows;
      for (const e of entries.values()) e.rig.setDetail(gates);
      onLevel?.(level);
    }

    function applyMode(next: FxMode): void {
      mode = next;
      // Auto keeps whatever the measured frame budget already settled on.
      if (next === 'auto') return;
      autoDropped = false;
      slowSeconds = 0;
      fastSeconds = 0;
      applyLevel(next);
    }
    applyModeRef.current = applyMode;

    /**
     * The swing of an authoritative brawler comes straight from the sim clock. A remote
     * one arrives as a 20 Hz pose with no animation state, so its swing is detected from
     * the cooldown jumping back up and then played out locally at the real frame rate.
     */
    function poseFor(
      e: Entry,
      p: PlayerState,
      dt: number,
      speed: number,
      cheering: boolean,
      frozen: boolean
    ): Pose {
      const own = sim.authoritative || p.id === localId;
      if (own) {
        // Held on the freeze frames: the sim keeps integrating, and this is the pose the
        // eye needs to see linger. The drawn position deliberately does not hold.
        if (!frozen) {
          e.slapT = p.slapAnimT >= 0 ? p.slapAnimT / SLAP_ANIM_TIME : -1;
          e.dashT = p.isDashing ? Math.max(0, p.dashTimer / DASH_DURATION) : 0;
        }
      } else {
        if (e.prevSlap - p.slapCooldown > 0.15) e.slapT = 0;
        else if (e.slapT >= 0) {
          e.slapT += dt / SLAP_SWING;
          if (e.slapT > 1) e.slapT = -1;
        }
        if (e.prevDash - p.dashCooldown > 0.5) e.dashT = 1;
        e.dashT = Math.max(0, e.dashT - dt / DASH_ANIM);
        e.prevSlap = p.slapCooldown;
        e.prevDash = p.dashCooldown;
      }
      // A client is told about a bump once and nothing decays it, so a remote would
      // otherwise stay squashed flat until the next round.
      e.hitT = Math.max(e.hitT - dt * 4, p.bump);
      const windup = p.chargeT >= 0 ? Math.min(1, p.chargeT / CHARGE_MAX_TIME) : -1;
      return {
        speed,
        slapT: e.slapT,
        hitT: e.hitT,
        dashT: e.dashT,
        falling: p.isFalling,
        cheering,
        charge: gates.windup ? windup : windup * 0.5,
        air: chargeFromHold(p.chargeT),
      };
    }

    function frame(): void {
      animId = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      const { state } = sim;

      for (const id of entries.keys()) if (!state.players[id]) removeEntry(id);

      let danger = 0;
      const ids = Object.keys(state.players);
      const drawLabels = gates.labelEveryFrame || frameNo % 2 === 0;
      frameNo++;
      ids.forEach((id) => {
        const p = state.players[id];
        let e = entries.get(id);
        if (!e) e = addEntry(id, p.name, p.color);
        const speed = Math.hypot(p.vx, p.vz);
        const own = sim.authoritative || id === localId;
        // A landed hit holds the pose, never the drawn position: freezing the position
        // while the sim keeps integrating is what would pop a body a metre sideways.
        const frozen = e.freezeT > 0;
        const adt = frozen ? dt * FREEZE_RATE : dt;
        e.freezeT = Math.max(0, e.freezeT - dt);
        e.wobble += adt * (4 + speed);
        if (e.markerColor !== p.color) {
          e.markerColor = p.color;
          e.marker.setColor(p.color || PALETTE_FALLBACK);
        }
        e.marker.setCharge(p.chargeT >= 0 ? Math.min(1, p.chargeT / CHARGE_MAX_TIME) : 0);

        let px = p.x;
        let pz = p.z;
        if (!own) {
          // A client only hears about remote brawlers 20 times a second, so draw them
          // where they should be between snapshots instead of teleporting on arrival.
          const ik = 1 - Math.pow(0.0001, dt);
          e.renderX += (px - e.renderX) * ik;
          e.renderZ += (pz - e.renderZ) * ik;
          // Smoothing alone still reads as a row of hops under a heavy knockback, so
          // carry the reported velocity forward a little. Bounded, because the host may
          // have stopped that body against another one in the meantime.
          let ox = p.vx * LEAD_SECONDS;
          let oz = p.vz * LEAD_SECONDS;
          const om = Math.hypot(ox, oz);
          if (om > MAX_LEAD) {
            ox *= MAX_LEAD / om;
            oz *= MAX_LEAD / om;
          }
          px = e.renderX + ox;
          pz = e.renderZ + oz;
          const r = Math.hypot(px, pz);
          const maxR = ARENA_RADIUS + 1.5;
          if (r > maxR) {
            px *= maxR / r;
            pz *= maxR / r;
          }
        } else {
          e.renderX = px;
          e.renderZ = pz;
        }

        if (p.isFalling) {
          // fallY is not on the wire, so a client's KO'd peer needs its own sink.
          e.fallT += dt;
          const fy = own ? p.fallY : -15 * e.fallT * e.fallT;
          e.group.position.set(px, fy, pz);
          e.group.rotation.z += dt * 5.5;
          e.group.rotation.x = Math.sin(e.wobble) * 0.5;
          e.marker.group.visible = false;
        } else {
          if (e.prevY > 0.12 && p.y <= 0) {
            particles.burst({
              x: px,
              z: pz,
              y: 0.15,
              color: '#e8d9b0',
              count: gates.particles ? Math.max(4, Math.round(9 * gates.particleScale)) : 4,
              speed: 2.6,
              life: 0.4,
            });
          }
          e.fallT = 0;
          e.group.position.set(px, p.y, pz);
          e.group.rotation.y = -p.angle + Math.PI / 2;
          e.group.rotation.z = 0;
          e.group.rotation.x = 0;
          e.marker.group.visible = true;
          const airborne = Math.hypot(p.x, p.z) > ARENA_RADIUS - 0.4;
          if (airborne) danger = Math.max(danger, 1);
        }
        e.prevY = p.y;

        const celebrating = state.phase !== 'BATTLE' && state.winnerId === id;
        e.rig.update(adt, poseFor(e, p, adt, speed, celebrating, frozen));

        if (!drawLabels) return;
        const label = e.label;
        projected.set(px, 2.95, pz).project(camera);
        if (projected.z > 1 || p.eliminated) {
          if (e.labelX > -900) {
            label.style.opacity = '0';
            e.labelX = -999;
          }
          return;
        }
        const lx = ((projected.x + 1) / 2) * stageW;
        const ly = ((-projected.y + 1) / 2) * stageH;
        // Writing a transform that lands on the same pixel still costs a style pass.
        if (Math.abs(lx - e.labelX) < 0.5 && Math.abs(ly - e.labelY) < 0.5) return;
        e.labelX = lx;
        e.labelY = ly;
        label.style.opacity = p.isFalling ? '0.35' : '1';
        label.style.transform = `translate(-50%,-50%) translate(${lx}px,${ly}px)`;
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
      const hold = camHold();
      const aspect = stageW / Math.max(1, stageH);
      // Vertical FOV binds on wide screens, horizontal FOV on tall ones, so the
      // distance is derived from whichever axis is the tight fit.
      const fovRad = (camera.fov * Math.PI) / 180;
      const needV = (ARENA_RADIUS + 1.6) / Math.tan(fovRad / 2);
      // A tall viewport can never fit the whole disc horizontally without shrinking
      // the brawlers to ants, so the lip is allowed to crop and the camera follows.
      const needH = ((ARENA_RADIUS + 1.6) * 0.78) / (Math.tan(fovRad / 2) * aspect);
      const fit = Math.max(needV, needH);
      const wide = aspect > 1.4;
      const dist = fit * (wide ? 1.06 : 0.87);
      const high = fit * (wide ? 0.5 : 0.72);
      const fx = follow ? follow.x * 0.5 : 0;
      const fz = follow ? follow.z * 0.5 : 0;
      const k = 1 - Math.pow(0.0015, dt);

      if (hold) {
        camera.position.set(hold.x, hold.y, hold.z);
        camera.lookAt(hold.lx, hold.ly, hold.lz);
      }
      if (!hold) {
        camera.position.x += (fx - camera.position.x) * k;
        camera.position.y += (high - camera.position.y) * k;
        camera.position.z += (fz + dist - camera.position.z) * k;
      }

      if (shake.amount > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shake.amount;
        camera.position.y += (Math.random() - 0.5) * shake.amount;
        shake.amount = Math.max(0, shake.amount - dt * shake.decay * shake.amount * 3 - dt * 0.12);
      }
      if (!hold) camera.lookAt(fx * 0.6, 1.1, fz * 0.6);

      renderer.render(scene, camera);

      frames++;
      fpsTimer += dt;
      if (fpsTimer >= 1) {
        const fps = frames / fpsTimer;
        frames = 0;
        fpsTimer = 0;
        fpsAvg = fpsAvg > 0 ? fpsAvg + 0.35 * (fps - fpsAvg) : fps;
        if (fpsAvg < 44) {
          slowSeconds++;
          fastSeconds = 0;
        } else if (fpsAvg > 56) {
          fastSeconds++;
          slowSeconds = 0;
        } else {
          slowSeconds = 0;
          fastSeconds = 0;
        }
        // A single bad second used to latch the low tier forever, and the trip line sat
        // exactly on what a retina laptop measures, so it latched on almost every run.
        const thrashed = downgradeTimes.filter((t) => clock.elapsedTime - t < 60).length >= 3;
        if (mode === 'auto' && !thrashed) {
          if (level === 'high' && slowSeconds >= 2) {
            applyLevel('low');
            downgradeTimes.push(clock.elapsedTime);
            autoDropped = true;
            slowSeconds = 0;
          } else if (level === 'low' && autoDropped && fastSeconds >= 6) {
            applyLevel('high');
            autoDropped = false;
            fastSeconds = 0;
          }
        }
        lastFps = fps;
      }
    }

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      stageW = w;
      stageH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const handleContextLost = (event: Event) => {
      // Preventing the default is what allows the context to come back at all.
      event.preventDefault();
      cancelAnimationFrame(animId);
      onError('Kartu grafis melepas koneksi 3D. Muat ulang halaman untuk lanjut main.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    window.addEventListener('resize', handleResize);

    frame();
    onLevel?.(level);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      for (const id of [...entries.keys()]) removeEntry(id);
      for (const el of livePops) el.remove();
      livePops.length = 0;
      island.dispose();
      backdrop.dispose();
      particles.dispose();
      sky.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
      applyModeRef.current = null;
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
