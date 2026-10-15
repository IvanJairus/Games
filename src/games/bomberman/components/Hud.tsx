import { Link } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';

import type { BombermanState } from '../engine/types';
import type { FxLevel, FxMode } from '../engine/fxMode';
import { characterById } from '../sprites';

export const SEAT_COLORS = ['#ff5d5d', '#4dabf7', '#5fd06a', '#ffcf5c'];

interface HudProps {
  state: BombermanState;
  mySeat: number;
  modeLabel: string;
  fxMode: FxMode;
  fxLevel: FxLevel;
  muted: boolean;
  onCycleFx: () => void;
  onToggleSound: () => void;
  onExit: () => void;
}

const fxLabel = (mode: FxMode, level: FxLevel): string =>
  mode === 'auto' ? (level === 'low' ? 'HEMAT' : 'AUTO') : level === 'low' ? 'RENDAH' : 'TINGGI';

export function Hud({
  state,
  mySeat,
  modeLabel,
  fxMode,
  fxLevel,
  muted,
  onCycleFx,
  onToggleSound,
  onExit,
}: HudProps) {
  return (
    <>
      <div className="bm-top">
        <Link className="bm-back" to="/bomberman" onClick={onExit}>
          <span aria-hidden="true">&larr;</span>
          <span className="bm-back__label">Lobby</span>
        </Link>
        <h1 className="bm-title">Bomberman &middot; {modeLabel}</h1>
        <div className="bm-topactions">
          <button
            type="button"
            className="bm-iconbtn"
            onClick={onCycleFx}
            aria-label={`Kualitas efek: ${fxLabel(fxMode, fxLevel)}`}
            data-testid="bomberman-fx"
          >
            {fxLabel(fxMode, fxLevel)}
          </button>
          <button
            type="button"
            className="bm-iconbtn"
            onClick={onToggleSound}
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            aria-pressed={!muted}
            data-testid="bomberman-sound"
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </div>

      <div className="bm-scores" role="list" aria-label="Papan skor">
        {state.players.map((p, i) => (
          <div
            key={p.seat}
            className="bm-chip"
            role="listitem"
            data-out={p.alive ? '0' : '1'}
            data-me={p.seat === mySeat ? '1' : '0'}
            data-testid={`bomberman-chip-${p.seat}`}
          >
            <span className="bm-dot" style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }} />
            <span className="bm-chip__name">{p.name}</span>
            <b>{p.wins}</b>
            <span className="bm-chip__char" aria-hidden="true">{characterById(p.charId).label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

interface StatusProps {
  text: string;
}

/** Lives in its own reserved slot: the board must not move when this line changes length. */
export function StatusLine({ text }: StatusProps) {
  return (
    <div className="bm-status" role="status" aria-live="polite" data-testid="bomberman-status">
      {text}
    </div>
  );
}
