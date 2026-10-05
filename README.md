# FYFL V12
Correction du système Admin/Supabase : les scores utilisent les colonnes `home_score` et `away_score` de `fyfl_matches`.

## Mise à jour Supabase
Exécute `SETUP-V10-SUPABASE.sql` une fois dans Supabase SQL Editor. Il contient la migration V12 et remet les règles RLS + Realtime.


## Remise à zéro de la saison
La fin de `SETUP-V10-SUPABASE.sql` contient maintenant une section de reset à exécuter **une seule fois** :
- Rennes 9-2 Chelsea
- Manchester City 7-0 Bayern Munich
- toutes les autres rencontres des journées 1 à 3 remises à `À venir`
- classement automatique : toutes les équipes à 0 sauf Rennes et Manchester City à 3 points
- anciens overrides de classement supprimés

Après cette remise à zéro, ne relance pas cette section SQL lors de futures journées, sinon elle remettrait les matchs à venir à leur état initial.


CORRECTION V14 : si Supabase affiche « syntax error at or near as », utilise cette version du SQL. La colonne existante nommée as est maintenant correctement citée comme "as".

## V16 — classement et statut des matchs
- Le classement ignore définitivement les anciens résultats Supabase sauf Rennes–Chelsea (9–2) et Manchester City–Bayern Munich (7–0).
- Les autres rencontres des 6 poules sont affichées comme « À venir ».
- La carte « STATUT DES MATCHS » de l'accueil liste les matchs à venir de toutes les poules et des 3 journées.
