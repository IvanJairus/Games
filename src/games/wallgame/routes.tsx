import { RouteObject } from 'react-router-dom';
import { WallgameLobby } from './WallgameLobby';
import { WallgameLocal } from './WallgameLocal';
import { WallgameMatch } from './WallgameMatch';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

export const wallgameRoutes: RouteObject[] = [
  {
    path: 'wallgame',
    element: <WallgameLobby />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'wallgame/local',
    element: <WallgameLocal />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'wallgame/m/:code',
    element: <WallgameMatch />,
    errorElement: <RouteErrorBoundary />,
  },
];
