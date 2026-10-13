import { RouteObject } from 'react-router-dom';
import { WallgameLobby } from './WallgameLobby';
import { WallgameLocal } from './WallgameLocal';
import { WallgameMatch } from './WallgameMatch';

export const wallgameRoutes: RouteObject[] = [
  {
    path: 'wallgame',
    element: <WallgameLobby />,
  },
  {
    path: 'wallgame/local',
    element: <WallgameLocal />,
  },
  {
    path: 'wallgame/m/:code',
    element: <WallgameMatch />,
  },
];
