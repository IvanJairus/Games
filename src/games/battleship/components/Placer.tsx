import React, { useMemo, useState } from 'react';
import { Board } from './Board';
import { FleetRail } from './FleetRail';
import { FLEET, Orientation, Placement, ShipKind, cellLabel, colOf, rowOf } from '../engine/types';
import { buildPlacements, generateSeed, shipCells } from '../engine/rng';
import { SecretLayout } from '../engine/store';

export interface PlacerProps {
  onReady: (layout: SecretLayout) => void;
  disabled?: boolean;
  lockedNote?: string | null;
}

export const Placer: React.FC<PlacerProps> = ({ onReady, disabled = false, lockedNote = null }) => {
  const [seed, setSeed] = useState<string>(() => generateSeed());
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [orientation, setOrientation] = useState<Orientation>('H');
  const [selectedKind, setSelectedKind] = useState<ShipKind>(FLEET[0].kind);
  const [note, setNote] = useState<string | null>(null);

  const placedKinds = useMemo(() => placements.map((p) => p.kind), [placements]);
  const locked = placements.length === FLEET.length;
  const picked: ShipKind | null = locked ? null : selectedKind;
  const remaining = FLEET.filter((s) => !placedKinds.includes(s.kind));

  // Picking a ship that is already on the board lifts it back off, so repositioning is one tap.
  const handlePick = (kind: ShipKind) => {
    setSelectedKind(kind);
    setPlacements((list) => list.filter((p) => p.kind !== kind));
    setNote(null);
  };

  const handleUndo = () => {
    if (placements.length === 0) return;
    setSelectedKind(placements[placements.length - 1].kind);
    setPlacements((list) => list.slice(0, -1));
    setNote(null);
  };

  const handleCell = (cell: number) => {
    if (!picked) return;
    const spec = FLEET.find((s) => s.kind === picked);
    if (!spec) return;

    const cells = shipCells(rowOf(cell), colOf(cell), spec.size, orientation);
    if (!cells) {
      setNote(
        `${picked} sepanjang ${spec.size} tidak muat dari ${cellLabel(cell)} ke ${
          orientation === 'H' ? 'kanan' : 'bawah'
        }.`
      );
      return;
    }

    const taken = new Set(placements.flatMap((p) => p.cells));
    if (cells.some((c) => taken.has(c))) {
      setNote(`${picked} menabrak kapal lain di ${cellLabel(cell)}.`);
      return;
    }

    const list = [...placements, { kind: picked, cells }];
    setPlacements(list);
    const next = FLEET.find((s) => !list.some((p) => p.kind === s.kind));
    if (next) setSelectedKind(next.kind);
    setNote(null);
  };

  const randomize = () => {
    const next = generateSeed();
    setSeed(next);
    setPlacements(buildPlacements(next));
    setNote(null);
  };

  return (
    <div>
      <p style={{ fontSize: '13.5px', color: 'var(--ink-dim)', margin: '0 0 14px', lineHeight: 1.55 }}>
        Pilih kapal, tentukan arah, lalu klik petak awal di papan. Susunan armada tinggal di perangkat
        ini; yang dikirim ke lawan hanya komitmennya.
      </p>

      <FleetRail picked={picked} placed={placedKinds} onPick={disabled ? undefined : handlePick} />

      <div style={{ margin: '14px 0 8px' }}>
        <Board
          label="Papan armada Anda"
          hint={`${placements.length}/${FLEET.length} kapal ditempatkan`}
          marks={{}}
          ships={placements}
          interactive={!disabled && !locked}
          onPick={handleCell}
        />
      </div>

      {note && (
        <div className="bs-note" data-tone="alert" role="alert">
          {note}
        </div>
      )}

      {lockedNote && (
        <div className="bs-note" role="status">
          {lockedNote}
        </div>
      )}

      <div className="bs-actions">
        <button
          type="button"
          className="bs-btn"
          onClick={() => setOrientation(orientation === 'H' ? 'V' : 'H')}
          disabled={disabled || locked}
        >
          Arah: {orientation === 'H' ? 'Horizontal' : 'Vertikal'}
        </button>
        <button type="button" className="bs-btn" onClick={randomize} disabled={disabled}>
          Acak Ulang
        </button>
        <button type="button" className="bs-btn" onClick={handleUndo} disabled={disabled || placements.length === 0}>
          Undo
        </button>
        <button
          type="button"
          className="bs-btn"
          data-tone="primary"
          onClick={() => onReady({ seed, placements })}
          disabled={disabled || !locked}
        >
          Kunci Armada
        </button>
      </div>

      {!locked && remaining.length > 0 && (
        <p style={{ font: '11px/1.5 var(--mono)', color: 'var(--ink-faint)', margin: '8px 0 0' }}>
          Belum ditempatkan: {remaining.map((s) => `${s.kind} (${s.size})`).join(', ')}
        </p>
      )}
    </div>
  );
};
