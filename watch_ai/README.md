# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

3. Configure frontend environment variables in `watch_ai/.env` (not
   `backend-watch/.env`):

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   EXPO_PUBLIC_API_URL=https://your-backend-url
   ```

   Use plain values, without Markdown link syntax. Restart Expo after changing
   the file. The backend has its own `.env` and needs `SUPABASE_URL` plus
   `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`.

## Starting Expo Go over a tunnel

The project includes `@expo/ngrok` as a local development dependency. From
`watch_ai`, run:

```powershell
npm run start:tunnel
```

If port 8081 is already occupied, choose another port at the prompt or provide
one explicitly:

```powershell
npm run start:tunnel -- --port 8083
```

Scan the QR code printed by that running server with Expo Go. If Expo Go still
shows a remote-update download error, confirm the tunnel reports **Tunnel
ready**, scan the newest QR code (not one from a previous server), and verify
the phone can access the internet. On a shared Wi-Fi network, `npx expo start
--lan` may be faster; phone and computer must be on the same network.

## Weather Watch and Map Overview

After login, Weather Watch loads the live Cebu forecast from the NestJS
backend and refreshes it every ten minutes. Pull down to refresh sooner.
Map Overview uses Leaflet with OpenStreetMap tiles on web; native builds link
to the selected OpenStreetMap location. Search uses the backend geocoder.
Set `EXPO_PUBLIC_API_URL` to the reachable backend URL for both screens.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Push notifications and local alerts

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`,
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`EXPO_PUBLIC_EAS_PROJECT_ID`. The backend separately needs `EXPO_ACCESS_TOKEN`,
`AI_API_KEY`, and (if Facebook Graph access is authorized) `FACEBOOK_ACCESS_TOKEN`.
Never put server credentials in `EXPO_PUBLIC_*` variables.

Notification permission is requested separately from location permission after
sign-in. To test remote notifications, use an iOS/Android development build or
EAS build with the EAS project configured. Remote push is not supported in
Expo Go on Android; configure FCM credentials in the EAS project for Android.
Open the **Alerts** screen to see delivered announcements and weather safety
tips. Tapping an announcement opens its source, original text, AI summary, and
verification disclaimer.

The backend alert job requires the Supabase migrations to be applied, a trusted
source, an AI provider key, Expo push credentials, and a physical test device
with notification permission. See `../backend-watch/README.md` for source
registration and manual-entry examples.

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
