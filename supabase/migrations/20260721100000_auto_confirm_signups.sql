-- ============================================================================
-- Option B: auto-confirm new signups (email delivery is unreliable — SendGrid
-- was maxed out — so requiring email confirmation locks new users out). This
-- BEFORE INSERT trigger marks each new user's email as confirmed at creation, so
-- they can sign in immediately without a confirmation email. Trade-off: no email
-- verification. Remove this trigger to re-enable confirmation once email works.
-- Idempotent.
-- ============================================================================

create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'auth', 'public'
as $function$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists auto_confirm_before_insert on auth.users;
create trigger auto_confirm_before_insert
  before insert on auth.users
  for each row execute function public.auto_confirm_new_user();
