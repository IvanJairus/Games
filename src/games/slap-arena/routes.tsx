import { Suspense, lazy, type ReactNode } from 'react';
import { RouteObject } from 'react-router-dom';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';
import './slap-arena.css';

// three.js and the character GLBs are only worth downloading once somebody
// actually opens the arena, so the routes stay out of the hub bundle.
const SlapArenaLobby = lazy(() => import('./pages/SlapArenaLobby').then((m) => ({ default: m.SlapArenaLobby })));
const SlapArenaMatch = lazy(() => import('./pages/SlapArenaMatch').then((m) => ({ default: m.SlapArenaMatch })));

function Boot({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="sa-boot" role="status" data-testid="slap-boot">Memuat arena...</div>}>{children}</Suspense>;
}

export const slapArenaRoutes: RouteObject[] = [
  {
    path: 'slap-arena',
    element: (
      <Boot>
        <SlapArenaLobby />
      </Boot>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'slap-arena/solo',
    element: (
      <Boot>
        <SlapArenaMatch />
      </Boot>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'slap-arena/m/:code',
    element: (
      <Boot>
        <SlapArenaMatch />
      </Boot>
    ),
    errorElement: <RouteErrorBoundary />,
  },
];
