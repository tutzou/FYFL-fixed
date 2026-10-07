FYFL - CORRECTION COMPTE + LOGO + BUTEURS

1. Décompresse ce ZIP et déploie index.html + fyfl-logo.png sur Vercel.
2. Dans Supabase > SQL Editor, exécute d'abord fyfl_pseudo_auth.sql.
3. Les joueurs utilisent uniquement Pseudo + Mot de passe. Aucun e-mail n'est demandé.
4. Le pseudo est unique dans toute la base.
5. Pour se connecter sur un autre appareil, il suffit de saisir le même pseudo et mot de passe.
6. Les sessions joueur sont des jetons de session locaux ; le compte, le mot de passe hashé et les données restent dans Supabase.
7. L'authentification admin Supabase reste séparée.
8. Le logo fourni par l'utilisateur est utilisé comme logo principal.
9. Les matchs terminés restent cliquables et leurs buteurs restent visibles et modifiables en direct.

IMPORTANT : les anciens comptes créés avec l'ancien système d'adresse technique ne peuvent pas être convertis sans connaître leur mot de passe. Crée-les à nouveau avec ce nouveau système si nécessaire.
