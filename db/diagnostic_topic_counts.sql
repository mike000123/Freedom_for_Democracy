-- Διάγνωση: γιατί η αρχική και η σελίδα Προτάσεις δείχνουν διαφορετικούς αριθμούς ανά θέμα.
-- Τρέξτε το στο Supabase SQL Editor (μόνο ανάγνωση).
select t.name as thema,
       count(*)                                                        as protaseis_selidas_protaseon,
       count(distinct pr.party_id)                                     as kommata_pou_exoun_thesi,
       count(*) filter (where p.is_example)                            as apo_deigmata,
       count(*) filter (where p.graduated)                             as apo_apofoita,
       count(*) - count(distinct pr.party_id)                          as epipleon_protaseis_idiou_kommatos,
       count(distinct pr.party_id) filter (where not p.is_example and not p.graduated) as arithmos_arxikis
from proposals pr
join parties p on p.id = pr.party_id and p.is_published
join topics t on t.id = pr.topic_id
where pr.is_published
group by t.name, t."order"
order by t."order";
