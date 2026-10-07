FYFL — COMPTES SUPABASE + MEGA HALLOWEEN

1) Supabase
- Ouvre SQL Editor.
- Exécute fyfl_realtime_complete.sql en entier.
- Ce SQL crée fyfl_profiles avec pseudo unique et relie les commentaires au compte connecté.
- Il active aussi Realtime sur fyfl_profiles en plus des tables FYFL déjà utilisées.

2) Authentification
- Le site utilise Supabase Auth pour les comptes visiteurs.
- Le pseudo est unique (insensible à la casse).
- Le mot de passe est stocké et géré par Supabase Auth, pas par le navigateur.
- La session Supabase est persistante : un utilisateur peut se reconnecter depuis un autre appareil avec le même pseudo + mot de passe.
- IMPORTANT : dans Supabase Dashboard > Authentication > Providers > Email, désactive "Confirm email" si tu veux une connexion uniquement pseudo + mot de passe. Le site n'envoie pas d'e-mail réel car le pseudo est converti en identifiant technique interne.

3) Vercel
- Remplace ton ancien index.html par celui du ZIP.
- Garde le fichier fyfl-halloween-logo.svg dans le même dossier.
- Déploie sur Vercel.

4) Halloween
- Le thème Halloween est activé par défaut.
- Effets orange/violet/noir, vignette, brouillard, chauves-souris, citrouilles et décorations.
- Les cartes, boutons, navigation, modales, matchs, stats et administration utilisent le thème Halloween.

5) Realtime
- Les matchs, buts, résultats, classement dérivé, paramètres, commentaires, notifications, maintenance, journal admin, stats et Homme du Match utilisent Supabase + Realtime.
- Les commandes admin restent écrites dans Supabase et non dans le stockage local du navigateur.
