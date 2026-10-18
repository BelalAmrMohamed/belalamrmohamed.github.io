-- Run the 0300 rollback first (its functions call private.audit_write).
drop trigger if exists portfolio_projects_audit on public.portfolio_projects;
drop trigger if exists portfolio_settings_audit on public.portfolio_settings;
drop function if exists private.log_portfolio_change();
drop function if exists private.audit_write(text, text, text, text, jsonb);
drop function if exists private.audit_trim(jsonb);
drop table if exists private.portfolio_audit_log;   -- destroys the whole activity history
