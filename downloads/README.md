# Android beta download

Immutable public URL: https://po-grafiku.ru/downloads/po-grafiku-0.1-beta-debug.apk

This is the existing **development/test build**, not a production Android release.
The website buttons and installation guide prominently state this limitation.
Do not overwrite these bytes; publish later versions under new filenames.

## Provenance and checks (2026-10-29)

- Source: commit `00880c4a19ce5cd643a7145ad01f2962ba0f8103`, draft mobile PR #7.
- Successful Android Actions run: https://github.com/hromov21041990-ctrl/po-grafiku-v2/actions/runs/39738330989
- Original artifact ID: `12408276626`; archive SHA-256: `9c445610ec035e8d5c9cba497c754e2b64fec8619ebbb663fa179a234529a327` (matched GitHub artifact digest).
- APK SHA-256: `e436213c96a821b683c88966d5cf51367a7161c9a38dce820ba2a85f070717d2`; 4,240,425 bytes.
- APK v2 RSA/SHA-256 signature and complete APK content digest verified.
- Certificate: `CN=Android Debug,O=Android,C=US`; certificate SHA-256: `83eda7f482a95fc1e351ac0900964af2e8280eeebe7673c2d7ef162d49e1c255`.
- Manifest: package `ru.pografiku.app`, versionName `1.0`, versionCode `1`; project milestone is beta 0.1. Minimum SDK 24 (Android 7), target SDK 36.
- `debuggable=true`, `allowBackup=true`. Permissions: INTERNET and the app's own signature-protected DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION; no camera, microphone, location or contacts permissions.
- Every bundled application asset matches current production main `756f4cf3d680e82cbc37b52de00f12718134e2ec`, apart from the three reviewed confirmation/recovery URL rewrites in index/login that return to the public website. No server functions, migrations or service-role secrets are bundled by the asset allowlist.

## Remaining release gates

One user reported on 2026-10-30 that real-device login, schedule usage, shift assignment/removal, weekly and monthly payroll, session persistence after app close, admin role, and support ticket submission worked on an Android phone. This is user-reported manual testing, not independently verified; no device model, exact installed APK hash, or additional device and role coverage was provided. Native-origin backend support is not deployed. Confirmation/recovery returns to the website; native deep links are not implemented. Do not use this debug APK with real business data.

The original workflow uses npm install without a lockfile and floating Capacitor 8 ranges/action tags. Therefore a new run is not a reproducible rebuild of this exact APK. This publication preserves the verified original bytes instead of silently generating a different debug key or binary. Signature verification and source comparison are not a malware scan or a complete dependency security audit.

Before a production Android release: lock dependencies, review dependency advisories, pin build actions, disable debugging/backup as appropriate, use a protected persistent release signing key, and verify real-device acceptance. Do not disable Play Protect. Future releases may require removing this debug build first because its signing certificate will differ.

## Website deployment and rollback

GitHub Pages serves repository root on main. This change adds only public static pages/styles/downloads and offline checks. It does not merge mobile PR #7, deploy backend functions, change authentication configuration, or run database migrations. Revert the website PR to roll back the buttons/downloads. The iPhone guide is accessible without login and without JavaScript; PWA opens the existing index page via the existing manifest.
