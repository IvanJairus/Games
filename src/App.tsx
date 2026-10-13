import React from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Hub } from './pages/Hub';
import { NotFound } from './pages/NotFound';
import { allGameRoutes } from './games/registry';
import { RouteErrorBoundary } from './components/ErrorBoundary';

const Layout: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer
        style={{
          borderTop: '1px solid var(--line)',
          marginTop: '44px',
          padding: '20px clamp(20px, 4.6vw, 46px)',
          font: '11px/1.8 var(--mono)',
          color: 'var(--ink-faint)',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span>ivanjairus.xyz/games/</span>
        <span>·</span>
        <span>papan strategi taktis · game hub lokal & online</span>
        <span>·</span>
        <span>dilayani oleh ij-gateway</span>
      </footer>
      <Analytics />
      <SpeedInsights />
    </div>
  );
};

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          index: true,
          element: <Hub />,
        },
        ...allGameRoutes,
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
