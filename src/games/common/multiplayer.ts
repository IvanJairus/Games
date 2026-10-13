import { getSupabase, getPlayerSessionId } from '../../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface MatchRow {
  id: string;
  room_code: string;
  game_type: 'wall-game' | 'tic-tac-toe';
  status: 'waiting' | 'playing' | 'completed' | 'abandoned';
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

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const generateRoomCode = (): string => {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
};

export async function createOnlineRoom(params: {
  gameType: 'wall-game' | 'tic-tac-toe';
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
}): Promise<{ matchId: string; playerIndex: number; isHost: boolean }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase belum terkonfigurasi');

  const sessionId = getPlayerSessionId();
  const code = params.roomCode.trim().toUpperCase();

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('*')
    .eq('room_code', code)
    .single();

  if (matchErr || !match) {
    throw new Error('Room tidak ditemukan. Pastikan kode room benar.');
  }

  const { data: players, error: playersErr } = await supabase
    .from('match_players')
    .select('*')
    .eq('match_id', match.id)
    .order('player_index', { ascending: true });

  if (playersErr) throw new Error(playersErr.message);

  const existingPlayer = players?.find((p) => p.session_id === sessionId);
  if (existingPlayer) {
    return {
      matchId: match.id,
      playerIndex: existingPlayer.player_index,
      isHost: existingPlayer.is_host,
    };
  }

  if (players && players.length >= match.max_players) {
    throw new Error('Room sudah penuh');
  }

  if (match.status !== 'waiting') {
    throw new Error('Permainan di room ini sudah berlangsung');
  }

  const takenIndices = new Set(players?.map((p) => p.player_index) || []);
  let nextIndex = 0;
  while (takenIndices.has(nextIndex)) {
    nextIndex++;
  }

  const isHost = nextIndex === 0;
  const { error: insertErr } = await supabase.from('match_players').insert({
    match_id: match.id,
    player_index: nextIndex,
    session_id: sessionId,
    name: params.playerName || `Pemain ${nextIndex + 1}`,
    is_host: isHost,
    connected: true,
  });

  if (insertErr) throw new Error(insertErr.message);

  // Auto-start for 2-player games if second player joins
  if (match.game_type === 'tic-tac-toe' && (players?.length || 0) + 1 >= match.max_players) {
    await supabase
      .from('matches')
      .update({ status: 'playing', updated_at: new Date().toISOString() })
      .eq('id', match.id);
  }

  return { matchId: match.id, playerIndex: nextIndex, isHost };
}

export async function submitOnlineMove(params: {
  matchId: string;
  playerIndex: number;
  action: string;
  nextState: any;
  nextTurn: number;
  winnerIndex?: number | null;
  newStatus?: 'playing' | 'completed';
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

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

  await Promise.all([
    supabase.from('matches').update(updates).eq('id', params.matchId),
    supabase.from('match_moves').insert({
      match_id: params.matchId,
      player_index: params.playerIndex,
      action: params.action,
      payload: params.nextState,
    }),
  ]);
}

export async function startOnlineMatch(matchId: string, initialState?: any): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const updates: any = {
    status: 'playing',
    current_turn: 0,
    updated_at: new Date().toISOString(),
  };
  if (initialState) {
    updates.game_state = initialState;
  }

  await supabase.from('matches').update(updates).eq('id', matchId);
}

export async function leaveOnlineMatch(params: {
  matchId: string;
  roomCode: string;
  playerIndex: number;
  playerName: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const sessionId = getPlayerSessionId();

  // Fetch current match to decide outcome
  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', params.matchId)
    .single();

  if (!match) return;

  // Remove player from roster
  await supabase
    .from('match_players')
    .delete()
    .eq('match_id', params.matchId)
    .eq('session_id', sessionId);

  // If match was active, award forfeit win to remaining player or mark abandoned
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
  } else if (match.status === 'waiting' && params.playerIndex === 0) {
    await supabase
      .from('matches')
      .update({
        status: 'abandoned',
        game_state: {
          ...(match.game_state || {}),
          abandonedReason: 'Host telah menutup room ini',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.matchId);
  }

  // Broadcast leave event
  const channel = supabase.channel(`room:${params.roomCode}`);
  channel.send({
    type: 'broadcast',
    event: 'player_left',
    payload: {
      playerIndex: params.playerIndex,
      playerName: params.playerName,
    },
  });
}

export function subscribeToMatch(
  roomCode: string,
  onSync: (sync: MatchSyncData) => void,
  onBroadcastMove?: (payload: any) => void,
  onBroadcastLeave?: (payload: any) => void
): { unsubscribe: () => void; channel: RealtimeChannel | null } {
  const supabase = getSupabase();
  if (!supabase) {
    return { unsubscribe: () => {}, channel: null };
  }

  const sessionId = getPlayerSessionId();
  const code = roomCode.trim().toUpperCase();

  const fetchFullState = async () => {
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('room_code', code)
      .single();

    if (!match) return;

    const { data: players } = await supabase
      .from('match_players')
      .select('*')
      .eq('match_id', match.id)
      .order('player_index', { ascending: true });

    const playerList = (players || []) as PlayerRow[];
    const me = playerList.find((p) => p.session_id === sessionId);

    onSync({
      match: match as MatchRow,
      players: playerList,
      myPlayerIndex: me ? me.player_index : -1,
      isHost: me ? me.is_host : false,
    });
  };

  fetchFullState();

  const channel = supabase.channel(`room:${code}`, {
    config: { broadcast: { self: false } },
  });

  channel
    .on('broadcast', { event: 'game_move' }, (event) => {
      if (onBroadcastMove) {
        onBroadcastMove(event.payload);
      }
      fetchFullState();
    })
    .on('broadcast', { event: 'player_left' }, (event) => {
      if (onBroadcastLeave) {
        onBroadcastLeave(event.payload);
      }
      fetchFullState();
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
        fetchFullState();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'match_players',
      },
      () => {
        fetchFullState();
      }
    )
    .subscribe();

  const intervalId = setInterval(fetchFullState, 3000);

  return {
    unsubscribe: () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    },
    channel,
  };
}
