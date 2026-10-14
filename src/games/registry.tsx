import React from 'react';
import { RouteObject } from 'react-router-dom';
import { wallGameRoutes } from './wall-game/routes';
import { ticTacToeRoutes } from './tic-tac-toe/routes';
import { battleshipRoutes } from './battleship/routes';
import { slapArenaRoutes } from './slap-arena/routes';
import { GameType } from './common/multiplayer';

export interface GameMetadata {
  id: GameType;
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
    title: 'Slap Arena · Pulau Tampol',
    subtitle: 'Brawler fisika 3D, satu pulau melayang',
    description: 'Tampar dan terjang lawan sampai tercebur dari pulau melayang. Solo melawan tiga bot berkarakter, atau online sampai empat brawler.',
    playerRange: '1 - 4 Pemain',
    statusLabel: 'Solo & Online',
    route: '/slap-arena',
    routes: slapArenaRoutes,
    thumbnail: (
      <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
        <defs>
          <linearGradient id="saThumbSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8fd0ff" />
            <stop offset="100%" stopColor="#e7f8d8" />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill="url(#saThumbSky)" rx="8" />
        <ellipse cx="46" cy="34" rx="24" ry="10" fill="#fff" opacity="0.9" />
        <ellipse cx="272" cy="46" rx="28" ry="11" fill="#fff" opacity="0.9" />
        <path d="M112 122h96l-14 34q-4 10-8 0z" fill="#a2683c" stroke="#2a1b33" strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="160" cy="122" rx="72" ry="21" fill="#5fd06a" stroke="#2a1b33" strokeWidth="3.5" />
        <ellipse cx="160" cy="120" rx="52" ry="14" fill="none" stroke="#ff5d5d" strokeWidth="2" strokeDasharray="5 4" opacity="0.75" />
        <ellipse cx="160" cy="140" rx="30" ry="6" fill="#2a1b33" opacity="0.12" />

        <g stroke="#2a1b33" strokeWidth="3.4" strokeLinejoin="round">
          <g transform="translate(126 104)">
            <rect x="-11" y="-2" width="22" height="24" rx="11" fill="#4dabf7" />
            <circle cx="0" cy="-14" r="13" fill="#ffd9b3" />
            <path d="M-13 -16a13 13 0 0 1 26 0z" fill="#4dabf7" />
            <circle cx="0" cy="-27" r="4" fill="#fff6e5" />
            <circle cx="-4.5" cy="-14" r="2.3" fill="#2a1b33" stroke="none" />
            <circle cx="4.5" cy="-14" r="2.3" fill="#2a1b33" stroke="none" />
            <circle cx="17" cy="2" r="7.5" fill="#ff5d5d" />
          </g>
          <g transform="translate(196 96) rotate(22)">
            <rect x="-11" y="-2" width="22" height="24" rx="11" fill="#ff5d5d" />
            <circle cx="0" cy="-14" r="13" fill="#ffd9b3" />
            <path d="M-13 -16a13 13 0 0 1 26 0z" fill="#ff5d5d" />
            <circle cx="0" cy="-27" r="4" fill="#fff6e5" />
            <path d="M-7 -16l5 5M-2 -16l-5 5M2 -16l5 5M7 -16l-5 5" stroke="#2a1b33" strokeWidth="2.4" fill="none" />
            <circle cx="-14" cy="-4" r="6" fill="#ffcf5c" />
          </g>
        </g>
        <g transform="translate(163 84)">
          <polygon points="0,-11 3,-3 11,0 3,3 0,11 -3,3 -11,0 -3,-3" fill="#ffcf5c" stroke="#2a1b33" strokeWidth="2" strokeLinejoin="round" />
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
          <line x1="90" y1="46" x2="110" y2="62" stroke="#b45309" />
          <line x1="110" y1="46" x2="90" y2="62" stroke="#b45309" />
          <circle cx="160" cy="90" r="11" fill="none" stroke="#451a03" />
          <line x1="210" y1="118" x2="230" y2="134" stroke="#b45309" />
          <line x1="230" y1="118" x2="210" y2="134" stroke="#b45309" />
        </g>
      </svg>
    ),
  },
  {
    id: 'battleship',
    title: 'Battleship · Kapal Tersembunyi',
    subtitle: 'Commit-reveal, lawan tidak bisa mengintip',
    description: 'Papan 8x8 dengan lima kapal. Susunan kapal tinggal di perangkat Anda, hanya hash-nya yang dikirim, lalu dibuktikan ulang setelah pertandingan selesai.',
    playerRange: '2 Pemain',
    statusLabel: 'Lokal & Online',
    route: '/battleship',
    routes: battleshipRoutes,
    thumbnail: (
      <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }} aria-hidden="true">
        <g stroke="rgba(30, 41, 59, 0.16)" strokeWidth="1">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <line key={`v${i}`} x1={72 + i * 22} y1="24" x2={72 + i * 22} y2="156" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <line key={`h${i}`} x1="72" y1={24 + i * 22} x2="258" y2={24 + i * 22} />
          ))}
        </g>
        <rect x="94" y="68" width="66" height="22" fill="#1e293b" opacity="0.85" />
        <rect x="182" y="112" width="44" height="22" fill="#1e293b" opacity="0.5" />
        <rect
          x="160"
          y="68"
          width="44"
          height="22"
          fill="none"
          stroke="rgba(28, 25, 23, 0.35)"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
        <circle cx="138" cy="79" r="9" fill="none" stroke="var(--gold)" strokeWidth="1.6" />
        <line x1="138" y1="66" x2="138" y2="92" stroke="var(--gold)" strokeWidth="1.2" />
        <line x1="125" y1="79" x2="151" y2="79" stroke="var(--gold)" strokeWidth="1.2" />
      </svg>
    ),
  },
];

export const allGameRoutes: RouteObject[] = GAMES_REGISTRY.flatMap((g) => g.routes);

