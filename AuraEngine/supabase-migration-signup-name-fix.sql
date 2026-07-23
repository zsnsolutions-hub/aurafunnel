-- Fix: signup failed with a profiles.name NOT-NULL violation when the client
-- didn't pass full_name metadata (found while minting a test token). Default the
-- name from full_name → name → the email local-part → 'User' so signup is robust
-- regardless of what metadata the caller supplies.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'User'
    ),
    'CLIENT'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
