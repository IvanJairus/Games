import React, { lazy, Suspense } from 'react';
import { RouteObject, Navigate } from 'react-router-dom';
import { RouteFallback } from '../../components/RouteFallback';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

export const loadWallgameLobby = () => import('./pages/WallgameLobby');

const WallgameLobby = lazy(() => loadWallgameLobby().then((m) => ({ default: m.WallgameLobby })));
const WallgameLocal = lazy(() => import('./pages/WallgameLocal').then((m) => ({ default: m.WallgameLocal })));
const WallgameMatch = lazy(() => import('./pages/WallgameMatch').then((m) => ({ default: m.WallgameMatch })));

const page = (node: React.ReactNode): React.ReactNode => (
  <Suspense fallback={<RouteFallback label="Memuat WallGo" />}>{node}</Suspense>
);

export const wallGameRoutes: RouteObject[] = [
  {
    path: 'wall-game',
    element: page(<WallgameLobby />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'wall-game/local',
    element: page(<WallgameLocal />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'wall-game/m/:code',
    element: page(<WallgameMatch />),
    errorElement: <RouteErrorBoundary />,
  },
  // Legacy /wallgame URLs from before the route rename still circulate in shared links.
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
    element: page(<WallgameMatch />),
    errorElement: <RouteErrorBoundary />,
  },
];
