import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RotateCw, Home, Trophy } from 'lucide-react';
import { Player } from '../engine/types';

export interface VictoryModalProps {
  isOpen: boolean;
  winner: Player | null;
  turn: number;
  gridSize: number;
  onRestart: () => void;
  onNewSetup: () => void;
  onClose: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  isOpen,
  winner,
  turn,
  gridSize,
  onRestart,
  onNewSetup,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && winner) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen, winner]);

  if (!winner) return null;

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  const handleRestart = () => {
    dialogRef.current?.close();
    onRestart();
  };

  const handleNewSetup = () => {
    dialogRef.current?.close();
    onNewSetup();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="victory-title"
      data-testid="victory-modal"
      style={{
        position: 'fixed',
        inset: 0,
        margin: 'auto',
        border: '1px solid var(--gold-border)',
        borderRadius: 'var(--r4)',
        padding: '0',
        background: '#ffffff',
        boxShadow: '0 20px 40px rgba(180, 83, 9, 0.18), 0 2px 8px rgba(28, 25, 23, 0.08)',
        maxWidth: '440px',
        width: 'calc(100% - 32px)',
        color: 'var(--ink)',
      }}
    >
      <div style={{ padding: '28px 24px 22px', textAlign: 'center' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--bg-stage)',
            border: '2px solid var(--gold)',
            color: 'var(--gold)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
          }}
        >
          <Trophy size={28} />
        </div>

        <div
          style={{
            font: '10px/1 var(--mono)',
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: '6px',
          }}
        >
          KEMENANGAN TELAH DIRAIH · THE GOLDEN CORE
        </div>

        <h2
          id="victory-title"
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--ink)',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          {winner.name} Menang!
        </h2>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px',
            borderRadius: 'var(--r2)',
            background: 'var(--bg-stage)',
            border: '1px solid var(--line)',
            marginBottom: '18px',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: winner.theme.hex,
            }}
          />
          <span style={{ font: '12px/1 var(--mono)', color: 'var(--ink-dim)' }}>
            Bidak #{winner.id + 1} · {winner.theme.label}
          </span>
        </div>

        {/* Match Telemetry Recap */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            background: 'var(--bg-stage)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r2)',
            padding: '12px 8px',
            marginBottom: '22px',
            font: 'var(--mono)',
          }}
        >
          <div>
            <div style={{ fontSize: '10px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Putaran</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{turn}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Sisa Dinding</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold)' }}>{winner.wallsRemaining}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Grid</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{gridSize}×{gridSize}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={handleRestart}
            data-testid="victory-restart-btn"
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--gold)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--r2)',
              font: '12px/1 var(--mono)',
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <RotateCw size={14} /> Main Lagi (Restart)
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={handleNewSetup}
              data-testid="victory-new-setup-btn"
              style={{
                padding: '10px',
                background: 'var(--bg-stage)',
                border: '1px solid var(--line-strong)',
                color: 'var(--ink)',
                borderRadius: 'var(--r2)',
                font: '11px/1 var(--mono)',
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Konfigurasi Baru
            </button>

            <Link
              to="/"
              onClick={handleClose}
              data-testid="victory-home-link"
              style={{
                padding: '10px',
                background: 'var(--bg-stage)',
                border: '1px solid var(--line-strong)',
                color: 'var(--ink)',
                borderRadius: 'var(--r2)',
                font: '11px/1 var(--mono)',
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Home size={12} /> Menu Utama
            </Link>
          </div>

          <button
            type="button"
            onClick={handleClose}
            data-testid="victory-view-board-btn"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-faint)',
              font: '11px/1 var(--mono)',
              marginTop: '6px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Lihat Papan Akhir
          </button>
        </div>
      </div>
    </dialog>
  );
};
