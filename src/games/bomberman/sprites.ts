/**
 * Character and prop artwork, drawn in code.
 *
 * The contract every character here obeys, taken from the style preview the cast was
 * approved against: head is 60% of the height, limbs are stubs, at most three fill
 * colours, a 2.6-3 keyline, and a silhouette that is still recognisable at 32 px.
 * Cuteness comes from proportion and expression. No pink, no hearts, no lashes.
 */

import { CHARACTER_IDS, type CharacterId } from './engine/types';

export type SpritePose = 'idle' | 'walk' | 'place' | 'panic' | 'ko' | 'win';
export type SpriteFacing = 'up' | 'down' | 'left' | 'right';

export interface CharacterSpec {
  id: CharacterId;
  label: string;
  blurb: string;
  main: string;
  dark: string;
  skin: string;
  belly: string;
  trim: string;
}

const KEY = '#2a1b33';
const CREAM = '#fff6e5';

export const CHARACTERS: CharacterSpec[] = [
  {
    id: 'robo', label: 'Bola Luncur', blurb: 'Robot kurir, helm kaca bening',
    main: '#4dabf7', dark: '#2f7fc4', skin: CREAM, belly: CREAM, trim: '#ffcf5c',
  },
  {
    id: 'tupai', label: 'Tupai Gudang', blurb: 'Tupai bertopi, ekor besar',
    main: '#ff5d5d', dark: '#d94141', skin: '#ffd9b3', belly: CREAM, trim: '#ffcf5c',
  },
  {
    id: 'radar', label: 'Kacang Radar', blurb: 'Anak gudang, kacamata di dahi',
    main: '#5fd06a', dark: '#3f9e4b', skin: '#ffd9b3', belly: CREAM, trim: '#4dabf7',
  },
  {
    id: 'biskuit', label: 'Biskuit Karamel', blurb: 'Biskuit hidup, mata besar',
    main: '#f2c98d', dark: '#c98f4e', skin: '#f2c98d', belly: CREAM, trim: '#8a5a2b',
  },
  {
    id: 'lampu', label: 'Lampu Sorot', blurb: 'Kepala bohlam, topi kerja',
    main: '#ffb703', dark: '#cc7a00', skin: '#fff3c4', belly: CREAM, trim: '#8a8270',
  },
  {
    id: 'sekrup', label: 'Nyecrup', blurb: 'Robot baut, kepala segi enam',
    main: '#90a4b8', dark: '#5b6b7c', skin: '#cfd9e4', belly: CREAM, trim: '#ff5d5d',
  },
];

export const CHAR_IDS: string[] = [...CHARACTER_IDS];

export const characterById = (id: string): CharacterSpec =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

const ink = (w: number): string =>
  `stroke="${KEY}" stroke-width="${w}" stroke-linejoin="round"`;

function eyes(kind: 'open' | 'wide' | 'x' | 'happy', dx: number): string {
  const a = 25 + dx;
  const b = 39 + dx;
  const y = 21;
  if (kind === 'x') {
    return `<g stroke="${KEY}" stroke-width="2.8" stroke-linecap="round">
      <path d="M${a - 3.4} ${y - 3.4}l6.8 6.8M${a + 3.4} ${y - 3.4}l-6.8 6.8"/>
      <path d="M${b - 3.4} ${y - 3.4}l6.8 6.8M${b + 3.4} ${y - 3.4}l-6.8 6.8"/></g>`;
  }
  if (kind === 'wide') {
    return `<circle cx="${a}" cy="${y}" r="5.4" fill="#fff" ${ink(2.2)}/><circle cx="${a}" cy="${y + 1}" r="2.7" fill="${KEY}"/>
            <circle cx="${b}" cy="${y}" r="5.4" fill="#fff" ${ink(2.2)}/><circle cx="${b}" cy="${y + 1}" r="2.7" fill="${KEY}"/>`;
  }
  if (kind === 'happy') {
    return `<path d="M${a - 4} ${y + 1}a4 4 0 0 1 8 0M${b - 4} ${y + 1}a4 4 0 0 1 8 0" fill="none" stroke="${KEY}" stroke-width="2.9" stroke-linecap="round"/>`;
  }
  return `<ellipse cx="${a}" cy="${y}" rx="3.7" ry="4.3" fill="${KEY}"/><circle cx="${a + 1.3}" cy="${y - 1.5}" r="1.5" fill="#fff"/>
          <ellipse cx="${b}" cy="${y}" rx="3.7" ry="4.3" fill="${KEY}"/><circle cx="${b + 1.3}" cy="${y - 1.5}" r="1.5" fill="#fff"/>`;
}

function mouth(kind: 'smile' | 'o' | 'open' | 'flat', dx: number): string {
  const x = 32 + dx;
  if (kind === 'o') return `<ellipse cx="${x}" cy="30" rx="2.6" ry="3.1" fill="${KEY}"/>`;
  if (kind === 'open') return `<path d="M${x - 4.4} 28.5a4.6 4.6 0 0 0 8.8 0z" fill="${KEY}"/>`;
  if (kind === 'flat') return `<path d="M${x - 3.6} 30h7.2" stroke="${KEY}" stroke-width="2.5" stroke-linecap="round"/>`;
  return `<path d="M${x - 4.2} 28.6a5 5 0 0 0 8.4 0" fill="none" stroke="${KEY}" stroke-width="2.5" stroke-linecap="round"/>`;
}

/** The back of a head has to be as identifiable as the front, because a top-down arena shows it half the time. */
function head(
  c: CharacterSpec,
  id: string,
  back: boolean,
  eyeKind: 'open' | 'wide' | 'x' | 'happy',
  mouthKind: 'smile' | 'o' | 'open' | 'flat',
  dx: number,
): string {
  const round = `<circle cx="32" cy="20" r="20" fill="${c.skin}" ${ink(3)}/>`;

  if (id === 'robo') {
    const shell = `<circle cx="32" cy="20" r="20" fill="${c.main}" ${ink(3)}/>
      <path d="M32 0v-6.5" stroke="${KEY}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="32" cy="-9" r="4.4" fill="${c.trim}" ${ink(2.4)}/>`;
    return back
      ? shell + `<rect x="21" y="12" width="22" height="9" rx="4.5" fill="${c.dark}" ${ink(2.4)}/>`
      : shell + `<rect x="13.5" y="12" width="37" height="21" rx="10.5" fill="${c.skin}" ${ink(2.8)}/>` + eyes(eyeKind, dx) + mouth(mouthKind, dx);
  }

  if (id === 'tupai') {
    const ears = `<circle cx="17.5" cy="4" r="7" fill="${c.skin}" ${ink(2.8)}/><circle cx="17.5" cy="4.5" r="3.3" fill="#f0b184"/>
                  <circle cx="46.5" cy="4" r="7" fill="${c.skin}" ${ink(2.8)}/><circle cx="46.5" cy="4.5" r="3.3" fill="#f0b184"/>`;
    if (back) return round + ears + `<path d="M26 14h12" stroke="${c.dark}" stroke-width="3" stroke-linecap="round"/>`;
    return round + ears
      + `<ellipse cx="32" cy="26.5" rx="10" ry="7" fill="${c.belly}" ${ink(2.2)}/>`
      + `<ellipse cx="32" cy="22.5" rx="2.7" ry="2.1" fill="${KEY}"/>`
      + eyes(eyeKind, dx) + mouth(mouthKind, dx);
  }

  if (id === 'radar') {
    const hair = `<path d="M12.2 20a19.8 19.8 0 0 1 39.6 0z" fill="#4a3b2f" ${ink(3)}/>`;
    if (back) return round + hair + `<path d="M20 26h24" stroke="#4a3b2f" stroke-width="6" stroke-linecap="round"/>`;
    return round + hair
      + `<g transform="translate(0 -11)"><circle cx="24.5" cy="21" r="6.2" fill="#cfe9ff" ${ink(2.6)}/>
         <circle cx="39.5" cy="21" r="6.2" fill="#cfe9ff" ${ink(2.6)}/>
         <path d="M30.7 21h2.6" stroke="${c.trim}" stroke-width="3"/></g>`
      + eyes(eyeKind, dx) + mouth(mouthKind, dx);
  }

  if (id === 'biskuit') {
    const slab = `<rect x="12" y="0.5" width="40" height="39" rx="14" fill="${c.skin}" ${ink(3)}/>
      <g fill="${c.trim}"><circle cx="21" cy="9" r="2.4"/><circle cx="43" cy="7.5" r="2"/><circle cx="36" cy="12.5" r="1.7"/></g>`;
    if (back) return slab + `<rect x="22" y="14" width="20" height="12" rx="5" fill="${c.dark}" opacity=".5"/>`;
    return slab + eyes(eyeKind, dx) + mouth(mouthKind, dx);
  }

  if (id === 'lampu') {
    const bulb = `<circle cx="32" cy="19" r="20" fill="${c.skin}" ${ink(3)}/>
      <path d="M22 30a12 12 0 0 0 20 0" fill="none" stroke="${c.main}" stroke-width="3" opacity=".8"/>
      <path d="M27 4h10M29 -1h6" stroke="${c.main}" stroke-width="3" stroke-linecap="round"/>`;
    const brim = `<path d="M10 20h44l-3 7H13z" fill="${c.trim}" ${ink(2.6)}/>`;
    if (back) return bulb + brim + `<rect x="24" y="26" width="16" height="8" rx="3" fill="${c.dark}" ${ink(2.2)}/>`;
    return bulb + brim + eyes(eyeKind, dx) + mouth(mouthKind, dx);
  }

  // sekrup: a hex head, so the outline itself is the identifier.
  const hex = `<path d="M32 0l18 10v20L32 40 14 30V10z" fill="${c.skin}" ${ink(3)}/>`;
  if (back) return hex + `<path d="M24 16h16M24 24h16" stroke="${c.dark}" stroke-width="4" stroke-linecap="round"/>`;
  return hex
    + `<path d="M20 6l-6-5M44 6l6-5" stroke="${c.trim}" stroke-width="3.4" stroke-linecap="round"/>`
    + eyes(eyeKind, dx) + mouth(mouthKind, dx);
}

function tail(id: string, c: CharacterSpec): string {
  if (id !== 'tupai') return '';
  return `<path d="M45 47c16-7 20 12 8 19-9 5-19 1-16-7" fill="${c.skin}" ${ink(2.8)}/>`;
}

export function spriteMarkup(id: string, pose: SpritePose, facing: SpriteFacing): string {
  const c = characterById(id);
  const back = facing === 'up';
  const side = facing === 'left' || facing === 'right';
  const dx = side ? (facing === 'right' ? 3.2 : -3.2) : 0;
  const ko = pose === 'ko';
  const eyeKind = ko ? 'x' : pose === 'panic' ? 'wide' : pose === 'win' ? 'happy' : 'open';
  const mouthKind = pose === 'panic' ? 'open' : pose === 'place' ? 'o' : ko ? 'o' : 'smile';

  let armL = 8;
  let armR = -8;
  let lean = 0;
  let cls = 'bm-bob';
  if (pose === 'walk') {
    armL = 16;
    armR = -16;
    cls = 'bm-walk';
  }
  if (pose === 'place') {
    armL = -14;
    armR = -86;
    lean = -7;
    cls = '';
  }
  if (pose === 'panic') {
    armL = -146;
    armR = 146;
    lean = 4;
    cls = 'bm-bob';
  }
  if (ko || pose === 'win') cls = '';

  return `<svg class="bm-sprite" viewBox="0 -16 64 92" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="71" rx="${ko ? 19 : 15.5}" ry="4" fill="${KEY}" opacity=".13"/>
    <g transform="${ko ? 'rotate(74 32 60) translate(-4 6)' : ''}">
      <g class="${cls}" transform="${lean ? `rotate(${lean} 32 58)` : ''}">
        ${tail(id, c)}
        <g class="bm-arm-l" transform="rotate(${armL} 13 41)"><rect x="5.5" y="38" width="10.5" height="15" rx="5.2" fill="${c.dark}" ${ink(2.6)}/></g>
        <g class="bm-arm-r" transform="rotate(${armR} 51 41)"><rect x="48" y="38" width="10.5" height="15" rx="5.2" fill="${c.dark}" ${ink(2.6)}/></g>
        <g class="bm-leg-l"><rect x="20.5" y="54" width="9.5" height="15" rx="4.7" fill="${c.dark}" ${ink(2.6)}/></g>
        <g class="bm-leg-r"><rect x="34" y="54" width="9.5" height="15" rx="4.7" fill="${c.dark}" ${ink(2.6)}/></g>
        <rect x="17.5" y="35" width="29" height="25" rx="12.5" fill="${c.main}" ${ink(2.8)}/>
        <ellipse cx="32" cy="49" rx="8.6" ry="7.6" fill="${c.belly}" opacity=".9"/>
        <g>${head(c, id, back, eyeKind, mouthKind, dx)}</g>
        ${pose === 'panic' ? `<path d="M50 6c3 4 3 7 .6 8.6-2.6 1.8-5-1.4-3.4-4z" fill="#8fd0ff" ${ink(2)}/>` : ''}
        ${ko ? `<g><path d="M12 -6l2.6 5.2 5.4.8-4 3.8.9 5.4-4.9-2.5-4.9 2.5.9-5.4-4-3.8 5.4-.8z" fill="#ffcf5c" ${ink(2)}/>
                <path d="M52 -2l2.2 4.4 4.6.7-3.4 3.2.8 4.6-4.2-2.2-4.2 2.2.8-4.6-3.4-3.2 4.6-.7z" fill="#ffcf5c" ${ink(2)}/></g>` : ''}
      </g>
    </g>
  </svg>`;
}

export function bombMarkup(urgent: boolean): string {
  return `<svg class="bm-sprite" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="57" rx="14" ry="3.6" fill="${KEY}" opacity=".14"/>
    <g class="${urgent ? 'bm-blink' : ''}">
      <circle cx="32" cy="36" r="19" fill="#3d3550" ${ink(3)}/>
      <circle cx="25" cy="29" r="5.4" fill="#fff" opacity=".5"/>
      <path d="M27 15h10v6H27z" fill="#8a8270" ${ink(2.6)}/>
      <path d="M32 15c0-6 6-5 6-9" fill="none" stroke="${KEY}" stroke-width="3" stroke-linecap="round"/>
      <g class="bm-fuse"><circle cx="38" cy="5" r="4.2" fill="#ffcf5c"/><circle cx="38" cy="5" r="1.9" fill="${CREAM}"/></g>
    </g>
  </svg>`;
}

export const softMarkup = (): string => `<svg class="bm-sprite" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect x="6" y="10" width="52" height="46" rx="10" fill="#f0c48a" ${ink(3)}/>
  <path d="M6 32h52M32 10v46" stroke="${KEY}" stroke-width="2.4" opacity=".35"/>
  <rect x="6" y="10" width="52" height="12" rx="6" fill="#fff" opacity=".22"/>
</svg>`;

export const POWER_KINDS = ['flame', 'speed', 'count', 'shield'] as const;
export type PowerGlyph = (typeof POWER_KINDS)[number];

const POWER_SKIN: Record<PowerGlyph, { color: string; glyph: string; label: string }> = {
  flame: { color: '#ff5d5d', label: '+1 API', glyph: `<path d="M32 14c10 10 12 16 12 21a12 12 0 0 1-24 0c0-6 4-10 12-21z" fill="${CREAM}" ${ink(2.8)}/>` },
  speed: { color: '#4dabf7', label: 'LARI', glyph: `<path d="M22 16l16 12-9 2 11 18-6 0-9-14-5 12z" fill="${CREAM}" ${ink(2.6)}/>` },
  count: { color: '#ffcf5c', label: '+1 BOM', glyph: `<circle cx="26" cy="34" r="9" fill="${CREAM}" ${ink(2.6)}/><circle cx="40" cy="30" r="7" fill="${CREAM}" ${ink(2.6)}/>` },
  shield: { color: '#5fd06a', label: 'PERISAI', glyph: `<path d="M32 15l14 5v11c0 9-7 14-14 18-7-4-14-9-14-18V20z" fill="${CREAM}" ${ink(2.8)}/>` },
};

export const powerLabel = (kind: PowerGlyph): string => POWER_SKIN[kind].label;

export function powerMarkup(kind: PowerGlyph): string {
  const p = POWER_SKIN[kind] ?? POWER_SKIN.flame;
  return `<svg class="bm-sprite" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="58" rx="12" ry="3" fill="${KEY}" opacity=".13"/>
    <circle cx="32" cy="34" r="21" fill="${p.color}" ${ink(3)}/>
    ${p.glyph}
  </svg>`;
}
