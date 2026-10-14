import React, { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';
import { RouteFallback } from '../../components/RouteFallback';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

const BattleshipLobby = lazy(() =>
  import('./pages/BattleshipLobby').then((m) => ({ default: m.BattleshipLobby }))
);
const BattleshipLocal = lazy(() =>
  import('./pages/BattleshipLocal').then((m) => ({ default: m.BattleshipLocal }))
);
const BattleshipMatch = lazy(() =>
  import('./pages/BattleshipMatch').then((m) => ({ default: m.BattleshipMatch }))
);

const page = (node: React.ReactNode): React.ReactNode => (
  <Suspense fallback={<RouteFallback label="Memuat Battleship" />}>{node}</Suspense>
);

export const battleshipRoutes: RouteObject[] = [
  {
    path: 'battleship',
    element: page(<BattleshipLobby />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'battleship/local',
    element: page(<BattleshipLocal />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'battleship/m/:code',
    element: page(<BattleshipMatch />),
    errorElement: <RouteErrorBoundary />,
  },
];
