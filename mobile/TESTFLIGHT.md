# TestFlight release: «По графику» for iPhone

**Status: prepared, not published.** The iOS Simulator app is **not** an installable iPhone build. The separate, manual GitHub Actions workflow `.github/workflows/mobile-ios-testflight.yml` will produce a signed device IPA and upload it to App Store Connect when the Apple account and signing credentials are configured. Neither signing credentials nor an App Store app record are provisioned by this repository.

## 1. Apple account ownership

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/) under the business owner or the company as appropriate. Membership fees/verification belong to Apple. Never send an Apple ID password, private key or signing certificate through a support chat.
2. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) register the explicit iOS bundle ID `ru.pografiku.app`. **Confirm that this exact identifier belongs to the intended organization before uploading anything.** Changing it after store launch creates a different app.
3. In [App Store Connect](https://appstoreconnect.apple.com/) create an iOS app record called **По графику** for the same bundle ID. Apple must approve processing before it appears in TestFlight.
4. Under Certificates, create an **Apple Distribution** signing certificate (export it along with its private key in a password-protected `.p12` via Keychain Access / Xcode). Create an **App Store Connect** distribution provisioning profile for that bundle ID and certificate. Its profile name must match the CI secret below.
5. Generate an **App Store Connect API key** with suitable rights in App Store Connect and retain its `.p8`, key ID and issuer ID securely.

## 2. GitHub encrypted secrets

Go to the project repository → **Settings → Secrets and variables → Actions**, or put the same secrets in a protected **testflight** environment (Settings → Environments). To prevent unintended uploads, configure environment approval rules if available. Do NOT commit keys or share their content in a chat.

| Secret | Value |
| --- | --- |
| `IOS_APPLE_TEAM_ID` | Your Apple developer Team ID |
| `IOS_DISTRIBUTION_PROFILE_NAME` | Exact App Store provisioning profile name |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64 of Apple Distribution `.p12` file |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used for exported `.p12` |
| `IOS_DISTRIBUTION_PROFILE_BASE64` | Base64 of downloaded App Store `.mobileprovision` |
| `IOS_ASC_API_KEY_BASE64` | Base64 of App Store Connect API `.p8` private key |
| `IOS_ASC_KEY_ID` | App Store Connect API key ID |
| `IOS_ASC_ISSUER_ID` | App Store Connect API issuer ID |

On macOS, produce base64 text **locally** with `base64 -i filename.p12 | tr -d '\\n'` (repeat for `.p8` and `.mobileprovision`). Keep the originals and passwords in a secure vault, not the project.

## 3. Run release only after technical checks pass

1. The workflow has `workflow_dispatch` only: it **does not release on every commit**. GitHub normally exposes manual workflows when the workflow YAML has been introduced to the **default branch**. The current draft PR is not yet ready for merge. Once reviewed and merged, open **Actions → Publish signed iOS app to TestFlight → Run workflow**.
2. The job generates the native iOS project, inserts our current icon, imports credentials into an ephemeral macOS keychain, builds an App Store archive, exports an IPA and uploads it with Apple's `altool`.
3. After successful upload, open App Store Connect → My Apps → По графику → TestFlight and wait for Apple's processing; complete beta compliance and invite an internal tester using their Apple Account. Uploading an IPA alone does not install it and doesn't create a public App Store listing.
4. On the iPhone, install Apple's **TestFlight** from the App Store, accept the invitation, then install **По графику** from TestFlight.

## Before actually inviting testers

- Native CORS origins `capacitor://localhost` / `https://localhost` must be reviewed and deployed to the correct Supabase Edge Functions. **They are only changed in source right now.**
- Verify existing owner and employee credentials, permissions, shift assignment/removal, payroll and support tickets on a real iPhone. The online login flow still requires an Internet connection.
- Email verification, password reset and employee invite links currently open the public website. Add Universal Links / Associated Domains and native auth handoff before a production release.
- Validate privacy and account deletion, Apple review notes, screenshot requirements and WebView-native utility. Users' existing data remains in Supabase; they need to sign in separately on the native app.
- This version is an early beta. Do not publish to the App Store or invite external testers before these checks.

Reference: [Apple's official upload steps](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds) and [Apple's provisioning profile guide](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile).
