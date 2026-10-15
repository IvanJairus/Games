import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';

import type { BombermanState, SimEvent } from '../engine/types';
import type { FxGates } from '../engine/fxMode';
import { bombMarkup, powerMarkup, softMarkup, spriteMarkup, type PowerGlyph, type SpriteFacing, type SpritePose } from '../sprites';
import floorGrass from '../assets/floor-grass.webp';
import floorSand from '../assets/floor-sand.webp';
import floorStone from '../assets/floor-stone.webp';


export const CELL = 40;

/** A character is taller than its cell on purpose: feet on the tile, head over the tile above. */
const CHAR_BOX = { w: 46, h: 66, dx: -3, dy: -26 };
const BOMB_BOX = { w: 36, h: 36, dx: 2, dy: 4 };
const FLAT_BOX = { w: CELL, h: CELL, dx: 0, dy: 0 };
/**
 * Tiled in user space at two cells, so the texture lines up with the grid instead of
 * cutting a random slice of stone through every tile. Kept translucent: the floor is
 * scenery, and a character has to stay readable on top of it.
 */
export const FLOOR_TEXTURES: Record<string, string> = {
  grass: floorGrass,
  sand: floorSand,
  stone: floorStone,
};
const FLOOR_TILE = CELL * 2;
const FLOOR_OPACITY = 0.45;

export interface ArenaHandle {
  draw: (state: BombermanState, events: SimEvent[]) => void;
}

interface ArenaProps {
  cols: number;
  rows: number;
  floor: string;
  gates: FxGates;
  reducedMotion: boolean;
  /** Countdown and round banners live inside the board box so their scrim never
      darkens the whole stage. */
  children?: ReactNode;
}

const inCell = (box: typeof FLAT_BOX): string =>
  `<svg x="${box.dx}" y="${box.dy}" width="${box.w}" height="${box.h}" viewBox`;

/** Turns a standalone sprite into one that sits inside a board cell. */
const fit = (markup: string, box: typeof FLAT_BOX): string =>
  markup.replace('<svg class="bm-sprite" viewBox', inCell(box));

const keyOf = (x: number, y: number): string => `${x},${y}`;

function poseFor(state: BombermanState, seat: number, trapped: boolean): SpritePose {
  const p = state.players.find((q) => q.seat === seat);
  if (!p) return 'idle';
  if (!p.alive) return 'ko';
  if (p.step) return 'walk';
  if (p.cool > 0) return 'place';
  if (trapped) return 'panic';
  return 'idle';
}

export const Arena = forwardRef<ArenaHandle, ArenaProps>(function Arena(
  { cols, rows, floor, gates, reducedMotion, children },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const staticRef = useRef<SVGGElement | null>(null);
  const dynRef = useRef<SVGGElement | null>(null);
  const fxRef = useRef<SVGGElement | null>(null);
  const nodes = useRef(new Map<string, SVGGElement>());
  const shakeHost = useRef<HTMLDivElement | null>(null);
  const veil = useRef<HTMLDivElement | null>(null);
  const shape = useRef('');

  const paintStatic = (state: BombermanState): void => {
    const texture = FLOOR_TEXTURES[state.floor];
    const id = `bm-floor-${state.floor}`;
    let s = texture
      ? `<defs><pattern id="${id}" width="${FLOOR_TILE}" height="${FLOOR_TILE}" patternUnits="userSpaceOnUse">
           <image href="${texture}" width="${FLOOR_TILE}" height="${FLOOR_TILE}" opacity="${FLOOR_OPACITY}"/>
         </pattern></defs>
         <rect width="${state.cols * CELL}" height="${state.rows * CELL}" fill="url(#${id})"/>`
      : '';
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const tint = (x + y) % 2 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)';
        s += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="${tint}"/>`;
      }
    }
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        if (state.grid[y][x] !== 'hard') continue;
        s += `<g transform="translate(${x * CELL + 3} ${y * CELL + 2})">
          <rect width="34" height="34" rx="7" fill="#8a8270" stroke="#2a1b33" stroke-width="2.6"/>
          <rect width="34" height="9" rx="4" fill="#fff" opacity=".16"/></g>`;
      }
    }
    if (staticRef.current) staticRef.current.innerHTML = s;
  };

  const spawnFx = (events: SimEvent[]): void => {
    const host = fxRef.current;
    if (!host) return;
    for (const e of events) {
      if (e.t === 'boom') {
        const cx = e.x * CELL + CELL / 2;
        const cy = e.y * CELL + CELL / 2;
        const len = e.range * CELL;
        const arms = [0, 90, 180, 270]
          .map(
            (rot) => `<g transform="rotate(${rot} ${cx} ${cy})">
              <rect x="${cx}" y="${cy - 13}" width="${len}" height="26" rx="13" fill="#ff8a3d" stroke="#2a1b33" stroke-width="2.6"/>
              <rect x="${cx + 6}" y="${cy - 7}" width="${Math.max(len - 14, 0)}" height="14" rx="7" fill="#ffcf5c"/>
              <circle cx="${cx + len}" cy="${cy}" r="15" fill="#ff8a3d" stroke="#2a1b33" stroke-width="2.6"/>
              <circle cx="${cx + len}" cy="${cy}" r="8" fill="#fff6e5"/></g>`,
          )
          .join('');
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.innerHTML = `<g class="bm-boom">${arms}
          <circle cx="${cx}" cy="${cy}" r="26" fill="#ff5d5d" stroke="#2a1b33" stroke-width="2.6"/>
          <circle cx="${cx}" cy="${cy}" r="18" fill="#ffcf5c"/>
          <circle cx="${cx}" cy="${cy}" r="9" fill="#fffdf5"/></g>${puffs(cx, cy, gates.puffs)}`;
        host.appendChild(g);
        window.setTimeout(() => g.remove(), 950);
        if (gates.shake && !reducedMotion) {
          const wrap = shakeHost.current;
          if (wrap) {
            wrap.classList.remove('bm-shake');
            void wrap.offsetWidth;
            wrap.classList.add('bm-shake');
          }
          veil.current?.classList.remove('bm-veil--on');
          void veil.current?.offsetWidth;
          veil.current?.classList.add('bm-veil--on');
        }
      }
      if (e.t === 'break' && gates.fragments) {
        const cx = e.x * CELL + CELL / 2;
        const cy = e.y * CELL + CELL / 2;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        let inner = '';
        for (let i = 0; i < gates.fragments; i++) {
          const a = -Math.PI / 2 + (i - (gates.fragments - 1) / 2) * 0.55;
          inner += `<rect class="bm-frag" x="${cx - 7}" y="${cy - 7}" width="${10 + (i % 3) * 4}" height="${8 + (i % 2) * 5}" rx="3"
            fill="#f0c48a" stroke="#2a1b33" stroke-width="2.2"
            style="--bm-dx:${(Math.cos(a) * 60).toFixed(1)}px;--bm-dy:${(Math.sin(a) * 52).toFixed(1)}px;--bm-rot:${i * 90 - 60}deg"/>`;
        }
        g.innerHTML = inner + puffs(cx, cy, Math.min(2, gates.puffs));
        host.appendChild(g);
        window.setTimeout(() => g.remove(), 900);
      }
      if (e.t === 'take' && gates.ringPop) {
        const cx = e.x * CELL + CELL / 2;
        const cy = e.y * CELL + CELL / 2;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.innerHTML = `<circle class="bm-ring" cx="${cx}" cy="${cy}" r="12" fill="none" stroke="#ffcf5c" stroke-width="5"/>
          <text class="bm-rise" x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="15" font-weight="700" fill="#fff6e5" stroke="#2a1b33" stroke-width=".7">+1</text>`;
        host.appendChild(g);
        window.setTimeout(() => g.remove(), 900);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    draw(state, events) {
      const svg = svgRef.current;
      if (!svg) return;
      const shapeKey = `${state.cols}x${state.rows}`;
      if (shape.current !== shapeKey) {
        shape.current = shapeKey;
        paintStatic(state);
      }

      const trapped = new Set<string>();
      for (const f of state.flames) trapped.add(keyOf(f.x, f.y));
      for (const b of state.bombs) {
        if (b.fuse > 1.1) continue;
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          for (let i = 1; i <= b.range; i++) {
            const x = b.x + d[0] * i;
            const y = b.y + d[1] * i;
            const cell = state.grid[y]?.[x];
            if (!cell || cell === 'hard' || cell === 'soft') break;
            trapped.add(keyOf(x, y));
          }
        }
      }

      const want = new Map<string, { x: number; y: number; sig: string; markup: string }>();
      for (let y = 0; y < state.rows; y++) {
        for (let x = 0; x < state.cols; x++) {
          if (state.grid[y][x] === 'soft') {
            want.set(`s${x}_${y}`, { x, y, sig: 'soft', markup: fit(softMarkup(), FLAT_BOX) });
          }
        }
      }
      for (const u of state.powers) {
        want.set(`u${u.x}_${u.y}`, {
          x: u.x,
          y: u.y,
          sig: `power:${u.kind}`,
          markup: fit(powerMarkup(u.kind as PowerGlyph), FLAT_BOX),
        });
      }
      for (const b of state.bombs) {
        want.set(`b${b.id}`, {
          x: b.x,
          y: b.y,
          sig: b.fuse < 1 ? 'bomb:urgent' : 'bomb',
          markup: fit(bombMarkup(b.fuse < 1), BOMB_BOX),
        });
      }
      for (const f of state.flames) {
        want.set(`f${f.id}`, { x: f.x, y: f.y, sig: `flame:${f.kind}`, markup: flameMarkup(f.kind) });
      }
      for (const p of state.players) {
        const pose = poseFor(state, p.seat, trapped.has(keyOf(p.x, p.y)));
        want.set(`p${p.seat}`, {
          x: p.ax,
          y: p.ay,
          sig: `player:${p.charId}:${pose}:${p.facing}:${p.shield ? 1 : 0}`,
          markup: fit(spriteMarkup(p.charId, pose, p.facing as SpriteFacing), CHAR_BOX),
        });
      }

      const host = dynRef.current;
      if (!host) return;
      for (const [key, spec] of want) {
        let node = nodes.current.get(key);
        if (!node) {
          node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          node.innerHTML = spec.markup;
          node.dataset.sig = spec.sig;
          host.appendChild(node);
          nodes.current.set(key, node);
        } else if (node.dataset.sig !== spec.sig) {
          node.innerHTML = spec.markup;
          node.dataset.sig = spec.sig;
        }
        const px = Math.round(spec.x * CELL);
        const py = Math.round(spec.y * CELL);
        if (node.dataset.px !== String(px) || node.dataset.py !== String(py)) {
          node.setAttribute('transform', `translate(${px} ${py})`);
          node.dataset.px = String(px);
          node.dataset.py = String(py);
        }
      }
      for (const [key, node] of nodes.current) {
        if (!want.has(key)) {
          node.remove();
          nodes.current.delete(key);
        }
      }

      spawnFx(events);
    },
  }));

  return (
    <div
      className="bm-boardwrap"
      ref={shakeHost}
      data-testid="bomberman-boardwrap"
      style={{ ['--bm-ratio' as string]: `${cols} / ${rows}` }}
    >
      <svg
        ref={svgRef}
        className={`bm-board bm-board--${floor} bm-board--live`}
        viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}
        role="img"
        aria-label={`Arena Bomberman ${cols} kali ${rows} petak`}
        data-testid="bomberman-board"
      >
        <g ref={staticRef} />
        <g ref={dynRef} />
        <g ref={fxRef} />
      </svg>
      <div className="bm-veil" ref={veil} />
      {children}
    </div>
  );
});

function puffs(cx: number, cy: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = ((Math.PI * 2) / Math.max(n, 1)) * i;
    s += `<circle class="bm-puff" cx="${cx + Math.cos(a) * 20}" cy="${cy}" r="${8 + (i % 3) * 3}" fill="#6b6472" opacity=".5"
      style="animation-delay:${(0.3 + i * 0.05).toFixed(2)}s"/>`;
  }
  return s;
}

function flameMarkup(kind: string): string {
  if (kind === 'core') {
    return `<svg x="0" y="0" width="${CELL}" height="${CELL}" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="19" fill="#ffcf5c" stroke="#2a1b33" stroke-width="2.6"/>
      <circle cx="20" cy="20" r="9" fill="#fffdf5"/></svg>`;
  }
  if (kind === 'arm') {
    return `<svg x="0" y="0" width="${CELL}" height="${CELL}" viewBox="0 0 40 40">
      <rect x="0" y="4" width="40" height="32" rx="16" fill="#ff8a3d" stroke="#2a1b33" stroke-width="2.6"/>
      <rect x="4" y="12" width="32" height="16" rx="8" fill="#ffcf5c"/></svg>`;
  }
  return `<svg x="0" y="0" width="${CELL}" height="${CELL}" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="18" fill="#ff8a3d" stroke="#2a1b33" stroke-width="2.6"/>
    <circle cx="20" cy="20" r="9" fill="#fff6e5"/></svg>`;
}
