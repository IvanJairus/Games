import React from 'react';

export interface BoardSwitchProps {
  value: 'own' | 'target';
  onChange: (next: 'own' | 'target') => void;
  ownLabel: string;
  targetLabel: string;
}

export const BoardSwitch: React.FC<BoardSwitchProps> = ({ value, onChange, ownLabel, targetLabel }) => (
  <div className="bs-view-switch">
    <button type="button" aria-current={value === 'own'} onClick={() => onChange('own')}>
      {ownLabel}
    </button>
    <button type="button" aria-current={value === 'target'} onClick={() => onChange('target')}>
      {targetLabel}
    </button>
  </div>
);
