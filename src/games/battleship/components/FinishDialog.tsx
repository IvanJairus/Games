import React from 'react';
import { Anchor, RotateCw, Skull, Trophy, Users } from 'lucide-react';
import { ResultAction, ResultDialog, ResultNavLink } from '../../common/ResultDialog';
import { BattleshipState, FLEET } from '../engine/types';

export interface FinishDialogProps {
  open: boolean;
  state: BattleshipState;
  labels: [string, string];
  /** The seat the reader sits in, or null when nobody owns a seat on this device (hotseat). */
  viewAs: 0 | 1 | null;
  retry: { label: string; onClick: () => void; disabled?: boolean; testId?: string };
  secondaryActions?: ResultAction[];
  links?: ResultNavLink[];
  onDismiss: () => void;
  testId: string;
}

const END_REASON: Record<string, string> = {
  'fleet-destroyed': 'Seluruh armada musnah',
  'left-while-battle': 'Satu pihak meninggalkan room',
};

export const FinishDialog: React.FC<FinishDialogProps> = ({
  open,
  state,
  labels,
  viewAs,
  retry,
  secondaryActions = [],
  links = [],
  onDismiss,
  testId,
}) => {
  const winner = state.winner;
  const loser = winner === null ? null : winner === 0 ? 1 : 0;
  const tone = winner === null ? 'neutral' : viewAs === null || viewAs === winner ? 'win' : 'lose';

  const title =
    winner === null
      ? 'Berakhir tanpa pemenang'
      : viewAs !== null && viewAs === winner
        ? 'Anda menang'
        : `${labels[winner]} menang`;

  const crest =
    tone === 'win' ? <Trophy size={26} /> : tone === 'lose' ? <Skull size={26} /> : <Anchor size={26} />;

  return (
    <ResultDialog
      isOpen={open}
      testId={testId}
      titleId={`${testId}-title`}
      tone={tone}
      crest={crest}
      kicker="Pertandingan selesai"
      title={title}
      chip={
        <>
          <Users size={12} aria-hidden="true" />
          {END_REASON[state.endReason || ''] || 'Selesai'}
          {loser !== null && ` · ${labels[loser]} kehilangan ${FLEET.length} kapal`}
        </>
      }
      stats={[
        { label: `Tembakan ${labels[0]}`, value: state.shotsTaken[0], accent: winner === 0 },
        { label: `Tembakan ${labels[1]}`, value: state.shotsTaken[1], accent: winner === 1 },
        { label: 'Kapal musnah', value: loser === null ? '0' : `${state.sunk[loser].length}/${FLEET.length}` },
      ]}
      actions={[
        { label: retry.label, icon: <RotateCw size={14} />, onClick: retry.onClick, disabled: retry.disabled, testId: retry.testId },
        ...secondaryActions,
      ]}
      links={links}
      dismissLabel="Lihat bukti armada"
      onDismiss={onDismiss}
    />
  );
};
