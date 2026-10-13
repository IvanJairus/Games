import React from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { Hub } from './pages/Hub';
import { NotFound } from './pages/NotFound';
import { wallgameRoutes } from './games/wallgame/routes';

const Layout: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer
        style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          borderTop: '1px solid var(--border-color)',
          marginTop: '40px',
        }}
      >
        <p>© {new Date().getFullYear()} Ivan Jairus. Powered by ij-gateway.</p>
      </footer>
    </div>
  );
};

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          index: true,
          element: <Hub />,
        },
        ...wallgameRoutes,
        {
          path: '*',
          element: <NotFound />,
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
  }
);

export const App: React.FC = () => {
  return <RouterProvider router={router} />;
};
