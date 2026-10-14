import React from 'react';
import { shouldWarnAboutPeers } from '../games/common/roomPresence';

export const RoomPeersNotice: React.FC<{ peerCount: number }> = ({ peerCount }) => {
  if (!shouldWarnAboutPeers(peerCount)) return null;

  return (
    <p className="ij-notice" data-tone="alert" role="status">
      <strong>{peerCount > 1 ? `${peerCount} jendela lain aktif` : 'Satu jendela lain aktif'}.</strong>{' '}
      Browser ini membuka room yang sama di jendela lain, dan keduanya memakai kursi yang sama karena
      kursi dikenali dari penyimpanan browser. Langkah dari satu jendela akan menimpa jendela lainnya.
      Tutup jendela duplikat itu, atau mainkan dari perangkat berbeda.
    </p>
  );
};
