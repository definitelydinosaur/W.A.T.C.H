# W.A.T.C.H.

Weather Alert Tracking and Community Hazard System (W.A.T.C.H.) is a location-aware weather, hazard, and official-announcement app for students and communities. Weather thresholds and AI summaries are advisory and do not replace PAGASA, LGU, school, or emergency-service guidance.

## Components

- `watch_ai/` — Expo React Native app, weather dashboard, alert history, and notification handling.
- `backend-watch/` — NestJS API, trusted-source polling, announcement review, weather hazards, and Expo push delivery.
- `backend-watch/supabase/migrations/` — SQL migrations. The alerts feature migration is [202611010001_alerts_feature.sql](./backend-watch/supabase/migrations/202611010001_alerts_feature.sql).

## Setup

1. Review the migration against your deployed Supabase schema and apply the applicable pending SQL yourself. For the supplied current schema, use the alerts migration above; do not blindly replay legacy migrations. **The alerts migration has not been run as part of this change.**
2. In `backend-watch`, install dependencies, copy `.env.example` to `.env`, and set the server-side Supabase URL and service-role key. Set an AI provider/key for classification and safety tips. See [backend setup and source configuration](./backend-watch/README.md).
3. In `watch_ai`, install dependencies, copy `.env.example` to `.env`, and set the Supabase URL and publishable key. Set `EXPO_PUBLIC_API_URL` to the backend URL reachable from the device. Never put service-role, AI, Facebook, or Expo secrets in the app environment.
4. Start the backend with `npm run start:dev` and the app with `npx expo start` in their respective folders. For a physical phone, use the computer's LAN IP instead of `localhost`.

## Alerts and notifications

The Alerts screen shows the authenticated user's in-app notification history, supports category filters, refresh/pagination, mark-read on announcement open, and soft-delete with undo. Current, unexpired hazards for the user's saved home location also show grouped safety tips on Home.

Expo Go can be used to verify in-app alert history and Supabase realtime updates. Remote push delivery and notification-tap routing must be tested with an installed iOS/Android development build; configure the EAS project and Android FCM credentials as needed. The backend can poll Facebook Graph only for pages and fields authorized by the configured Meta access token. It does not scrape Facebook pages, access private content, or bypass login/rate limits. Official RSS/Atom feeds and admin-entered urgent announcements are supported.

Follow the [manual setup and test steps](./backend-watch/README.md#manual-alert-testing) to register an official source, submit a test announcement, or simulate a weather hazard. Thresholds, AI output, and generated safety tips require human review and must not be treated as official warnings.
