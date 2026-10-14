-- Server-side rules for the multiplayer rooms.
-- The anon key ships inside the public bundle, so every client is trusted only as far as these
-- predicates allow. RLS cannot compare a row's old and new values; a trigger can.

create or replace function public.enforce_match_protocol()
returns trigger
language plpgsql
as $$
declare
  new_status text := NEW.status;
  old_status text := OLD.status;
begin
  if new_status not in ('waiting', 'playing', 'completed', 'abandoned') then
    raise exception 'match status % is not allowed', new_status;
  end if;

  if new_status in ('completed', 'abandoned') and old_status = 'waiting' then
    raise exception 'a match cannot finish before it starts';
  end if;

  if new_status = 'waiting' and old_status <> 'waiting' then
    raise exception 'a started match cannot return to waiting';
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.room_code is distinct from OLD.room_code
     or NEW.game_type is distinct from OLD.game_type
     or NEW.max_players is distinct from OLD.max_players then
    raise exception 'match identity is immutable';
  end if;

  if NEW.current_turn < 0 or NEW.current_turn >= NEW.max_players then
    raise exception 'current_turn % is outside the room of % seats', NEW.current_turn, NEW.max_players;
  end if;

  if NEW.winner_index is not null
     and NEW.winner_index is distinct from OLD.winner_index
     and new_status = 'playing' then
    raise exception 'winner_index cannot be set while the match is still playing';
  end if;

  if NEW.winner_index is not null
     and (NEW.winner_index < 0 or NEW.winner_index >= NEW.max_players) then
    raise exception 'winner_index % is outside the room of % seats', NEW.winner_index, NEW.max_players;
  end if;

  if pg_column_size(NEW.game_state) > 65536 then
    raise exception 'game_state exceeds the 64 kB room budget';
  end if;

  -- A client cannot reuse the version token it read: the server always moves it forward, and the
  -- microsecond bump keeps it strictly increasing even for two writes in the same instant.
  NEW.updated_at := case
    when now() <= OLD.updated_at then OLD.updated_at + interval '1 microsecond'
    else now()
  end;

  return NEW;
end;
$$;

drop trigger if exists enforce_match_protocol on public.matches;
create trigger enforce_match_protocol
  before update on public.matches
  for each row
  execute function public.enforce_match_protocol();

create index if not exists idx_matches_status on public.matches(status);
create index if not exists idx_match_moves_action on public.match_moves(action);
