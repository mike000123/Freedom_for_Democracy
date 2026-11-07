-- 019: Ο πολίτης αλλάζει στο προφίλ του μόνο όνομα εμφάνισης και στοιχείο επικοινωνίας (όχι είδος, παράδειγμα, ημερομηνίες).
create or replace function public.guard_citizen_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if (new.user_id, new.kind, new.org_type, new.is_example, new.consent_at, new.created_at)
     is distinct from
     (old.user_id, old.kind, old.org_type, old.is_example, old.consent_at, old.created_at) then
    raise exception 'Αυτά τα στοιχεία δεν αλλάζουν από τον χρήστη.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_citizen on public.citizen_profiles;
create trigger trg_guard_citizen before update on public.citizen_profiles for each row execute function public.guard_citizen_update();
