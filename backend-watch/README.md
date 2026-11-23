# W.A.T.C.H. backend

NestJS API and scheduled workers for weather hazards, official announcements, safety guidance, and Expo push notifications.

## Setup

From `backend-watch`:

```powershell
npm install
Copy-Item .env.example .env
```

Set `SUPABASE_URL` and either `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in `.env`. These service keys are server-only. AI uses the shared backend provider layer; `AI_PROVIDER` supports `gemini`, `groq`, `openrouter`, and `anthropic`. Gemini is the default provider and `gemini-3.5-flash-lite` is the default model. Set `AI_API_KEY` to enable AI. Without it, the backend still starts and official-source classification/summaries use source-only fallbacks; system announcement formatting reports that AI is not configured. Weather alert summaries remain rule/template-based.

The optional `CHATBOT_API_URL` points to a separately deployed chatbot service. Leave it empty to disable chatbot requests without affecting backend startup.

Free-tier providers may use submitted data to improve their products; Google's unpaid Gemini API terms also say human reviewers may process prompts and outputs. Google requires API users to be at least 18 and prohibits API clients directed to or likely accessed by under-18s. W.A.T.C.H. is student-facing, so **do not enable Google's unpaid Gemini API for the deployed app** unless Google confirms your use is permitted. Do not send sensitive, confidential, personal, or user-linked data to any free-tier provider. The backend's announcement prompts contain announcement text only; they do not include user profile fields, tokens, or saved locations. Review your provider's current terms before production use.

### AI setup and smoke test

For an environment whose audience is allowed by the selected provider's terms, create a Gemini key at [Google AI Studio API keys](https://aistudio.google.com/apikey), then put it in `AI_API_KEY` in the ignored `backend-watch/.env`. Use `AI_PROVIDER=gemini` and `AI_MODEL=gemini-3.5-flash-lite`; leave `AI_BASE_URL` empty unless using a compatible API proxy. Keep the key on the backend, never in Expo variables or app code. See Google's [current model documentation](https://ai.google.dev/gemini-api/docs/models) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits); quotas depend on project/account and can change.

To smoke-test, sign in as an admin, open the **System** section, enter `System maintenance tomorrow 10pm to 12am, app may not work`, and press **Format with AI**. `AI is not configured` means `AI_API_KEY` is blank; HTTP 401/403 means the provider rejected the key/account; HTTP 429 means a rate limit was reached; HTTP 404 means check provider/model/base URL; and `AI response was invalid after one repair attempt` means the model response did not pass JSON/schema validation. Classification and summaries use source-only fallbacks when AI fails; this admin formatting action reports the failure instead.

Optional variables:

- `FACEBOOK_ACCESS_TOKEN` — authorized Meta Graph API access for eligible public pages.
- `EXPO_ACCESS_TOKEN` — only needed if Expo enhanced push security is enabled.
- `AI_BASE_URL` — optional provider API root override.
- `CHATBOT_API_URL` — optional chatbot service base URL; omitted means chatbot is unavailable.
- `WEATHER_ALERT_SUSTAINED_MINUTES` — sustained weather-condition duration (default `60`).
- `TRUSTED_ANNOUNCEMENT_DOMAINS` — comma-separated trusted source hostnames.
- `ANNOUNCEMENT_ADMIN_TOKEN` — optional server-only token for legacy admin confirmation flows.
- `WATCH_ADMIN_PASSWORD` — only needed by the one-time `scripts/bootstrap-admin.mjs` script.
- `HAZARD_CONSECUTIVE_READINGS` — consecutive fresh readings required by the legacy hazard monitor.
- `SAFETY_TIP_INTERVAL_HOURS` — ongoing hazard-tip interval, from 2 to 3 hours (default `3`).
- `SAFETY_TIP_MAX_PER_HAZARD_USER` — maximum ongoing tips per hazard and user (default `3`, maximum `5`).
- `ENABLE_TEST_ENDPOINTS=true` — enables the test-hazard endpoint; leave off outside development.
- `PORT` — API port, default `3000`.

The AI provider uses JSON mode where the provider supports it, applies bounded retries/backoff for temporary errors, and validates generated JSON before use. Current Gemini model limits are project/tier-specific and can change; check them in Google AI Studio's rate-limit page.

Run the API:

```powershell
npm run start:dev
```

The server listens on `0.0.0.0`, port `3000` by default. From a physical phone, configure the app's `EXPO_PUBLIC_API_URL` with the computer's LAN IP (for example `http://192.168.1.20:3000`), not `localhost`.

## Supabase migration

Review [202611010001_alerts_feature.sql](./supabase/migrations/202611010001_alerts_feature.sql) against your deployed schema and apply it through your normal Supabase migration process. It expects the supplied schema's `school_sources`, `facebook_posts`, bigint announcement IDs, `user_info`, `locations`, `hazards`, `notifications`, and `weather_records` tables. It adds source metadata, alert status and notification fields, safety-tip structure, access policies, and the home-location RPC adjustment.

The migration has **not** been run against your database. For the supplied current schema, apply this alerts migration after review; do not blindly replay the repository's older migrations, which target a different schema. Back up and review your live schema before applying SQL.

Push-token registration also needs [202611080001_push_token_registration.sql](./supabase/migrations/202611080001_push_token_registration.sql). Review and apply this focused migration to add the profile token/preferences columns and `push_tokens` table; it is safe to run alongside the current schema and does not replace the alerts migration.

Apply [202611190001_announcement_classification_and_safety_tips.sql](./supabase/migrations/202611190001_announcement_classification_and_safety_tips.sql) in the Supabase SQL editor for the announcements-to-institutions foreign key, its backfill, structured classification fields, and safety-tip notification kind/deduplication index. Its `NOTICE` reports matched and unmatched announcement rows. The alert list uses the named FK and a default left embed, so local/PAGASA announcements remain visible with a null institution.

Apply [202611200001_admin_system_announcements.sql](./supabase/migrations/202611200001_admin_system_announcements.sql) after the classification migration. It adds `is_admin()`, the system announcement scope/kind, RLS-protected admin drafts, and idempotency indexes.

Apply [202611230002_notifications_service_role_grants.sql](./supabase/migrations/202611230002_notifications_service_role_grants.sql) to ensure the backend service-role key can insert and update notification records. Admin notification sends rely on the backend's `SUPABASE_SERVICE_ROLE_KEY` (or legacy `SUPABASE_SERVICE_KEY`); do not use an anon/publishable key for either variable.

Create or update the administrator account without storing a password in source control:

1. From `backend-watch`, ensure `.env` contains the server-only `SUPABASE_URL` and either `SUPABASE_SERVICE_ROLE_KEY` or the supported legacy alias `SUPABASE_SERVICE_KEY`.
2. Set `WATCH_ADMIN_PASSWORD` in the process environment or in the ignored local `.env` file. Do not put it in `watch_ai/.env`.
3. Run `node scripts/bootstrap-admin.mjs`. The script creates or updates `watchadmin@gmail.com`, confirms the account, and sets `user_info.role = 'admin'`. It does not print or persist the password.

To enter the password without placing it in shell history, use PowerShell:

```powershell
$secret = Read-Host 'Admin password' -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:WATCH_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
  node scripts/bootstrap-admin.mjs
} finally {
  Remove-Item Env:\WATCH_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
}
```

Admin API routes require a Supabase bearer session and verify both its JWT and `is_admin()` server-side; the former `x-admin-key` bypass is no longer accepted. Use the access token obtained from the admin login for the existing source/review routes and `/admin/features/*`. Keep `AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `EXPO_ACCESS_TOKEN` only in the backend environment. Deploy the backend after migration; no Supabase Edge Functions are used by this NestJS project.

## Announcement source pipeline

The worker checks active rows in `school_sources` every five minutes. It uses Facebook Graph API only when a configured token has permission to read that page, then tries the source's RSS/Atom URL or a website URL that serves an XML feed. It does not scrape Facebook pages, access private content, or bypass authentication or rate limits. Configure `rss_url` or `website_url` for official feeds; a Facebook URL by itself is not enough without permitted Graph access.

Register or activate official sources with the admin API. Institution sources need their Supabase `institution_id`; LGU sources need a city. Set `ADMIN_USER_ACCESS_TOKEN` to the current admin session's access token:

```powershell
$headers = @{ Authorization = ('Bearer ' + $env:ADMIN_USER_ACCESS_TOKEN) }
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
$headers = @{ Authorization = ('Bearer ' + $env:ADMIN_USER_ACCESS_TOKEN) }
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

## Admin notification and system announcement tools

Sign in through the app with the configured admin account to open the separate admin screen. Manual sends are recorded with `source = 'admin_manual'`, create notification rows, and use the same notification detail payload as automated alerts. The **Send to me only (test)** action targets only the current admin. System drafts are versioned and private to administrators; publishing requires an explicit confirmation and sends `kind = 'system'` notifications.

The admin API provides:

- `POST /admin/features/notifications/send` — manual sends to all users, the current admin, or an institution.
- `GET /admin/features/announcements` and `POST /admin/features/announcements/:id/resend-test` — automated announcement browsing and admin-only test resend.
- `POST /admin/features/system-drafts/format`, `POST /admin/features/system-drafts/:id/revise`, `DELETE /admin/features/system-drafts/:id`, and `POST /admin/features/system-drafts/:id/publish`.
- `GET /admin/features/system-announcements` — published system announcements.

Announcement classification and scheduled continuing-hazard tips use the backend's existing server-side `AiService` and `WeatherService`; AI secrets remain in the backend environment, never in the app. The tip worker checks active/unexpired hazards against recent measurements, preferences, notification history, and the configured interval/cap.

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
- After signing in on the installed build and allowing notifications, confirm `user_info.expo_push_token` is populated for that user in Supabase. To smoke-test Expo delivery independently of the alert worker, send a push to that token using the [Expo Push Tool](https://expo.dev/notifications) or Expo's push API. An `ok` ticket means Expo accepted the message, not that the device received it; test on the physical device with the app backgrounded and notifications enabled. Then test the full backend path with the admin-only `/admin/test-hazard` procedure below and confirm both the device notification and Alerts history update.
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
