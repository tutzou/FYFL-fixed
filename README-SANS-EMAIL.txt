FYFL - CONNEXION SANS EMAIL POUR LES JOUEURS

Le formulaire joueur ne demande PAS d'adresse e-mail.
Les joueurs utilisent uniquement :
- Pseudo unique
- Mot de passe

Le pseudo est vérifié dans fyfl_profiles avec une clé unique insensible à la casse.
La session est gérée par Supabase Auth et peut être retrouvée sur un autre appareil avec les mêmes identifiants.

IMPORTANT : Supabase Auth "email/password" utilise techniquement une identité interne pour chaque compte.
Cette adresse interne est générée automatiquement par le site à partir du pseudo et n'est jamais demandée ni affichée au joueur.

Pour permettre la connexion immédiatement après inscription :
Supabase -> Authentication -> Providers -> Email -> désactiver Confirm email.

Ne supprime pas le provider Email : il est utilisé en interne par Supabase Auth pour le couple pseudo/mot de passe sans exposer d'e-mail dans l'interface.
