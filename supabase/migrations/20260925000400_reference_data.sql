-- Données de référence indispensables au mode connecté, indépendantes du catalogue de démonstration.
-- Sans elles, la réclamation d'une mission échouerait sur la clé étrangère de mission_completions.
-- Valeurs figées à la version 1 (src/modules/progression/config.ts et missions.ts au 2026-09-25).
-- Les évolutions passent par l'administration (nouvelle version de barème, missions) ou par une
-- nouvelle migration ; `on conflict do nothing` préserve toute modification déjà faite en base.

insert into public.progression_settings (version, parcel_resolution, config) values (1, 8, '{"xp":{"declaredFirstVisit":20,"checkedFirstVisit":20,"proximityBonus":15,"newParcel":5},"missionXp":{}}'::jsonb) on conflict (version) do nothing;
insert into public.missions (id, period, title, description, criteria, xp, active, safety_reviewed) values ('preparer-une-sortie', 'daily', 'Préparer une sortie', 'Créez ou ajustez une excursion aujourd''hui, même pour un après-midi près de chez vous.', '{"type":"excursion_prepared","count":1}'::jsonb, 5, true, true) on conflict (id) do nothing;
insert into public.missions (id, period, title, description, criteria, xp, active, safety_reviewed) values ('tresor-gratuit', 'weekly', 'Trésor gratuit', 'Visitez cette semaine un lieu en accès libre encore jamais visité : parc, point de vue, place, plage.', '{"type":"free_place_visited","count":1}'::jsonb, 15, true, true) on conflict (id) do nothing;
insert into public.missions (id, period, title, description, criteria, xp, active, safety_reviewed) values ('deux-univers', 'weekly', 'Deux univers', 'Visitez cette semaine deux nouveaux lieux de catégories différentes.', '{"type":"distinct_categories_visited","count":2}'::jsonb, 15, true, true) on conflict (id) do nothing;
insert into public.missions (id, period, title, description, criteria, xp, active, safety_reviewed) values ('trois-parcelles', 'monthly', 'Lever trois voiles', 'Révélez trois nouvelles parcelles ce mois-ci, en restant sur les espaces ouverts au public.', '{"type":"parcels_revealed","count":3}'::jsonb, 30, true, true) on conflict (id) do nothing;
