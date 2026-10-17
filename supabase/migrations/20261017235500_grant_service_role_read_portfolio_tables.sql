-- The /api/ai-agent/chat server endpoint reads published portfolio data with the
-- secret (service_role) key. service_role had no SELECT on these tables, so
-- PostgREST returned 403 and the endpoint answered 503.
grant select on public.portfolio_projects to service_role;
grant select on public.portfolio_settings to service_role;
