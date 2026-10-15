import { getSupabase, getPlayerSessionId } from '../../lib/supabase';
import { randomBytes } from '../../lib/random';
import { RealtimeChannel } from '@supabase/supabase-js';

export type GameType = 'wall-game' | 'tic-tac-toe' | 'battleship' | 'slap-arena' | 'bomberman';

export type MatchStatus = 'waiting' | 'playing' | 'completed' | 'abandoned';

export interface MatchRow {
  id: string;
  room_code: string;
  game_type: GameType;
  status: MatchStatus;
  max_players: number;
  current_turn: number;
  game_state: any;
  winner_index: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerRow {
  id: string;
  match_id: string;
  player_index: number;
  session_id: string;
  name: string;
  is_host: boolean;
  connected: boolean;
  created_at: string;
}

export interface MatchSyncData {
  match: MatchRow;
  players: PlayerRow[];
  myPlayerIndex: number;
  isHost: boolean;
}

type MatchWithPlayers = MatchRow & { match_players?: PlayerRow[] | null };

export type MoveFailure = 'turn' | 'stale' | 'network' | 'unconfigured';

export interface MoveResult {
  ok: boolean;
  failure?: MoveFailure;
  message?: string;
}

export interface MatchSubscription {
  unsubscribe: () => void;
  channel: RealtimeChannel | null;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// A room code is the only thing standing between an anon key and somebody else's match.
export const generateRoomCode = (): string => {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
};

const normCode = (code: string): string => code.trim().toUpperCase();

const toMatchRow = (row: MatchWithPlayers): MatchRow => ({
  id: row.id,
  room_code: row.room_code,
  game_type: row.game_type,
  status: row.status,
  max_players: row.max_players,
  current_turn: row.current_turn,
  game_state: row.game_state,
  winner_index: row.winner_index,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// One round trip: PostgREST embeds the roster through the match_players.match_id foreign key.
async function fetchRoom(roomCode: string): Promise<MatchSyncData | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('matches')
    .select('*, match_players(*)')
    .eq('room_code', normCode(roomCode))
    .single();

  if (error || !data) return null;

  const row = data as MatchWithPlayers;
  const players = [...(row.match_players || [])].sort((a, b) => a.player_index - b.player_index);
  const me = players.find((p) => p.session_id === getPlayerSessionId());

  return {
    match: toMatchRow(row),
    players,
    myPlayerIndex: me ? me.player_index : -1,
    isHost: me ? me.is_host : false,
  };
}

export async function createOnlineRoom(params: {
  gameType: GameType;
  maxPlayers: number;
  hostName: string;
  initialState: any;
}): Promise<{ roomCode: string; matchId: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase belum terkonfigurasi');

  const sessionId = getPlayerSessionId();
  const roomCode = generateRoomCode();

  const { data: matchData, error: matchError } = await supabase
    .from('matches')
    .insert({
      room_code: roomCode,
      game_type: params.gameType,
      status: 'waiting',
      max_players: params.maxPlayers,
      current_turn: 0,
      game_state: params.initialState,
      winner_index: null,
    })
    .select()
    .single();

  if (matchError || !matchData) {
    throw new Error(matchError?.message || 'Gagal membuat room');
  }

  const { error: playerError } = await supabase.from('match_players').insert({
    match_id: matchData.id,
    player_index: 0,
    session_id: sessionId,
    name: params.hostName || 'Host',
    is_host: true,
    connected: true,
  });

  if (playerError) {
    throw new Error(playerError.message || 'Gagal mendaftarkan host');
  }

  return { roomCode, matchId: matchData.id };
}

export async function joinOnlineRoom(params: {
  roomCode: string;
  playerName: string;
  startWhenFull?: boolean;
}): Promise<{ matchId: string; playerIndex: number; isHost: boolean }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase belum terkonfigurasi');

  const sessionId = getPlayerSessionId();
  const current = await fetchRoom(params.roomCode);

  if (!current) {
    throw new Error('Room tidak ditemukan. Pastikan kode room benar.');
  }

  const { match, players } = current;

  const existingPlayer = players.find((p) => p.session_id === sessionId);
  if (existingPlayer) {
    return {
      matchId: match.id,
      playerIndex: existingPlayer.player_index,
      isHost: existingPlayer.is_host,
    };
  }

  if (players.length >= match.max_players) {
    throw new Error('Room sudah penuh');
  }

  if (match.status !== 'waiting') {
    throw new Error('Permainan di room ini sudah berlangsung');
  }

  const takenIndices = new Set(players.map((p) => p.player_index));
  let nextIndex = 0;
  while (takenIndices.has(nextIndex)) {
    nextIndex++;
  }

  const insertSeat = (index: number, asHost: boolean) =>
    supabase.from('match_players').insert({
      match_id: match.id,
      player_index: index,
      session_id: sessionId,
      name: params.playerName || `Pemain ${index + 1}`,
      is_host: asHost,
      connected: true,
    });

  const { error: insertErr } = await insertSeat(nextIndex, nextIndex === 0);

  if (insertErr) {
    const latest = await fetchRoom(params.roomCode);
    const me = latest?.players.find((p) => p.session_id === sessionId);

    if (me) {
      return { matchId: match.id, playerIndex: me.player_index, isHost: me.is_host };
    }

    if (insertErr.code === '23505' && latest) {
      const occupied = new Set(latest.players.map((p) => p.player_index));
      let retryIdx = 0;
      while (occupied.has(retryIdx)) retryIdx++;

      if (retryIdx < match.max_players) {
        const { error: retryErr } = await insertSeat(retryIdx, false);
        if (!retryErr) {
          return { matchId: match.id, playerIndex: retryIdx, isHost: false };
        }
      }
    }

    throw new Error('Gagal bergabung ke room. Room mungkin sudah penuh atau sedang diproses.');
  }

  // Two joiners can each count the room as one seat short, so the start needs its own row guard.
  if (params.startWhenFull && players.length + 1 >= match.max_players) {
    await supabase
      .from('matches')
      .update({ status: 'playing', updated_at: new Date().toISOString() })
      .eq('id', match.id)
      .eq('status', 'waiting');
  }

  return { matchId: match.id, playerIndex: nextIndex, isHost: nextIndex === 0 };
}

export async function submitOnlineMove(params: {
  matchId: string;
  playerIndex: number;
  action: string;
  nextState: any;
  nextTurn: number;
  winnerIndex?: number | null;
  newStatus?: 'playing' | 'completed';
  moveSummary?: Record<string, unknown>;
  expectTurn?: boolean;
  statusGuard?: MatchStatus;
  basedOn?: string;
}): Promise<MoveResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, failure: 'unconfigured' };

  const updates: Partial<MatchRow> = {
    game_state: params.nextState,
    current_turn: params.nextTurn,
    updated_at: new Date().toISOString(),
  };

  if (params.winnerIndex !== undefined) {
    updates.winner_index = params.winnerIndex;
  }
  if (params.newStatus) {
    updates.status = params.newStatus;
  }

  // Postgres re-checks these predicates under a row lock, so two players firing at the same
  // moment cannot both land. The loser gets zero rows back instead of overwriting the win.
  let query = supabase.from('matches').update(updates).eq('id', params.matchId);
  if (params.expectTurn !== false) {
    query = query.eq('current_turn', params.playerIndex);
  }
  if (params.statusGuard) {
    query = query.eq('status', params.statusGuard);
  }
  // The turn predicate alone is not enough: after player A moves, the row legitimately belongs to
  // player B, so B's stale board would still pass. updated_at is the token tying a move to the
  // exact row version it was computed from.
  if (params.basedOn) {
    query = query.eq('updated_at', params.basedOn);
  }

  const { data, error } = await query.select('id');

  if (error) {
    return { ok: false, failure: 'network', message: error.message };
  }

  if (!data || data.length === 0) {
    const { data: current } = await supabase
      .from('matches')
      .select('current_turn, status, updated_at')
      .eq('id', params.matchId)
      .single();

    if (!current) {
      return { ok: false, failure: 'network', message: 'Room tidak ditemukan' };
    }
    if (params.basedOn && current.updated_at !== params.basedOn) {
      return { ok: false, failure: 'stale' };
    }
    if (params.statusGuard && current.status !== params.statusGuard) {
      return { ok: false, failure: 'turn', message: `Status room sudah berubah menjadi ${current.status}` };
    }
    if (params.expectTurn !== false && current.current_turn !== params.playerIndex) {
      return { ok: false, failure: 'turn' };
    }
    return { ok: false, failure: 'network', message: 'Langkah tidak diterima server' };
  }

  const { error: logError } = await supabase.from('match_moves').insert({
    match_id: params.matchId,
    player_index: params.playerIndex,
    action: params.action,
    payload: params.moveSummary ?? params.nextState,
  });

  return {
    ok: true,
    message: logError
      ? `Langkah tersimpan, log langkah gagal ditulis: ${logError.message}`
      : undefined,
  };
}

export const describeMoveFailure = (result: MoveResult): string => {
  if (result.ok) return '';
  if (result.failure === 'turn') {
    return 'Langkah tidak diterima karena giliran sudah berpindah. Papan disesuaikan otomatis.';
  }
  if (result.failure === 'stale') {
    return 'Papan sudah berubah sebelum langkah Anda tercatat. Papan disinkronkan ulang, coba lagi.';
  }
  if (result.failure === 'unconfigured') {
    return 'Koneksi multiplayer online (Supabase) belum terkonfigurasi.';
  }
  return result.message || 'Langkah gagal dikirim. Periksa koneksi lalu coba lagi.';
};

export async function startOnlineMatch(
  matchId: string,
  initialState?: any,
  allowedFrom: MatchStatus[] = ['waiting']
): Promise<MoveResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, failure: 'unconfigured' };

  const updates: Record<string, unknown> = {
    status: 'playing',
    current_turn: 0,
    winner_index: null,
    updated_at: new Date().toISOString(),
  };
  if (initialState) {
    updates.game_state = initialState;
  }

  let query = supabase.from('matches').update(updates).eq('id', matchId);
  query =
    allowedFrom.length === 1
      ? query.eq('status', allowedFrom[0])
      : query.in('status', allowedFrom);

  const { data, error } = await query.select('id');

  if (error) return { ok: false, failure: 'network', message: error.message };
  if (!data || data.length === 0) {
    return { ok: false, failure: 'network', message: 'Room tidak dapat dimulai dari statusnya sekarang' };
  }

  return { ok: true };
}

/**
 * Mark a finished match. The client writes only the room's own state; the history
 * row that the hub counts is inserted by a database trigger on this transition, so
 * no client can inflate or erase it. Replaying a match goes through
 * `startOnlineMatch(id, undefined, ['completed'])`.
 */
export async function finishOnlineMatch(params: {
  matchId: string;
  winnerIndex: number | null;
}): Promise<MoveResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, failure: 'unconfigured' };

  const { data, error } = await supabase
    .from('matches')
    .update({
      status: 'completed',
      winner_index: params.winnerIndex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.matchId)
    .eq('status', 'playing')
    .select('id');

  if (error) return { ok: false, failure: 'network', message: error.message };
  if (!data || data.length === 0) {
    return { ok: false, failure: 'stale', message: 'Pertandingan sudah tercatat selesai' };
  }

  return { ok: true };
}

export async function leaveOnlineMatch(params: {
  matchId: string;
  roomCode: string;
  playerIndex: number;
  playerName: string;
  channel?: RealtimeChannel | null;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const sessionId = getPlayerSessionId();

  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', params.matchId)
    .single();

  if (!match) return;

  await supabase
    .from('match_players')
    .delete()
    .eq('match_id', params.matchId)
    .eq('session_id', sessionId);

  if (match.status === 'playing') {
    const remainingWinner = match.max_players === 2 ? (params.playerIndex === 0 ? 1 : 0) : null;
    await supabase
      .from('matches')
      .update({
        status: 'abandoned',
        winner_index: remainingWinner,
        game_state: {
          ...(match.game_state || {}),
          abandonedBy: params.playerName,
          abandonedReason: `${params.playerName} telah keluar dari pertandingan`,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId);
  } else if (match.status === 'completed' || match.status === 'waiting') {
    await supabase
      .from('matches')
      .update({
        status: 'abandoned',
        game_state: {
          ...(match.game_state || {}),
          abandonedBy: params.playerName,
          abandonedReason: `${params.playerName} telah meninggalkan room dan kembali ke lobby`,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId);
  }

  const reusing = Boolean(params.channel);
  const channel = reusing
    ? (params.channel as RealtimeChannel)
    : supabase.channel(`room:${params.roomCode}`);

  try {
    if (!reusing) await channel.subscribe();
    channel.send({
      type: 'broadcast',
      event: 'player_left',
      payload: {
        playerIndex: params.playerIndex,
        playerName: params.playerName,
      },
    });
  } finally {
    // A throwaway channel that is never removed keeps accumulating across re-joins.
    if (!reusing) await supabase.removeChannel(channel);
  }
}

export interface MatchSubscriptionExtras {
  /**
   * Extra broadcast events to bind. They must be registered before subscribe():
   * postgres_changes filters are sent to the server at join time, and keeping every
   * binding in one place avoids games silently missing events after the channel opens.
   */
  broadcast?: Record<string, (payload: any) => void>;
  /** Presence metadata tracked on join, so a closed tab is noticed without a goodbye message. */
  presence?: { onChange?: () => void };
  /** Called with the channel join status so callers know when track()/send() are safe. */
  onStatus?: (status: string) => void;
}

export function subscribeToMatch(
  roomCode: string,
  onSync: (sync: MatchSyncData) => void,
  onBroadcastMove?: (payload: any) => void,
  onBroadcastLeave?: (payload: any) => void,
  onConnectionChange?: (state: 'realtime' | 'fallback') => void,
  extras?: MatchSubscriptionExtras
): MatchSubscription {
  const supabase = getSupabase();
  if (!supabase) {
    return { unsubscribe: () => {}, channel: null };
  }

  const code = normCode(roomCode);
  let closed = false;
  let realtimeUp = false;
  let inFlight = false;
  let again = false;
  let rosterChannel: RealtimeChannel | null = null;
  let watchedMatchId = '';

  const sync = async (): Promise<void> => {
    if (closed) return;

    // One move lands through broadcast and postgres_changes in the same tick.
    if (inFlight) {
      again = true;
      return;
    }

    inFlight = true;
    try {
      const data = await fetchRoom(code);
      if (data && !closed) {
        onSync(data);
        watchRoster(data.match.id);
      }
    } finally {
      inFlight = false;
      if (again && !closed) {
        again = false;
        void sync();
      }
    }
  };

  const watchRoster = (matchId: string) => {
    if (closed || watchedMatchId === matchId) return;
    watchedMatchId = matchId;
    rosterChannel = supabase.channel(`room:${code}:roster`);
    rosterChannel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_players',
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          void sync();
        }
      )
      .subscribe();
  };

  const channel = supabase.channel(`room:${code}`, {
    config: { broadcast: { self: false } },
  });

  for (const [event, handler] of Object.entries(extras?.broadcast ?? {})) {
    channel.on('broadcast', { event }, (msg: { payload: unknown }) => handler(msg.payload));
  }

  if (extras?.presence) {
    channel.on('presence', { event: 'sync' }, () => extras.presence?.onChange?.());
  }

  channel
    .on('broadcast', { event: 'game_move' }, (event) => {
      if (closed) return;
      if (onBroadcastMove) {
        onBroadcastMove(event.payload);
      }
      void sync();
    })
    .on('broadcast', { event: 'player_left' }, (event) => {
      if (closed) return;
      if (onBroadcastLeave) {
        onBroadcastLeave(event.payload);
      }
      void sync();
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `room_code=eq.${code}`,
      },
      () => {
        void sync();
      }
    )
    .subscribe((status) => {
      realtimeUp = status === 'SUBSCRIBED';
      if (!closed) {
        onConnectionChange?.(realtimeUp ? 'realtime' : 'fallback');
        extras?.onStatus?.(status);
      }
    });

  void sync();

  const onVisible = () => {
    if (!document.hidden) void sync();
  };
  document.addEventListener('visibilitychange', onVisible);

  // Fallback only: realtime carries the state while it is up and the tab is in front.
  const intervalId = setInterval(() => {
    if (closed || realtimeUp || document.hidden) return;
    void sync();
  }, 5000);

  return {
    channel,
    unsubscribe: () => {
      closed = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      if (rosterChannel) void supabase.removeChannel(rosterChannel);
      void supabase.removeChannel(channel);
    },
  };
}
