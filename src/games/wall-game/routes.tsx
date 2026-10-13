import { RouteObject, Navigate } from 'react-router-dom';
import { WallgameLobby } from './pages/WallgameLobby';
import { WallgameLocal } from './pages/WallgameLocal';
import { WallgameMatch } from './pages/WallgameMatch';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

export const wallGameRoutes: RouteObject[] = [
  {
    path: 'wall-game',
    element: <WallgameLobby />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'wall-game/local',
    element: <WallgameLocal />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'wall-game/m/:code',
    element: <WallgameMatch />,
    errorElement: <RouteErrorBoundary />,
  },
  // Backward compatibility redirects for legacy /wallgame routes
  {
    path: 'wallgame',
    element: <Navigate to="/wall-game" replace />,
  },
  {
    path: 'wallgame/local',
    element: <Navigate to="/wall-game/local" replace />,
  },
  {
    path: 'wallgame/m/:code',
    element: <WallgameMatch />,
    errorElement: <RouteErrorBoundary />,
  },
];
