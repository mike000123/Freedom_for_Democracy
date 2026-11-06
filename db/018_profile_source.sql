-- 018: Προέλευση προφίλ — «από δημόσιες πηγές» ή «επιβεβαιωμένο από το κόμμα». Αλλάζει μόνο από διαχειριστή.
alter table public.parties add column if not exists profile_source text not null default 'public_sources';
alter table public.parties drop constraint if exists parties_profile_source_check;
alter table public.parties add constraint parties_profile_source_check check (profile_source in ('public_sources', 'party_verified'));

create or replace function public.guard_party_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if (new.id, new.name, new.slug, new.kind, new.tier, new.profile_source, new.responsible_persons, new.is_published, new.graduated, new.is_example, new.moderation_note, new.created_at)
     is distinct from
     (old.id, old.name, old.slug, old.kind, old.tier, old.profile_source, old.responsible_persons, old.is_published, old.graduated, old.is_example, old.moderation_note, old.created_at) then
    raise exception 'Αυτά τα πεδία αλλάζουν μόνο από τη διαχείριση.';
  end if;
  if not (public.valid_social(new.facebook, array['facebook.com', 'fb.com', 'fb.me'])
      and public.valid_social(new.instagram, array['instagram.com'])
      and public.valid_social(new.x_url, array['x.com', 'twitter.com'])
      and public.valid_social(new.youtube, array['youtube.com', 'youtu.be'])
      and public.valid_social(new.tiktok, array['tiktok.com'])
      and public.valid_social(new.linkedin, array['linkedin.com'])) then
    raise exception 'Δώστε έγκυρους συνδέσμους https από την αντίστοιχη υπηρεσία.';
  end if;
  if new.website <> '' and new.website !~* '^https?://' then raise exception 'Η ιστοσελίδα πρέπει να ξεκινά με http:// ή https://.'; end if;
  if new.image_path <> '' and new.image_path not like new.id::text || '/%' then raise exception 'Μη έγκυρη εικόνα.'; end if;
  return new;
end $$;
