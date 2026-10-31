# W.A.T.C.H. backend

NestJS API and scheduled workers for weather hazards, official announcements, safety guidance, and Expo push notifications.

## Setup

From `backend-watch`:

```powershell
npm install
Copy-Item .env.example .env
```

Set at least `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`. The service-role key is server-only. Configure `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` for announcement classification and generated weather guidance. `AI_PROVIDER` supports `anthropic` and `gemini`. The older `/ai` helper endpoints use `GEMINI_API_KEY` separately.

Optional variables:

- `FACEBOOK_ACCESS_TOKEN` — authorized Meta Graph API access for eligible public pages.
- `EXPO_ACCESS_TOKEN` — authenticated Expo push delivery.
- `ADMIN_API_KEY` — secret for administrative source and manual-announcement endpoints; send as `x-admin-key`.
- `ENABLE_TEST_ENDPOINTS=true` — enables the test-hazard endpoint; leave off outside development.
- `PORT` — API port, default `3000`.

Run the API:

```powershell
npm run start:dev
```

The server listens on `0.0.0.0`, port `3000` by default. From a physical phone, configure the app's `EXPO_PUBLIC_API_URL` with the computer's LAN IP (for example `http://192.168.1.20:3000`), not `localhost`.

## Supabase migration

Review [202611010001_alerts_feature.sql](./supabase/migrations/202611010001_alerts_feature.sql) against your deployed schema and apply it through your normal Supabase migration process. It expects the supplied schema's `school_sources`, `facebook_posts`, bigint announcement IDs, `user_info`, `locations`, `hazards`, `notifications`, and `weather_records` tables. It adds source metadata, alert status and notification fields, safety-tip structure, access policies, and the home-location RPC adjustment.

The migration has **not** been run against your database. For the supplied current schema, apply this alerts migration after review; do not blindly replay the repository's older migrations, which target a different schema. Back up and review your live schema before applying SQL.

## Announcement source pipeline

The worker checks active rows in `school_sources` every five minutes. It uses Facebook Graph API only when a configured token has permission to read that page, then tries the source's RSS/Atom URL or a website URL that serves an XML feed. It does not scrape Facebook pages, access private content, or bypass authentication or rate limits. Configure `rss_url` or `website_url` for official feeds; a Facebook URL by itself is not enough without permitted Graph access.

Register or activate official sources with the admin API. Institution sources need their Supabase `institution_id`; LGU sources need a city:

```powershell
$headers = @{ 'x-admin-key' = $env:ADMIN_API_KEY }
$source = @{
  source_type = 'lgu'
  school_name = 'Cebu City Government'
  city = 'Cebu City'
  facebook_url = 'https://www.facebook.com/<official-page>'
  rss_url = 'https://example.gov.ph/announcements/feed'
  is_active = $true
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/admin/sources `
  -Headers $headers -ContentType 'application/json' -Body $source
```

Only add sources you have verified as official. Low-confidence, conflicting, or out-of-area announcement classifications are not distributed automatically. Admin review endpoints are `GET /admin/announcements/pending`, `PATCH /admin/announcements/:id/approve`, and `PATCH /admin/announcements/:id/reject`.

## Manual alert testing

An administrator can submit a post from a verified official source. If no active source matches the supplied city or institution, the backend creates an inactive manual source record for attribution; this does not enable scheduled polling:

```powershell
$headers = @{ 'x-admin-key' = $env:ADMIN_API_KEY }
$post = @{
  source_type = 'lgu'
  source_name = 'Cebu City Government (test)'
  city = 'Cebu City'
  source_url = 'https://www.facebook.com/<official-post>'
  text = 'No classes tomorrow due to the typhoon. This is a test announcement.'
  posted_at = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3000/admin/announcements `
  -Headers $headers -ContentType 'application/json' -Body $post
```

The announcement still passes through AI classification and audience matching. Depending on confidence and conflict checks, it may appear in the review queue instead of being sent. Do not represent a test post as a real government advisory.

To create a deterministic weather-hazard test for an administrator's saved home location:

1. Set `ENABLE_TEST_ENDPOINTS=true` and restart the backend.
2. Ensure the test administrator has `role = 'admin'` in `user_info`, a saved home location, and weather notifications enabled.
3. Use that administrator's Supabase access token (not only the API key):

```powershell
$adminAccessToken = [Environment]::GetEnvironmentVariable('ADMIN_USER_ACCESS_TOKEN')
$headers = @{ Authorization = ('Bearer ' + $adminAccessToken) }
$body = @{ hazard_type = 'rain' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/admin/test-hazard `
  -Headers $headers -ContentType 'application/json' -Body $body
```

Use `heat` as the other supported `hazard_type`. The endpoint is disabled unless explicitly enabled and requires an administrator session to select the user's home location.

## App and push verification

- In Expo Go, sign in and open **Alerts** to verify notification history, category filters, pull-to-refresh, pagination, and delete/undo. In-app alert/realtime behavior can be checked without remote push.
- Open Home with an active, unexpired hazard for the saved home location to see grouped **What to do**, **What to prepare**, and **What to avoid** guidance.
- For remote push and notification-tap routing, install an iOS/Android development build. Expo Go does not support the remote push workflow used here. Configure the EAS project, notification permissions, and Android FCM credentials; set `EXPO_ACCESS_TOKEN` on the backend. The user profile must have a valid Expo token and must not disable the corresponding notification preference.
- `GET /alerts` returns the authenticated user's recent alerts. `GET /alerts/announcements/:id` returns an announcement available to that user and marks it read. The app reads and updates its alert history through Supabase RLS/realtime.

## Other endpoints

- `GET /weather?latitude=10.3157&longitude=123.8854`
- `GET /map/geocode?query=Cebu%20City`
- `GET /map/suggest?kind=location&query=Cebu`
- `GET /institutions?query=University`
- Authenticated profile routes: `/profile`, `/profile/home-location`, `/profile/location-prompt`, `/profile/institution`, and `/profile/push-token`
- Authenticated alerts: `/alerts`, `/alerts/announcements/:id`, `/alerts/notifications/:id/read`, and `/alerts/notifications/:id`

## Validation

```powershell
npm run build
npm test -- --runInBand
```

There is no backend end-to-end test suite configured yet.

Weather risk thresholds are application defaults, not official warning criteria; review them with PAGASA and local authorities before operational use. AI summaries and safety tips also require human judgment.
