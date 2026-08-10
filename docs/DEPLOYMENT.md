# Deployment and Environment Configuration

LibriQ searches public sources such as Open Library and Google Books. Normal users do not need to configure anything.

## Local Setup

Install dependencies and generate local configuration:

```bash
npm install
npm run build
```

Serve the project with a static-file server and open:

```text
http://localhost:5500/frontend/index.html
```

## Environment Variables

To enable keyed Google Books requests and Firebase sign-in locally, create a root-level `.env` with the relevant values:

```dotenv
GOOGLE_BOOKS_API_KEY=
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

Run `npm run build` after creating or changing the environment file. The build generates browser configuration for local testing.

Important notes:

- Add `localhost` to Firebase Authentication > Settings > Authorized domains.
- Use `localhost`, not `127.0.0.1`, for local Firebase sign-in tests.
- `.env` is ignored by git, so credentials remain local.
- `frontend/js/config.js` remains a committed placeholder.
- `frontend/js/config.local.js` is generated from the local environment and ignored by git.
- If `frontend/js/config.local.js` is empty, the expected variables were not present during the build.
- Without a Google Books key, the public endpoint is still used and Open Library remains available as a fallback.

## Vercel Deployment

Set `GOOGLE_BOOKS_API_KEY` and the required Firebase client variables in Project Settings > Environment Variables. Use a restricted Google Books API key.

LibriQ's build step generates `frontend/js/config.js` from deployment environment variables. Redeploy after adding or updating a value so the generated configuration is refreshed.

Suggested settings:

- Build Command: `npm run build`
- Output Directory: `frontend`

## Firebase Setup

Firebase Authentication requires the deployed domain in Authorized domains. Firestore must be enabled for cloud backup, activity, and Account Sync. Apply the rules documented in [FIREBASE.md](FIREBASE.md).

The normal browser application uses Firebase client configuration only. Do not place Firebase Admin service-account credentials in frontend configuration.
