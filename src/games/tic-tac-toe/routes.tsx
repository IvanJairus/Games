import { RouteObject } from 'react-router-dom';
import { TicTacToeLobby } from './pages/TicTacToeLobby';
import { TicTacToeLocal } from './pages/TicTacToeLocal';
import { TicTacToeMatch } from './pages/TicTacToeMatch';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

export const ticTacToeRoutes: RouteObject[] = [
  {
    path: 'tic-tac-toe',
    element: <TicTacToeLobby />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'tic-tac-toe/local',
    element: <TicTacToeLocal />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'tic-tac-toe/m/:code',
    element: <TicTacToeMatch />,
    errorElement: <RouteErrorBoundary />,
  },
];
