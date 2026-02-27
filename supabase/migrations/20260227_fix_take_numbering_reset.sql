-- Fix take numbering: reset to 1 when all takes deleted for a shot.
-- DROP required because return type changed from original function.
-- Uses max(take_number)+1 and locks the shot row to avoid races.

drop function if exists public.create_take_with_number(uuid, uuid);

create function public.create_take_with_number(
  p_project_id uuid,
  p_shot_id uuid
)
returns table (
  out_id uuid,
  out_shot_id uuid,
  out_status text,
  out_take_number int,
  out_created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_next int;
begin
  perform 1 from public.shots where id = p_shot_id for update;

  select coalesce(max(take_number), 0) + 1
    into v_next
  from public.takes
  where shot_id = p_shot_id;

  insert into public.takes(project_id, shot_id, status, take_number)
  values (p_project_id, p_shot_id, 'draft', v_next)
  returning id, shot_id, status, take_number, created_at
  into out_id, out_shot_id, out_status, out_take_number, out_created_at;

  return next;
end;
$$;