import React from 'react';
import { RouteObject } from 'react-router-dom';
import { wallGameRoutes } from './wall-game/routes';
import { ticTacToeRoutes } from './tic-tac-toe/routes';
import { slapArenaRoutes } from './slap-arena/routes';

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
    id: 'slap-arena',
    title: 'Slap Arena · Island Brawler',
    subtitle: 'Roblox-Style 3D Physics Brawler',
    description: 'Pertarungan aksi real-time di atas pulau melayang. Tampar dan dorong lawan keluar arena dengan sarung tinju raksasa.',
    playerRange: '1 - 4 Pemain',
    statusLabel: 'Solo & Online',
    route: '/slap-arena',
    routes: slapArenaRoutes,
    thumbnail: (
      <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
        <defs>
          <radialGradient id="skyGrad" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="100%" stopColor="#38bdf8" />
          </radialGradient>
        </defs>
        {/* Sky backdrop */}
        <rect width="320" height="180" fill="url(#skyGrad)" rx="8" />
        {/* Floating clouds */}
        <ellipse cx="60" cy="40" rx="30" ry="12" fill="#ffffff" opacity="0.85" />
        <ellipse cx="260" cy="50" rx="35" ry="14" fill="#ffffff" opacity="0.85" />
        {/* Under island cone */}
        <polygon points="100,125 220,125 160,165" fill="#451a03" />
        {/* Island platform */}
        <ellipse cx="160" cy="125" rx="75" ry="24" fill="#22c55e" stroke="#b45309" strokeWidth="3" />
        <ellipse cx="160" cy="125" rx="60" ry="18" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
        {/* Brawler 1 (Blue) */}
        <g transform="translate(130, 95)">
          <rect x="-10" y="-22" width="20" height="26" rx="10" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="1.5" />
          {/* Eyes */}
          <circle cx="-3" cy="-14" r="2.5" fill="#ffffff" />
          <circle cx="-2" cy="-14" r="1.2" fill="#000000" />
          <circle cx="3" cy="-14" r="2.5" fill="#ffffff" />
          <circle cx="4" cy="-14" r="1.2" fill="#000000" />
          {/* Slap Glove punching out */}
          <circle cx="16" cy="-12" r="7" fill="#dc2626" stroke="#991b1b" strokeWidth="1.5" />
        </g>
        {/* Impact star */}
        <g transform="translate(155, 82)">
          <polygon points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" fill="#facc15" stroke="#eab308" strokeWidth="0.8" />
        </g>
        {/* Brawler 2 (Red, flying off!) */}
        <g transform="translate(180, 85) rotate(25)">
          <rect x="-10" y="-22" width="20" height="26" rx="10" fill="#ef4444" stroke="#991b1b" strokeWidth="1.5" />
          {/* Dizzy X eyes */}
          <line x1="-5" y1="-16" x2="-1" y2="-12" stroke="#ffffff" strokeWidth="1.2" />
          <line x1="-1" y1="-16" x2="-5" y2="-12" stroke="#ffffff" strokeWidth="1.2" />
          <line x1="2" y1="-16" x2="6" y2="-12" stroke="#ffffff" strokeWidth="1.2" />
          <line x1="6" y1="-16" x2="2" y2="-12" stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="-12" cy="-10" r="5" fill="#f59e0b" />
        </g>
      </svg>
    ),
  },
  {
    id: 'wall-game',
    title: 'WallGo · Race to the Golden Core',
    subtitle: 'Mekanik Walls.gg / Quoridor',
    description: 'Gerak 1 petak atau pasang dinding 2-petak. Capai petak pusat emas lebih dulu dengan strategi anti-trap.',
    playerRange: '2 - 6 Pemain',
    statusLabel: 'Lokal & Online',
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
    title: 'Tic Tac Toe · Mode No-Draw',
    subtitle: 'Maksimal 3 Bidak (Anti-Seri)',
    description: 'Setiap pemain maksimal memiliki 3 bidak di papan. Bidak ke-4 otomatis melenyapkan bidak tertua. Mustahil seri!',
    playerRange: '2 Pemain',
    statusLabel: 'Lokal & Online',
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

