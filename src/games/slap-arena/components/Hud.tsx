import React, { useEffect, useRef, useState } from 'react';
import type { ArenaPhase } from '../engine/types';
import type { FxLevel, FxMode } from '../engine/fxMode';
import { unlockAudio } from '../../common/audio';

export interface HudPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  out: boolean;
  isBot: boolean;
}

export interface HudSnapshot {
  round: number;
  phase: ArenaPhase;
  countdown: number;
  scoreToWin: number;
  winnerId: string | null;
  matchWinnerId: string | null;
  players: HudPlayer[];
  localId: string;
  roomCode: string | null;
  peers: number;
  needed: number;
  slapCd: number;
  dashCd: number;
}

interface HudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  showKeys: boolean;
  slapCd: number;
  dashCd: number;
  fxMode: FxMode;
  fxLevel: FxLevel;
  onCycleFx: () => void;
  /** True when this seat is the room master and enough brawlers are seated. */
  canStart: boolean;
  onStart: () => void;
}

/** Short enough to survive a 375 px header, which is where this gets decided. */
function fxLabel(mode: FxMode, level: FxLevel): string {
  if (mode === 'auto') return level === 'low' ? 'HEMAT' : 'AUTO';
  return mode === 'high' ? 'TINGGI' : 'RENDAH';
}

const Crown: React.FC = () => (
  <svg className="sa-chip__crown" width="15" height="15" viewBox="0 0 24 24" fill="#ffcf5c" stroke="#2a1b33" strokeWidth="2" aria-hidden="true">
    <path d="M3 7l4 4 5-7 5 7 4-4v11H3z" strokeLinejoin="round" />
  </svg>
);

const SoundOn: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 8.5a5 5 0 0 1 0 7" />
  </svg>
);

const SoundOff: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 9l4 6M21 9l-4 6" />
  </svg>
);

const Exit: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h5v16h-5" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </svg>
);

export const Hud: React.FC<HudProps> = ({
  hud,
  muted,
  onToggleMute,
  onExit,
  showKeys,
  slapCd,
  dashCd,
  fxMode,
  fxLevel,
  onCycleFx,
  canStart,
  onStart,
}) => {
  const leader = hud.players.reduce<HudPlayer | null>(
    (best, p) => (!p.out && (!best || p.score > best.score) ? p : best),
    null
  );
  const countLabel =
    hud.countdown > 0 ? String(Math.min(3, Math.ceil(hud.countdown))) : 'GAS!';

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  /** The whole invite in one tap: the URL already carries the room code. */
  const copyInvite = () => {
    if (!hud.roomCode) return;
    const url = `${window.location.origin}/slap-arena/m/${hud.roomCode}`;
    const done = () => setCopied(true);
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(url).then(done, done);
        return;
      }
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const el = document.createElement('textarea');
      el.value = url;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      done();
    } catch {
      /* nothing else to try */
    }
  };

  return (
    <div className="sa-hud">
      <div className="sa-topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
          <span className="sa-pill">
            <strong data-testid="slap-round">RONDE {hud.round}</strong>
            <span className="sa-dot" />
            <span>{hud.scoreToWin} POIN MENANG</span>
          </span>
          <div className="sa-topmeta">
            {hud.roomCode && (
              <span className="sa-pill sa-pill--room" data-testid="slap-room-code">
                KODE {hud.roomCode}
              </span>
            )}
            {hud.roomCode && (
              <button
                type="button"
                className="sa-pill sa-pill--copy"
                data-testid="slap-copy-invite"
                aria-label="Salin tautan undangan ke papan klip"
                onClick={copyInvite}
              >
                {copied ? 'TAUTAN TERSALIN' : 'SALIN TAUTAN'}
              </button>
            )}
            <button
              type="button"
              className="sa-btn sa-btn--fx"
              aria-label={`Kualitas efek ${fxLabel(fxMode, fxLevel)}. Ketuk untuk beralih ke ${
                fxMode === 'auto' ? 'tinggi' : fxMode === 'high' ? 'rendah' : 'otomatis'
              }.`}
              data-testid="slap-fx"
              onClick={onCycleFx}
            >
              <span className="sa-btn__fx-key" aria-hidden="true">
                FX
              </span>
              {fxLabel(fxMode, fxLevel)}
            </button>
          </div>
        </div>

        <div className="sa-topactions">
          <button
            type="button"
            className="sa-btn sa-btn--icon"
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            aria-pressed={muted}
            data-testid="slap-mute"
            onClick={() => {
              unlockAudio();
              onToggleMute();
            }}
          >
            {muted ? <SoundOff /> : <SoundOn />}
          </button>
          <button
            type="button"
            className="sa-btn sa-btn--icon"
            aria-label="Keluar ke lobby"
            data-testid="slap-exit"
            onClick={onExit}
          >
            <Exit />
          </button>
        </div>
      </div>

      <div className="sa-scores" data-testid="slap-scores" role="list" aria-label="Nilai pemain">
        {hud.players.map((p) => (
          <div
            key={p.id}
            role="listitem"
            className={[
              'sa-chip',
              p.id === hud.localId ? 'sa-chip--me' : '',
              p.out ? 'sa-chip--out' : '',
              leader?.id === p.id ? 'sa-chip--lead' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid={`slap-chip-${p.id === hud.localId ? 'me' : p.isBot ? 'bot' : 'opp'}`}
          >
            <span className="sa-chip__face" style={{ '--c': p.color } as React.CSSProperties} />
            <span className="sa-chip__name">{p.name}</span>
            {leader?.id === p.id && leader.score > 0 && <Crown />}
            <span className="sa-chip__score">{p.score}</span>
          </div>
        ))}
      </div>

      <div>
        {hud.phase === 'COUNTDOWN' && (
          <div className="sa-countdown" data-testid="slap-countdown" key={countLabel} role="timer">
            {countLabel}
          </div>
        )}
        {hud.phase === 'WAITING' && hud.roomCode && hud.peers < hud.needed && (
          <div className="sa-hint" data-testid="slap-waiting">
            Menunggu {hud.needed - hud.peers} brawler lagi. Salin tautan undangan untuk mengajak teman.
          </div>
        )}
        {hud.phase === 'WAITING' && hud.roomCode && hud.peers >= hud.needed && (
          <div className="sa-hint" data-testid="slap-ready">
            {canStart
              ? 'Semua brawler sudah masuk. Tekan Mulai saat kamu siap.'
              : 'Menunggu tuan rumah menekan Mulai.'}
          </div>
        )}
        {canStart && hud.phase === 'WAITING' && (
          <button type="button" className="sa-start" data-testid="slap-start" onClick={onStart}>
            MULAI
          </button>
        )}
        {showKeys && (
          <div className="sa-keys" data-testid="slap-keys">
            <span className="sa-keys__group">
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> gerak
            </span>
            <span className="sa-keys__sep" />
            <span className="sa-keys__group">
              <kbd>Spasi</kbd> tampar{' '}
              <span className="sa-keys__cd" data-testid="slap-cd">{slapCd > 0 ? `${slapCd.toFixed(1)}s` : 'siap'}</span>
            </span>
            <span className="sa-keys__sep" />
            <span className="sa-keys__group">
              <em className="sa-keys__hint">tahan Spasi = lempar jauh</em>
            </span>
            <span className="sa-keys__sep" />
            <span className="sa-keys__group">
              <kbd>Shift</kbd> terjang{' '}
              <span className="sa-keys__cd" data-testid="slap-dash-cd">{dashCd > 0 ? `${dashCd.toFixed(1)}s` : 'siap'}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface ModalProps {
  title: string;
  body: string;
  tone?: 'good' | 'bad';
  actions: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean }>;
  testId: string;
}

export const ArenaModal: React.FC<ModalProps> = ({ title, body, tone = 'good', actions, testId }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const focusable = node.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    focusable[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        actions[actions.length - 1]?.onClick();
        return;
      }
      if (e.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [actions]);

  return (
    <div className="sa-modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} data-testid={testId}>
      <div className="sa-card">
        <div className={`sa-card__crest${tone === 'bad' ? ' sa-card__crest--bad' : ''}`} aria-hidden="true">
          {tone === 'bad' ? (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2a1b33" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 7v7M12 17.5v.5" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#2a1b33">
              <path d="M4 18h16v2H4zM5 6l4.5 4L12 4l2.5 6L19 6l-1.5 10h-11z" />
            </svg>
          )}
        </div>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="sa-card__stack">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`sa-btn${a.variant === 'primary' ? ' sa-btn--primary' : a.variant === 'ghost' ? ' sa-btn--ghost' : ''}`}
              onClick={a.onClick}
              disabled={a.disabled}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
