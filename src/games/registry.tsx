import React from 'react';
import { RouteObject } from 'react-router-dom';
import { wallGameRoutes } from './wall-game/routes';
import { ticTacToeRoutes } from './tic-tac-toe/routes';

export interface GameMetadata {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  playerRange: string;
  statusLabel: string;
  route: string;
  routes: RouteObject[];
  thumbnail: React.ReactNode;
}

export const GAMES_REGISTRY: GameMetadata[] = [
  {
    id: 'wall-game',
    title: 'WallGo · Race to the Golden Core',
    subtitle: 'Mekanik Walls.gg / Quoridor',
    description: 'Gerak 1 petak atau pasang dinding 2-petak. Capai petak pusat emas lebih dulu dengan strategi anti-trap.',
    playerRange: '2 - 6 Pemain',
    statusLabel: 'Lokal Siap',
    route: '/wall-game',
    routes: wallGameRoutes,
    thumbnail: (
      <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.1" color="var(--ink-faint)">
          <path d="M60 20v140M110 20v140M160 20v140M210 20v140M260 20v140" stroke="rgba(28, 25, 23, 0.12)" />
          <path d="M40 50h240M40 90h240M40 130h240" stroke="rgba(28, 25, 23, 0.12)" strokeDasharray="4 4" />
          <circle cx="160" cy="90" r="14" stroke="var(--gold)" strokeWidth="1.5" />
          <circle cx="160" cy="90" r="5" fill="var(--gold)" stroke="none" />
          <circle cx="160" cy="140" r="8" fill="#b45309" stroke="#78350f" strokeWidth="1.2" />
          <circle cx="160" cy="40" r="8" fill="#451a03" stroke="#1c1917" strokeWidth="1.2" />
          <rect x="90" y="88" width="50" height="4" rx="1" fill="#78350f" stroke="#b45309" strokeWidth="0.8" />
        </g>
      </svg>
    ),
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic Tac Toe · Duel 3×3',
    subtitle: 'Klasik Garis 3 Berurutan',
    description: 'Adu kecerdasan taktis cepat dalam papan 3x3. Pasang simbol X atau O untuk menyusun baris kemenangan.',
    playerRange: '2 Pemain',
    statusLabel: 'Lokal Siap',
    route: '/tic-tac-toe',
    routes: ticTacToeRoutes,
    thumbnail: (
      <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
        <g stroke="rgba(28, 25, 23, 0.18)" strokeWidth="2" strokeLinecap="round">
          <line x1="125" y1="35" x2="125" y2="145" />
          <line x1="195" y1="35" x2="195" y2="145" />
          <line x1="75" y1="72" x2="245" y2="72" />
          <line x1="75" y1="108" x2="245" y2="108" />
        </g>
        <g strokeWidth="2.5" strokeLinecap="round">
          {/* X symbol in top-left */}
          <line x1="90" y1="46" x2="110" y2="62" stroke="#b45309" />
          <line x1="110" y1="46" x2="90" y2="62" stroke="#b45309" />
          {/* O symbol in center */}
          <circle cx="160" cy="90" r="11" fill="none" stroke="#451a03" />
          {/* X symbol in bottom-right */}
          <line x1="210" y1="118" x2="230" y2="134" stroke="#b45309" />
          <line x1="230" y1="118" x2="210" y2="134" stroke="#b45309" />
        </g>
      </svg>
    ),
  },
];

export const allGameRoutes: RouteObject[] = GAMES_REGISTRY.flatMap((g) => g.routes);
