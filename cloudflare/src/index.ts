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

function corsFor(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const originHeader = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsFor(originHeader),
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({ ok: true, service: 'ij-game-rooms' }, { headers: corsFor(originHeader) });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,12})\/(ws|ticket)$/);
    if (!match) return new Response('not found', { status: 404, headers: corsFor(originHeader) });

    const code = match[1].toUpperCase();
    if (!ROOM_CODE.test(code)) return new Response('bad room code', { status: 400, headers: corsFor(originHeader) });

    if (!allowedOrigins(env, url.host)(originHeader)) {
      return new Response('forbidden origin', { status: 403, headers: corsFor(originHeader) });
    }

    if (match[2] === 'ws' && request.headers.get('Upgrade') !== 'websocket' && url.searchParams.get('probe') !== '1') {
      return new Response('expected websocket', { status: 426, headers: corsFor(originHeader) });
    }

    const id = env.ROOM.idFromName(code);
    // Dekatkan objek ke pemain; tanpa hint ini Cloudflare memilih colo dari sisi server.
    const stub = env.ROOM.get(id, { locationHint: 'apac' });
    const upstream = await stub.fetch(request);
    if (match[2] !== 'ticket' || !originHeader) return upstream;
    // Only the mint is called from a browser; the DO response needs the CORS headers added here
    // because the object answers plain JSON and does not know which origin asked.
    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsFor(originHeader))) headers.set(k, v);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
