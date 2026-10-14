import React, { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';
import { RouteFallback } from '../../components/RouteFallback';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

const TicTacToeLobby = lazy(() => import('./pages/TicTacToeLobby').then((m) => ({ default: m.TicTacToeLobby })));
const TicTacToeLocal = lazy(() => import('./pages/TicTacToeLocal').then((m) => ({ default: m.TicTacToeLocal })));
const TicTacToeMatch = lazy(() => import('./pages/TicTacToeMatch').then((m) => ({ default: m.TicTacToeMatch })));

const page = (node: React.ReactNode): React.ReactNode => (
  <Suspense fallback={<RouteFallback label="Memuat Tic Tac Toe" />}>{node}</Suspense>
);

export const ticTacToeRoutes: RouteObject[] = [
  {
    path: 'tic-tac-toe',
    element: page(<TicTacToeLobby />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'tic-tac-toe/local',
    element: page(<TicTacToeLocal />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'tic-tac-toe/m/:code',
    element: page(<TicTacToeMatch />),
    errorElement: <RouteErrorBoundary />,
  },
];
