# Configuration des Variables d'Environnement

## Variables requises

Pour utiliser les templates d'email GytX, vous devez définir les variables d'environnement suivantes :

### RESEND_API_KEY
Votre clé API Resend pour l'envoi d'emails.

## Configuration

### 1. Créer un fichier .env
Créez un fichier `.env` à la racine du projet :

```bash
# Variables d'environnement pour GytX Email Templates
RESEND_API_KEY=your_resend_api_key_here
```

### 2. Remplacer la clé API
Remplacez `your_resend_api_key_here` par votre vraie clé API Resend.

### 3. Ajouter .env au .gitignore
Assurez-vous que le fichier `.env` est dans votre `.gitignore` pour ne pas exposer vos clés secrètes :

```
.env
```

## Utilisation

Une fois configuré, vous pouvez exécuter le script d'envoi d'email :

```bash
npm start
# ou
npx ts-node index.ts
```

## Sécurité

⚠️ **Important** : Ne jamais commiter vos clés API dans le code source !
- Utilisez toujours des variables d'environnement
- Ajoutez `.env` à votre `.gitignore`
- Documentez les variables requises dans ce fichier 