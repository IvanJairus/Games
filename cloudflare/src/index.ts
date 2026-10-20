import type { Env } from './types';

export { GameRoom } from './room';

const ROOM_CODE = /^[A-Z0-9]{4,12}$/;

function allowedOrigins(env: Env, host: string): (origin: string | null) => boolean {
  const list = new Set(env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean));
  return (origin) => {
    if (!origin) return false;
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      return false;
    }
    return list.has(origin);
  };
}

export default {
  fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return Promise.resolve(Response.json({ ok: true, service: 'ij-game-rooms' }));
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})\/ws$/);
    if (!match) return Promise.resolve(new Response('not found', { status: 404 }));

    const code = match[1].toUpperCase();
    if (!ROOM_CODE.test(code)) return Promise.resolve(new Response('bad room code', { status: 400 }));

    if (!allowedOrigins(env, url.host)(request.headers.get('Origin'))) {
      return Promise.resolve(new Response('forbidden origin', { status: 403 }));
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Promise.resolve(new Response('expected websocket', { status: 426 }));
    }

    const id = env.ROOM.idFromName(code);
    // Dekatkan objek ke pemain; tanpa hint ini Cloudflare memilih colo dari sisi server.
    const stub = env.ROOM.get(id, { locationHint: 'apac' });
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
