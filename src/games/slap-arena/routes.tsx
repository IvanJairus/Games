import { RouteObject } from 'react-router-dom';
import { SlapArenaLobby } from './pages/SlapArenaLobby';
import { SlapArenaMatch } from './pages/SlapArenaMatch';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

export const slapArenaRoutes: RouteObject[] = [
  {
    path: 'slap-arena',
    element: <SlapArenaLobby />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'slap-arena/solo',
    element: <SlapArenaMatch />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'slap-arena/m/:code',
    element: <SlapArenaMatch />,
    errorElement: <RouteErrorBoundary />,
  },
];
