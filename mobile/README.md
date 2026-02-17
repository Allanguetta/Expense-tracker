# Mobile App (Expo)

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set backend URL:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:8000
```

3. Start Expo:

```bash
npm run start
```

## EAS builds

The project includes `eas.json` with `development`, `preview`, and `production` profiles.

```bash
npx eas login
npx eas init
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

## OTA updates

```bash
npx eas update --branch production --message "update message"
```

## Deployment reference

See `../DEPLOYMENT.md` for full backend + mobile deployment setup.
