# «По графику» — mobile scaffold (Capacitor 8)

**Status:** technical scaffold, not a signed, tested App Store / Google Play app.

The source website remains at the root of this repository. The mobile project is isolated in `mobile/` and must not change the live website by itself. Its initial build uses an explicit allowlist of website assets.

## Architecture

- iOS native WebView origin: `capacitor://localhost`.
- Android native WebView origin: `https://localhost`.
- Same Supabase backend, accounts, shift data and payroll as the web app.
- A public Supabase *publishable* key already exists in the website. Do not put service-role keys or signing credentials in the app.
- Both Edge Functions have **source changes only** to allow these origins: `supabase/functions/pvz-v2-rbac/index.ts` and `supabase/functions/pvz2-support/index.ts`. **No production deploy** is part of this work. Do not deploy until an isolated native smoke test and code review are complete.

## Commands (from `mobile/`)

Requires Node.js >= 22, Android Studio for Android and Xcode on macOS for iOS.

```bash
npm install
npm test
npm run build:web
npm run android:init
npm run ios:init
# Once native projects exist:
npm run sync
npm run open:android
npm run open:ios
```

The `android:init` and `ios:init` commands should each be used only once. Commit native project directories once generated and validated; never commit local build outputs, provisioning secrets, release keystores, or device-specific settings. App ID `ru.pografiku.app` is a **provisional identifier**. Confirm app ownership / store identifiers *before* first store submission.

## What works and what needs native follow-up

1. `scripts/build-web.mjs` copies public website pages and assets into `mobile/www`. It does **not** build the backend or deploy it. It intentionally excludes all SQL migrations, server code, workflow tokens and private files.
2. This first build keeps **email confirmation and password reset links on the verified public website** (`https://po-grafiku.ru/index.html`) instead of generating broken `capacitor://` / `https://localhost` links. Users complete these flows in their web browser; return-to-app deep links, associated domains and auth callback handling are **not implemented**. Employee invitation links also use the public website.
3. The browser/PWA and native WebView do not share browser session storage. Existing users retain their **server-side account and records**, but must sign in to each platform independently. The custom token in sessionStorage can be lost after WebView process restart; verify session persistence on actual devices before beta.
4. Supabase JS currently loads from a public CDN. Internet access is required for login and full functionality; this is **not** an offline-ready mobile app.
5. The app has no native push notifications, platform back-button integration, biometric login, universal links, or store-specific privacy/account deletion flow yet.
6. The mobile build is **not automatically updated** when the web site deploys. Rebuild/sync/release both mobile apps for new versions. Do not use `server.url` pointing to the live website as a production shortcut.

## Acceptance gates before native public beta

- Install on at least one real Android and iPhone, verify cold launch and restart.
- Verify Supabase API access from the native origins after explicitly deploying reviewed CORS changes.
- Owner and staff login; RBAC; shift assignment and unassignment; weekly/monthly payroll; support ticket creation and reply.
- Registration, email confirmation, password reset and staff invitation flows across web/native.
- Navigation, safe areas, keyboard, Android back button and accessibility.
- App links and deep links for email flows and account recovery; push permissions if push is included.
- Privacy policy, account deletion requests, app-store disclosures and data handling; no secret keys in bundled assets.
- Verify icons, splash and screenshots; obtain developer accounts and signing credentials without placing secrets in Git.
- Finalize stable application identifier, versioning and release workflow.

For details on Capacitor setup see https://capacitorjs.com/docs/getting-started.
