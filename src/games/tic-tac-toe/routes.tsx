import { RouteObject } from 'react-router-dom';
import { TicTacToeLocal } from './pages/TicTacToeLocal';
import { RouteErrorBoundary } from '../../components/ErrorBoundary';

export const ticTacToeRoutes: RouteObject[] = [
  {
    path: 'tic-tac-toe',
    element: <TicTacToeLocal />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: 'tic-tac-toe/local',
    element: <TicTacToeLocal />,
    errorElement: <RouteErrorBoundary />,
  },
];
