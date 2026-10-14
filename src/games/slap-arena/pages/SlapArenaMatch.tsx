import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Arena3D } from '../components/Arena3D';
import { VirtualJoystick } from '../components/VirtualJoystick';
import { PlayerState, ArenaState } from '../engine/types';
import {
  SLAP_COOLDOWN,
  DASH_COOLDOWN,
  updatePlayerMovement,
  resolvePlayerCollisions,
  executeSlap,
  executeDash,
  spawnPlayersInCircle,
  createInitialArena,
} from '../engine/physics';
import { computeBotAi } from '../engine/botAi';
import {
  playSlapSound,
  playKnockbackSound,
  playDashSound,
  playFallSound,
  playRoundWinSound,
} from '../engine/audio';
import { getSupabase, getPlayerSessionId, getStoredPlayerName } from '../../../lib/supabase';
import { subscribeToMatch, leaveOnlineMatch, MatchSyncData } from '../../common/multiplayer';

const BOT_CONFIGS = [
  { name: 'Brawler Bob', color: '#ef4444' },
  { name: 'Speedy Sam', color: '#10b981' },
  { name: 'Sneaky Sue', color: '#8b5cf6' },
];

export const SlapArenaMatch: React.FC = () => {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const isSolo = !code;

  const localPlayerId = useRef(getPlayerSessionId()).current;
  const localPlayerName = useRef(getStoredPlayerName() || 'Brawler').current;
  const localPlayerColor = useRef(localStorage.getItem('slap_player_color') || '#3b82f6').current;

  // Local Game State
  const [arenaState, setArenaState] = useState<ArenaState>(() => {
    const arena = createInitialArena(code || 'solo', 3);
    if (isSolo) {
      // Setup solo player + 3 bots
      arena.players[localPlayerId] = {
        id: localPlayerId,
        name: localPlayerName,
        color: localPlayerColor,
        isHost: true,
        isBot: false,
        x: 0,
        z: 5,
        vx: 0,
        vz: 0,
        angle: -Math.PI / 2,
        isSlapping: false,
        slapCooldown: 0,
        dashCooldown: 0,
        isDashing: false,
        dashTimer: 0,
        isHit: false,
        hitTimer: 0,
        isFalling: false,
        fallY: 0,
        score: 0,
        eliminated: false,
      };

      BOT_CONFIGS.forEach((bot, idx) => {
        const botId = `bot_${idx + 1}`;
        arena.players[botId] = {
          id: botId,
          name: bot.name,
          color: bot.color,
          isHost: false,
          isBot: true,
          x: 0,
          z: -5,
          vx: 0,
          vz: 0,
          angle: Math.PI / 2,
          isSlapping: false,
          slapCooldown: 0,
          dashCooldown: 0,
          isDashing: false,
          dashTimer: 0,
          isHit: false,
          hitTimer: 0,
          isFalling: false,
          fallY: 0,
          score: 0,
          eliminated: false,
        };
      });

      spawnPlayersInCircle(arena.players);
      arena.phase = 'BATTLE';
    }
    return arena;
  });

  const arenaRef = useRef<ArenaState>(arenaState);
  arenaRef.current = arenaState;

  // Input states
  const inputVector = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const keyboardKeys = useRef<Record<string, boolean>>({});

  // Multiplayer info
  const [isHost, setIsHost] = useState(isSolo);
  const [multiplayerMatchId, setMultiplayerMatchId] = useState<string | null>(null);
  const [opponentLeftReason, setOpponentLeftReason] = useState<string | null>(null);
  const [canProceedNextRound, setCanProceedNextRound] = useState(true);
  const channelRef = useRef<any>(null);

  // 1. Keyboard Controls Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keyboardKeys.current[e.key.toLowerCase()] = true;

      if (e.code === 'Space') {
        e.preventDefault();
        triggerLocalSlap();
      }
      if (e.key === 'Shift') {
        e.preventDefault();
        triggerLocalDash();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keyboardKeys.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // 2. Action Triggers
  const triggerLocalSlap = useCallback(() => {
    const local = arenaRef.current.players[localPlayerId];
    if (!local || local.slapCooldown > 0 || local.isFalling || local.eliminated) return;

    const allPlayersList = Object.values(arenaRef.current.players) as PlayerState[];
    const hits = executeSlap(local, allPlayersList);

    playSlapSound();
    if (hits.length > 0) {
      playKnockbackSound();
    }

    if (!isSolo && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'player_slap',
        payload: {
          playerId: local.id,
          x: local.x,
          z: local.z,
          angle: local.angle,
        },
      });
    }
  }, [isSolo, localPlayerId]);

  const triggerLocalDash = useCallback(() => {
    const local = arenaRef.current.players[localPlayerId];
    if (!local || local.dashCooldown > 0 || local.isFalling || local.eliminated) return;

    const success = executeDash(local);
    if (success) {
      playDashSound();

      if (!isSolo && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'player_dash',
          payload: {
            playerId: local.id,
          },
        });
      }
    }
  }, [isSolo, localPlayerId]);

  // 3. Multiplayer Realtime Channel Subscription
  useEffect(() => {
    if (isSolo || !code) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const { unsubscribe, channel } = subscribeToMatch(
      code,
      (sync: MatchSyncData) => {
        setIsHost(sync.isHost);
        setMultiplayerMatchId(sync.match.id);

        // Check if room was abandoned by opponent
        if (sync.match.status === 'abandoned') {
          const reason = sync.match.game_state?.abandonedReason || 'Lawan telah meninggalkan room';
          setOpponentLeftReason(reason);
          setCanProceedNextRound(false);
          return;
        }

        // Synchronize players roster
        const currentPlayers: Record<string, PlayerState> = { ...arenaRef.current.players };
        sync.players.forEach((p) => {
          if (!currentPlayers[p.session_id]) {
            currentPlayers[p.session_id] = {
              id: p.session_id,
              name: p.name,
              color: p.is_host ? '#3b82f6' : '#ef4444',
              isHost: p.is_host,
              isBot: false,
              x: 0,
              z: 0,
              vx: 0,
              vz: 0,
              angle: 0,
              isSlapping: false,
              slapCooldown: 0,
              dashCooldown: 0,
              isDashing: false,
              dashTimer: 0,
              isHit: false,
              hitTimer: 0,
              isFalling: false,
              fallY: 0,
              score: 0,
              eliminated: false,
            };
          }
        });

        // Ensure host is designated correctly
        const activeCount = Object.keys(currentPlayers).length;
        if (activeCount < 2 && arenaRef.current.phase === 'BATTLE') {
          setOpponentLeftReason('Menunggu pemain lain bergabung...');
          setCanProceedNextRound(false);
        } else if (activeCount >= 2 && !opponentLeftReason) {
          setCanProceedNextRound(true);
        }

        setArenaState((prev: ArenaState) => ({
          ...prev,
          players: currentPlayers,
        }));
      },
      // onBroadcastMove
      (payload) => {
        if (!payload || payload.playerId === localPlayerId) return;
        const p = arenaRef.current.players[payload.playerId];
        if (p) {
          p.x = payload.x;
          p.z = payload.z;
          p.vx = payload.vx;
          p.vz = payload.vz;
          p.angle = payload.angle;
        }
      },
      // onBroadcastLeave
      (payload) => {
        const leftName = payload?.playerName || 'Lawan';
        setOpponentLeftReason(`${leftName} telah meninggalkan arena dan kembali ke lobby.`);
        setCanProceedNextRound(false);
        setArenaState((prev: ArenaState) => ({
          ...prev,
          phase: 'ROUND_OVER',
        }));
      }
    );

    channelRef.current = channel;

    // Listen to direct real-time action events
    if (channel) {
      channel.on('broadcast', { event: 'player_slap' }, (event: any) => {
        const payload = event.payload;
        if (!payload || payload.playerId === localPlayerId) return;
        const attacker = arenaRef.current.players[payload.playerId];
        if (attacker) {
          attacker.x = payload.x;
          attacker.z = payload.z;
          attacker.angle = payload.angle;
          const hits = executeSlap(attacker, Object.values(arenaRef.current.players) as PlayerState[]);
          playSlapSound();
          if (hits.length > 0) playKnockbackSound();
        }
      });

      channel.on('broadcast', { event: 'player_dash' }, (event: any) => {
        const payload = event.payload;
        if (!payload || payload.playerId === localPlayerId) return;
        const dasher = arenaRef.current.players[payload.playerId];
        if (dasher) {
          executeDash(dasher);
          playDashSound();
        }
      });

      channel.on('broadcast', { event: 'round_reset' }, (event: any) => {
        const payload = event.payload;
        if (payload && payload.players) {
          setArenaState((prev: ArenaState) => ({
            ...prev,
            round: payload.round,
            phase: 'BATTLE',
            winnerId: null,
            players: payload.players,
          }));
        }
      });
    }

    return () => {
      unsubscribe();
    };
  }, [code, isSolo, localPlayerId, opponentLeftReason]);

  // 4. Main 60 FPS Physics Simulation Loop
  useEffect(() => {
    let animId = 0;
    let lastTime = performance.now();
    let broadcastTimer = 0;

    const loop = (currentTime: number) => {
      animId = requestAnimationFrame(loop);
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const currentArena = arenaRef.current;
      if (currentArena.phase !== 'BATTLE') return;

      const players = currentArena.players;
      const playerList = Object.values(players) as PlayerState[];

      // Local player input integration (Virtual joystick + Keyboard)
      let ix = inputVector.current.x;
      let iz = inputVector.current.z;

      if (keyboardKeys.current['w'] || keyboardKeys.current['arrowup']) iz -= 1;
      if (keyboardKeys.current['s'] || keyboardKeys.current['arrowdown']) iz += 1;
      if (keyboardKeys.current['a'] || keyboardKeys.current['arrowleft']) ix -= 1;
      if (keyboardKeys.current['d'] || keyboardKeys.current['arrowright']) ix += 1;

      const local = players[localPlayerId];
      if (local) {
        updatePlayerMovement(local, ix, iz, dt);

        // Fall sound trigger
        if (local.isFalling && local.fallY === 0) {
          playFallSound();
        }
      }

      // Bots movement in Solo mode
      if (isSolo) {
        playerList.forEach((p) => {
          if (p.isBot && !p.eliminated) {
            const decision = computeBotAi(p, playerList, dt);
            updatePlayerMovement(p, decision.inputX, decision.inputZ, dt);

            if (decision.shouldSlap) {
              const hits = executeSlap(p, playerList);
              playSlapSound();
              if (hits.length > 0) playKnockbackSound();
            }
            if (decision.shouldDash) {
              const dashed = executeDash(p);
              if (dashed) playDashSound();
            }

            if (p.isFalling && p.fallY === 0) {
              playFallSound();
            }
          }
        });
      }

      // Physics player-to-player collision resolution
      resolvePlayerCollisions(playerList);

      // Multiplayer movement broadcast (throttled ~30fps)
      broadcastTimer += dt;
      if (!isSolo && channelRef.current && local && broadcastTimer >= 0.033) {
        broadcastTimer = 0;
        channelRef.current.send({
          type: 'broadcast',
          event: 'player_move',
          payload: {
            playerId: local.id,
            x: local.x,
            z: local.z,
            vx: local.vx,
            vz: local.vz,
            angle: local.angle,
          },
        });
      }

      // Check Round End Condition (Last Player Standing)
      const survivors = playerList.filter((p) => !p.isFalling && !p.eliminated);
      if (survivors.length <= 1 && playerList.length >= 2) {
        const winner = survivors.length === 1 ? survivors[0] : null;
        if (winner) {
          winner.score += 1;
          playRoundWinSound();
        }

        const isMatchWon = winner && winner.score >= currentArena.scoreToWin;

        setArenaState((prev: ArenaState) => ({
          ...prev,
          phase: isMatchWon ? 'MATCH_OVER' : 'ROUND_OVER',
          winnerId: winner ? winner.id : null,
          matchWinnerId: isMatchWon && winner ? winner.id : null,
        }));
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isSolo, localPlayerId]);

  // 5. Next Round Handler
  const handleNextRound = () => {
    // If opponent has left, forbid starting next round!
    if (opponentLeftReason || !canProceedNextRound) return;

    const updatedPlayers = { ...arenaRef.current.players };
    spawnPlayersInCircle(updatedPlayers);

    const nextRound = arenaRef.current.round + 1;

    setArenaState((prev: ArenaState) => ({
      ...prev,
      round: nextRound,
      phase: 'BATTLE',
      winnerId: null,
      players: updatedPlayers,
    }));

    if (!isSolo && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'round_reset',
        payload: {
          round: nextRound,
          players: updatedPlayers,
        },
      });
    }
  };

  // 6. Leave / Back to Lobby
  const handleExitToLobby = async () => {
    if (!isSolo && code && multiplayerMatchId) {
      try {
        await leaveOnlineMatch({
          matchId: multiplayerMatchId,
          roomCode: code,
          playerIndex: isHost ? 0 : 1,
          playerName: localPlayerName,
        });
      } catch {}
    }
    navigate('/slap-arena');
  };

  const localPlayer = arenaState.players[localPlayerId];
  const winner = arenaState.winnerId ? arenaState.players[arenaState.winnerId] : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 100,
        overflow: 'hidden',
        backgroundColor: '#0f172a',
        userSelect: 'none',
      }}
    >
      {/* 3D WebGL Island Canvas */}
      <Arena3D players={arenaState.players} localPlayerId={localPlayerId} />

      {/* Top HUD: Score & Status Bar */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          right: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        {/* Match info pill */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(8px)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '8px 16px',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ font: '800 14px/1.2 var(--sans, sans-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>RONDE {arenaState.round}</span>
            <span>·</span>
            <span style={{ color: '#fbbf24' }}>TARGET: {arenaState.scoreToWin} POIN</span>
          </div>
          {code && (
            <div style={{ font: '600 11px/1.4 var(--mono, monospace)', color: '#94a3b8', marginTop: '2px' }}>
              ROOM: {code}
            </div>
          )}
        </div>

        {/* Exit Button */}
        <button
          type="button"
          onClick={handleExitToLobby}
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '10px',
            padding: '8px 14px',
            color: '#f87171',
            font: '700 13px/1 var(--sans, sans-serif)',
            cursor: 'pointer',
            pointerEvents: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          Ke Lobby
        </button>
      </div>

      {/* Scoreboard List (Top Center) */}
      <div
        style={{
          position: 'absolute',
          top: '64px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        {(Object.values(arenaState.players) as PlayerState[]).map((p) => (
          <div
            key={p.id}
            style={{
              backgroundColor: p.id === localPlayerId ? 'rgba(37, 99, 235, 0.85)' : 'rgba(15, 23, 42, 0.75)',
              border: `2px solid ${p.color}`,
              borderRadius: '20px',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
          >
            <span>{p.name.slice(0, 10)}</span>
            <span
              style={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 900,
              }}
            >
              {p.score}
            </span>
          </div>
        ))}
      </div>

      {/* Virtual Joystick for Mobile Touch Controls */}
      <VirtualJoystick
        onMove={(v) => {
          inputVector.current = v;
        }}
        onSlap={triggerLocalSlap}
        onDash={triggerLocalDash}
        slapCooldown={localPlayer?.slapCooldown || 0}
        dashCooldown={localPlayer?.dashCooldown || 0}
        maxSlapCooldown={SLAP_COOLDOWN}
        maxDashCooldown={DASH_COOLDOWN}
      />

      {/* Opponent Left Notification Modal (Abnormal Flow Handling) */}
      {opponentLeftReason && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '28px 24px',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 style={{ font: '800 20px/1.2 var(--sans, sans-serif)', margin: '0 0 10px', color: '#0f172a' }}>
              Pertandingan Terputus
            </h3>
            <p style={{ font: '14px/1.6 var(--sans, sans-serif)', color: '#64748b', margin: '0 0 24px' }}>
              {opponentLeftReason}
            </p>
            <button
              type="button"
              onClick={handleExitToLobby}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                font: '800 15px/1 var(--sans, sans-serif)',
                cursor: 'pointer',
              }}
            >
              Kembali ke Lobby
            </button>
          </div>
        </div>
      )}

      {/* Round Over / Match Over Modal */}
      {(arenaState.phase === 'ROUND_OVER' || arenaState.phase === 'MATCH_OVER') && !opponentLeftReason && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 55,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px 24px',
              maxWidth: '400px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>
              {arenaState.phase === 'MATCH_OVER' ? '👑' : '🥊'}
            </div>
            <h2 style={{ font: '900 24px/1.1 var(--sans, sans-serif)', color: '#0f172a', margin: '0 0 6px' }}>
              {arenaState.phase === 'MATCH_OVER' ? 'JUARA ARENA!' : 'RONDE SELESAI!'}
            </h2>
            <p style={{ font: '600 16px/1.4 var(--sans, sans-serif)', color: winner ? winner.color : '#64748b', margin: '0 0 20px' }}>
              {winner ? `${winner.name} memenangkan ronde ini!` : 'Semua petarung terjatuh!'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {arenaState.phase === 'MATCH_OVER' ? (
                <button
                  type="button"
                  onClick={handleExitToLobby}
                  style={{
                    padding: '14px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    font: '800 15px/1 var(--sans, sans-serif)',
                    cursor: 'pointer',
                  }}
                >
                  Selesai & Ke Lobby
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNextRound}
                  disabled={!canProceedNextRound}
                  style={{
                    padding: '14px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: canProceedNextRound ? '#2563eb' : '#94a3b8',
                    color: '#ffffff',
                    font: '800 15px/1 var(--sans, sans-serif)',
                    cursor: canProceedNextRound ? 'pointer' : 'not-allowed',
                  }}
                >
                  Ronde Berikutnya
                </button>
              )}

              <button
                type="button"
                onClick={handleExitToLobby}
                style={{
                  padding: '12px 20px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  backgroundColor: 'transparent',
                  color: '#475569',
                  font: '700 14px/1 var(--sans, sans-serif)',
                  cursor: 'pointer',
                }}
              >
                Keluar ke Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
