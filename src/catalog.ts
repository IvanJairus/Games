export interface GameEntry {
  id: string;
  title: string;
  summary: string;
  route: string;
  badge?: string;
  minPlayers: number;
  maxPlayers: number;
  iconName: string;
}

export const GAMES_CATALOG: GameEntry[] = [
  {
    id: 'wallgame',
    title: 'WallGo',
    summary: 'Turn-based territory wall game for 2-6 players with dynamic board scaling.',
    route: '/wallgame/',
    badge: 'Popular',
    minPlayers: 2,
    maxPlayers: 6,
    iconName: 'Shield',
  },
];
