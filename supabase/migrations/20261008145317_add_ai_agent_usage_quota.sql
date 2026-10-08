create table public.ai_agent_daily_usage (
  usage_date date not null,
  subject_type text not null check (subject_type in ('device', 'ip')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (usage_date, subject_type, subject_hash)
);

alter table public.ai_agent_daily_usage enable row level security;
revoke all on public.ai_agent_daily_usage from public, anon, authenticated;
grant all on public.ai_agent_daily_usage to service_role;

create or replace function public.consume_ai_agent_daily_quota(
  p_device_hash text,
  p_ip_hash text,
  p_device_limit integer default 15,
  p_ip_limit integer default 60
)
returns table (allowed boolean, device_usage integer, ip_usage integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_date date := (now() at time zone 'utc')::date;
  v_device_lock bigint;
  v_ip_lock bigint;
begin
  if p_device_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_device_limit < 1
    or p_ip_limit < 1 then
    raise exception 'Invalid AI quota parameters';
  end if;

  v_device_lock := pg_catalog.hashtextextended(
    'ai-agent:device:' || v_usage_date::text || ':' || p_device_hash,
    0
  );
  v_ip_lock := pg_catalog.hashtextextended(
    'ai-agent:ip:' || v_usage_date::text || ':' || p_ip_hash,
    0
  );

  if v_device_lock < v_ip_lock then
    perform pg_catalog.pg_advisory_xact_lock(v_device_lock);
    perform pg_catalog.pg_advisory_xact_lock(v_ip_lock);
  else
    perform pg_catalog.pg_advisory_xact_lock(v_ip_lock);
    perform pg_catalog.pg_advisory_xact_lock(v_device_lock);
  end if;

  insert into public.ai_agent_daily_usage (usage_date, subject_type, subject_hash)
  values
    (v_usage_date, 'device', p_device_hash),
    (v_usage_date, 'ip', p_ip_hash)
  on conflict (usage_date, subject_type, subject_hash) do nothing;

  select request_count into device_usage
  from public.ai_agent_daily_usage
  where usage_date = v_usage_date
    and subject_type = 'device'
    and subject_hash = p_device_hash;

  select request_count into ip_usage
  from public.ai_agent_daily_usage
  where usage_date = v_usage_date
    and subject_type = 'ip'
    and subject_hash = p_ip_hash;

  if device_usage >= p_device_limit or ip_usage >= p_ip_limit then
    allowed := false;
    return next;
    return;
  end if;

  update public.ai_agent_daily_usage
  set request_count = request_count + 1
  where usage_date = v_usage_date
    and subject_type = 'device'
    and subject_hash = p_device_hash
  returning request_count into device_usage;

  update public.ai_agent_daily_usage
  set request_count = request_count + 1
  where usage_date = v_usage_date
    and subject_type = 'ip'
    and subject_hash = p_ip_hash
  returning request_count into ip_usage;

  allowed := true;
  return next;
end;
$$;

revoke all on function public.consume_ai_agent_daily_quota(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ai_agent_daily_quota(text, text, integer, integer)
  to service_role;