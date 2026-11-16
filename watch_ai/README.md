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

## Alerts and push notifications

Copy `watch_ai/.env.example` to `watch_ai/.env` and set
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. For a physical phone, the API URL must
use the computer's reachable LAN IP (for example
`http://192.168.1.20:3000`), not `localhost`. The backend listens on
`0.0.0.0`; allow port 3000 through the computer's firewall if needed.

The **Alerts** screen displays the signed-in user's history, filters, refresh,
pagination, and delete/undo controls. Opening an announcement marks it read and
shows the attributed source, original text, AI summary, and verification
disclaimer. Active hazards at the saved home location show grouped safety tips
on Home. Supabase in-app history and realtime updates can be tested in Expo Go.

Remote push and notification-tap routing require an installed iOS/Android
development build, not Expo Go. Link the app to its EAS project, configure
Android FCM credentials where applicable, enable notification permission, and
set the backend's `EXPO_ACCESS_TOKEN`. The profile must have a valid Expo token
and must not disable the corresponding notification preference.

The backend needs its own `backend-watch/.env`; never put service-role, AI,
Facebook, Expo, or admin secrets in `EXPO_PUBLIC_*` variables. Its alert worker
polls active trusted sources. Facebook Graph requires access authorized for
that page; the system does not scrape Facebook pages or access private content.
An official RSS/Atom feed or admin-entered post can be used instead. See
[`backend-watch/README.md`](../backend-watch/README.md) for migration review,
source registration, manual announcement tests, and an admin-only test-hazard
procedure. The alerts migration has not been run against the database.

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
