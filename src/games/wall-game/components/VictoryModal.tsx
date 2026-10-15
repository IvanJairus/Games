import React from 'react';
import { Home, RotateCw, Trophy } from 'lucide-react';
import { Player } from '../engine/types';
import { ResultDialog } from '../../common/ResultDialog';

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
  if (!winner) return null;

  return (
    <ResultDialog
      isOpen={isOpen}
      testId="victory-modal"
      titleId="victory-title"
      tone="win"
      crest={<Trophy size={28} />}
      kicker="KEMENANGAN TELAH DIRAIH · THE GOLDEN CORE"
      title={`${winner.name} Menang!`}
      chip={
        <>
          <span
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: winner.theme.hex,
            }}
          />
          Bidak #{winner.id + 1} · {winner.theme.label}
        </>
      }
      stats={[
        { label: 'Putaran', value: turn },
        { label: 'Sisa Dinding', value: winner.wallsRemaining, accent: true },
        { label: 'Grid', value: `${gridSize}×${gridSize}` },
      ]}
      actions={[
        {
          label: 'Main Lagi (Restart)',
          icon: <RotateCw size={14} />,
          onClick: onRestart,
          testId: 'victory-restart-btn',
        },
        { label: 'Konfigurasi Baru', onClick: onNewSetup, testId: 'victory-new-setup-btn' },
      ]}
      links={[{ label: 'Menu Utama', icon: <Home size={12} />, to: '/', testId: 'victory-home-link' }]}
      dismissLabel="Lihat Papan Akhir"
      dismissTestId="victory-view-board-btn"
      onDismiss={onClose}
    />
  );
};
