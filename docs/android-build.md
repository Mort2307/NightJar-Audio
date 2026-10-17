# NightJar Android test builds

This is **optional build preparation**, not a production Android release.
NightJar's existing React/Vite/Firebase Hosting website continues working for
Safari/iPhone users and other browsers. Android and web share the same Firebase
accounts, data, content and administrative permissions. Your PC does not need
to remain switched on for either version to operate.

## Build a tester APK

1. Open **GitHub → Actions → NightJar Android test APK**.
2. Select **Run workflow** and the relevant branch.
3. Open the successful workflow run and download the artifact called
   **nightjar-android-debug-apk**.
4. Extract the archive, then install app-debug.apk on a trusted Android test
   phone. Android might require you to authorise that installation source.

The workflow runs automatically for pull requests touching the Android build
files, and otherwise only by manual dispatch. It does **not** publish NightJar
to Google Play, upload any Android package to Firebase, or change Firebase
Hosting. The debug APK is intended for internal testing only. GitHub Actions
runner usage can count against account quotas, particularly for private
repositories. No paid cloud build or third-party API is required.

## Screenshot protection

The workflow generates the native Android shell with Capacitor 8, then fails
closed unless it can apply Android's FLAG_SECURE to NightJar's MainActivity.
Android normally blocks screenshots and screen recording **inside NightJar's
native activity**. This does **not** report or log attempts. Nor can it prevent
external cameras, modified devices, captures of content opened in a separate
browser, or all other methods of obtaining content.

The web/PWA version remains available and retains its previous best-effort
security events; it is not given native screenshot blocking by this change.
In-app ID verification, authentication popups and external browser handoffs
need focused device testing because their external screens may differ.

## Before a production Play Store application

- On-device test sign-in and recovery, Google OAuth, age verification/Didit
  handoffs, Firebase authorisation, admin flows, push messages, audio playback
  in background and while the device is locked, accessibility, and transcript
  features. WebView origin and permission differences can break web flows.
- Replace template Android launcher and splash assets with proper NightJar
  artwork and validate the final package ID. The test identifier is
  com.nightjar.audio; confirm ownership before an irreversible store listing.
- Review Google Play policy on adult content, user-generated content, user
  safety, age assurance, subscriptions, direct payments, tokens, and privacy.
  Quinn's presence in the store is encouraging, but not a guarantee.
- Set up secure signing and generate a **release Android App Bundle (.aab)**.
  This workflow produces a debug-signed **APK** only, not a Play Store release.
- If using a new personal Play developer account, complete the required closed
  testing before requesting production publishing access.

Google Play documentation:
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/9859152
- https://capacitorjs.com/docs/getting-started

## Apple users

Keep Firebase Hosting enabled and the existing website/PWA deployed as usual.
Safari users continue using the website; no Apple developer payment is needed.
Native iOS can be assessed separately later.
