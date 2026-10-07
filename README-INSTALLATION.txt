FYFL — VERSION AUDIT REALTIME + STATS

1. Décompresse le ZIP.
2. Remplace entièrement l'ancien index.html et fyfl-logo.png sur Vercel.
3. Dans Supabase > SQL Editor, exécute UNE FOIS : fyfl_realtime_complete.sql
4. Vérifie que le compte administrateur Supabase est bien : enzoadressepro888@gmail.com
5. Dans Supabase Authentication, ce compte admin doit exister et son mot de passe doit être défini.

Ce build utilise Supabase comme source de vérité pour les données du site.
Realtime activé pour :
- fyfl_matches
- fyfl_settings
- fyfl_comments
- fyfl_notifications
- fyfl_site_status
- fyfl_admin_logs
- fyfl_stats
- fyfl_match_mvp

Commandes admin vérifiées :
- lancer / modifier un match
- terminer un match
- remettre un match à zéro
- ajouter / supprimer un buteur, même après la fin
- maintenance
- notifications globales
- breaking news / joueur du mois / message
- classement manuel
- STATS buteurs / passeurs
- journal admin

Un match terminé reste Terminé quand on ajoute un buteur.
Les visiteurs reçoivent les changements via Supabase Realtime sans actualiser.

Les comptes joueurs utilisent pseudo + mot de passe via les fonctions SQL fyfl_register_account et fyfl_login_account, sans champ e-mail côté joueur.
