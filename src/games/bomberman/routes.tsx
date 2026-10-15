import React, { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router-dom';
import { RouteFallback } from '../../components/RouteFallback';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';
import './bomberman.css';

const BombermanLobby = lazy(() => import('./pages/BombermanLobby').then((m) => ({ default: m.BombermanLobby })));
const BombermanLocal = lazy(() => import('./pages/BombermanLocal').then((m) => ({ default: m.BombermanLocal })));
const BombermanMatch = lazy(() => import('./pages/BombermanMatch').then((m) => ({ default: m.BombermanMatch })));

const page = (node: React.ReactNode): React.ReactNode => (
  <Suspense fallback={<RouteFallback label="Memuat Bomberman" />}>{node}</Suspense>
);

export const bombermanRoutes: RouteObject[] = [
  {
    path: 'bomberman',
    element: page(<BombermanLobby />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'bomberman/local',
    element: page(<BombermanLocal />),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'bomberman/m/:code',
    element: page(<BombermanMatch />),
    errorElement: <RouteErrorBoundary />,
  },
];
