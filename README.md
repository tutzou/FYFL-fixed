# FYFL V17

## Admin + Supabase global
- L'administration utilise Supabase Auth avec le compte admin configuré dans le site.
- Les scores, statuts, minutes et buts sont enregistrés dans `fyfl_matches`.
- Les textes du site sont enregistrés dans `fyfl_settings`.
- Les changements sont diffusés en temps réel avec Supabase Realtime.
- Le classement se recalcule à partir des matchs réellement enregistrés.
- Les 36 affiches des 6 poules / 3 journées sont conservées.

## Remise à zéro
Exécute `SETUP-V10-SUPABASE.sql` une seule fois dans Supabase SQL Editor après cette version.
Il remet les 36 matchs à `À venir`, avec 0-0, et le classement à zéro pour toutes les équipes.

Après cette remise à zéro, ne relance pas la section de reset lors des futures journées.
