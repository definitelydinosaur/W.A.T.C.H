<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Environment variables

Create a `.env` file in `backend-watch` with `SUPABASE_URL` and either
`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`. The backend loads this
file from its own directory, including when started from the repository root.
For local-alert AI, set `AI_API_KEY`; `AI_PROVIDER` defaults to `anthropic` and
`AI_MODEL` defaults to `claude-3-5-haiku-latest`. `gemini` is also supported as
an alternate provider. `FACEBOOK_ACCESS_TOKEN` is optional and is never
hard-coded. Set `EXPO_ACCESS_TOKEN` for authenticated Expo push delivery and
`ANNOUNCEMENT_ADMIN_TOKEN` for the administrative source/manual-post endpoints.
Open-Meteo is used without a key; `WEATHER_API_KEY` is reserved for a future
provider configuration. Never put AI, Facebook, Expo, or Supabase service
secrets in the Expo app's `EXPO_PUBLIC_*` variables. See `.env.example` for
the complete backend environment.

## Weather, map, and AI setup

Apply the migrations in `supabase/migrations` to the project's Supabase
database before using the live weather, profile, institution, alert, or AI endpoints.
The onboarding migration adds a single-default home location, the profile
location-reminder timestamp, institution records and user links. It seeds
University of San Carlos, UP Cebu, CIT-U, USJ-R, and Cebu Normal University;
their social page URLs are intentionally blank for administrator review.
Custom institutions are stored as unverified until reviewed. The backend
uses Open-Meteo for forecasts, caches them for ten minutes, and classifies
weather risk using fixed thresholds before any AI explanation is requested.
Risk thresholds are advisory application rules: rainfall 15/30/50 mm, wind
39/62/88 km/h, heat index 33/42/52 °C, and provider thunderstorm codes. These are not
official PAGASA alerts and do not replace government advisories.
The announcement classifier and generated weather tips use `AI_PROVIDER`,
`AI_API_KEY`, and `AI_MODEL` (Anthropic by default; Gemini is supported).
Malformed AI classification output is rejected; unavailable weather-tip
generation uses reviewed static guidance, while low-confidence announcements
are held for admin review. The older `/ai` helper endpoints retain their
separate Gemini configuration and cache. Avoid sending personal data in AI
requests; remove names and identifying details from source posts where possible.
School-suspension summaries from the older AI helper remain unverified unless
the URL matches `TRUSTED_ANNOUNCEMENT_DOMAINS` or an administrator supplies the
server-side `ANNOUNCEMENT_ADMIN_TOKEN` using the `x-announcement-admin-token`
header. Never accept client-submitted boolean verification flags. AI requests
are limited to ten per client IP per minute.

## Local announcements, AI safety tips, and push

The backend polls only active, trusted sources every five minutes. It tries
Facebook Graph API access first when a page ID and `FACEBOOK_ACCESS_TOKEN` are
configured, then an official RSS/Atom feed. A website URL is accepted only when
it returns an XML feed; the service does not scrape Facebook pages, private
content, or HTML, and never bypasses access controls. Failed Facebook access
marks the source degraded and tries the feed fallback. Admins can add/disable
sources and manually enter urgent official posts using the server-side admin
token. Low-confidence AI results are retained as `pending_review` and are not
sent to users. Published announcements are attributed to their source.

Add a trusted source (admin token required):

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/admin/sources `
  -Headers @{ 'x-admin-token' = $env:ANNOUNCEMENT_ADMIN_TOKEN } `
  -ContentType 'application/json' `
  -Body '{"type":"lgu_mayor","name":"Cebu City Mayor","city":"Cebu City","is_trusted":true}'
```

Use the returned source `id` for manual testing. A manual post is accepted only
for an active, trusted source:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/admin/announcements `
  -Headers @{ 'x-admin-token' = $env:ANNOUNCEMENT_ADMIN_TOKEN } `
  -ContentType 'application/json' `
  -Body '{"source_id":"<source-uuid>","text":"No classes tomorrow due to typhoon.","posted_at":"<current-ISO-8601-time>"}'
```

Use a registered test device with notifications allowed, a valid EAS project,
`EXPO_ACCESS_TOKEN`, an active home city of Cebu City, and a configured AI
provider. Check the authenticated `GET /alerts` response and the device push.
Admin review items are available from `GET /admin/announcements/review`.

The weather monitor polls saved default locations every ten minutes, writes
weather snapshots, uses configurable-in-code rule thresholds (not AI) for risk
levels, and requests short safety tips for Advisory-or-higher hazards. Cached
forecasts remain available with a stale marker if Open-Meteo is down; app
surfaces show last-updated/unavailable states.

### Expo push setup

Install dependencies, set the EAS project ID in `watch_ai/.env` or EAS config,
then create an iOS/Android development build or EAS build. On Android, configure
Firebase/FCM credentials in the EAS project. Remote push is not available in
Expo Go on Android. The app requests notification permission separately from
location permission and stores device tokens through the authenticated backend.
Notification taps open the announcement detail screen or the alerts screen.

The map geocoder uses OpenStreetMap Nominatim, and onboarding suggestions use
OpenStreetMap Photon scoped to the Philippines. Provider requests share a
one-request-per-second rate limit. Map tiles include OpenStreetMap attribution.

Available endpoints:

- `GET /weather?latitude=10.3157&longitude=123.8854`
- `GET /map/geocode?query=Cebu%20City`
- `GET /map/suggest?kind=location&query=Cebu`
- `GET /institutions?query=University`
- `GET /profile` (authenticated; includes home location and default institution)
- `POST /profile/home-location` (authenticated; saves the user's default location)
- `PATCH /profile/location-prompt` (authenticated; stores or clears the reminder timestamp)
- `PUT /profile/institution` (authenticated; selects, adds, or clears the default institution)
- `POST /ai/hazard-guidance`
- `POST /ai/announcement-summary`
- `POST /admin/sources` and `PATCH /admin/sources/:id` (admin token required)
- `POST /admin/announcements` and `GET /admin/announcements/review` (admin token required)
- `GET /alerts`, `GET /alerts/announcements/:id` (authenticated)
- `POST /profile/push-token` (authenticated)

Authenticated profile endpoints require the Supabase access token in a Bearer
Authorization header. Registration requires email verification before the
mobile app opens location and profile onboarding. The Expo app requests only
foreground location access; denied permissions can be retried or opened in
device settings.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
