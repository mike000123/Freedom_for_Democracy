-- Στατιστικά εμφανίσεων για τη δημόσια σελίδα «Διαφάνεια».
-- Ο πίνακας impressions δεν διαβάζεται απευθείας (RLS χωρίς policy)· εκτίθενται μόνο τα συγκεντρωτικά.
create or replace function public.impression_stats()
returns table (id uuid, name text, slug text, kind text, graduated boolean, total bigint, week bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.slug, p.kind, p.graduated,
         count(i.id),
         count(i.id) filter (where i.shown_at > now() - interval '7 days')
    from public.parties p
    left join public.impressions i on i.party_id = p.id
   where p.is_published
   group by p.id
   order by p.name
$$;
revoke all on function public.impression_stats() from public;
grant execute on function public.impression_stats() to anon, authenticated;
