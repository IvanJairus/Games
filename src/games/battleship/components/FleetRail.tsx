import React from 'react';
import { FLEET, ShipKind } from '../engine/types';

export interface FleetRailProps {
  picked?: ShipKind | null;
  placed?: ShipKind[];
  sunk?: ShipKind[];
  onPick?: (kind: ShipKind) => void;
}

export const FleetRail: React.FC<FleetRailProps> = ({ picked = null, placed = [], sunk = [], onPick }) => (
  <div className="bs-rail" role="group" aria-label="Daftar kapal">
    {FLEET.map((ship) => {
      const isSunk = sunk.includes(ship.kind);
      const isPlaced = placed.includes(ship.kind);
      const interactive = Boolean(onPick) && !isPlaced;

      return (
        <button
          type="button"
          key={ship.kind}
          className="bs-chip"
          data-sunk={isSunk || undefined}
          data-picked={picked === ship.kind || undefined}
          disabled={!interactive}
          onClick={() => onPick?.(ship.kind)}
          aria-pressed={picked === ship.kind}
          aria-label={`${ship.kind}, ${ship.size} petak${isSunk ? ', tenggelam' : isPlaced ? ', sudah ditempatkan' : ''}`}
        >
          <span>{ship.kind}</span>
          <span aria-hidden="true" style={{ letterSpacing: '1px' }}>
            {'■'.repeat(ship.size)}
          </span>
        </button>
      );
    })}
  </div>
);
