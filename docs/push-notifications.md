# Nightjar push notifications

Nightjar uses Firebase Cloud Messaging (FCM) for device push.

## One-time Firebase setup

1. Open Firebase Console → Project settings → Cloud Messaging.
2. Under **Web Push certificates**, generate or copy the public VAPID key pair public key.
3. Add the public key to Nightjar's production Vite environment:

```
VITE_FIREBASE_VAPID_KEY=<PUBLIC_WEB_PUSH_CERTIFICATE_KEY>
```

The VAPID value used by the web client is a public key. Do not place unrelated private credentials in Vite environment variables.

## Deploy

Push touches Functions, Hosting and Storage rules:

```powershell
npm run typecheck
npm run build

cd functions
npm run check
npm run build
cd ..

firebase deploy --only functions,hosting,storage --project nightjar-audio
```

## Device test

1. Sign into Nightjar on the phone/device.
2. Open Profile → Notification preferences.
3. Press **Enable on this device**.
4. Accept the browser/OS notification permission.
5. Confirm the panel reports an active device.
6. Press **Send test push**.
7. Background/close the PWA/browser and repeat the test from another signed-in Nightjar session if needed.

Nightjar stores FCM device tokens only in the authenticated account's backend pushDevices collection. Invalid/unregistered tokens are automatically disabled after FCM rejects them.

## Sender mismatch: device registered but push fails

**Observed during Android PWA tester QA, 12 October 2026:** the device was marked active with notification permission granted, but a test push failed with `messaging/mismatched-credential`. This is a *delivery* failure, not a browser-permission failure. Firebase's documented cause is that the FCM sending project's credential/sender does not match the registration token's Firebase project. The client and Service Worker are configured for `nightjar-audio` / sender `981039114349`, but this alone does not prove that the saved token or runtime sending identity matches. An old cached FCM token or a mismatched sender credential/VAPID setup remains possible.

**Self-service repair (explicit action only):** Open **Profile → Notification preferences → Refresh status**. If this device's last FCM delivery error is `messaging/mismatched-credential`, Nightjar displays **REPAIR NEEDED** and a **Repair this device** button. This action verifies that the error applies to the currently signed-in user's saved device, revokes only that stored device identifier, clears the browser's cached FCM token, then explicitly obtains and registers a fresh token. Passive checks, login, and normal page refreshes never regenerate tokens or request notification permission. The previous token may be invalidated, so consent from the device owner is essential.

After repairing, press **Test this device only**, then background the app and confirm the notification arrives. A `sent` FCM response is only an acceptance signal, not confirmation of user-visible notification.

**If it still fails:** do not repeatedly refresh tokens. Inspect Firebase Console → project `nightjar-audio` → Project settings → Cloud Messaging to confirm the sender ID/project number and Web Push VAPID key match the production Vite environment; verify the Admin SDK's runtime project identity and that the Cloud Messaging API is enabled for the matching project. Do not paste VAPID private keys, service-account credentials, FCM registration tokens or user identifiers into tickets or chat. Public VAPID keys can be compared securely with console values, but screenshots should still exclude unrelated private account information.

The self-service repair is not a substitute for investigating an incorrect production messaging project or credential. When several *freshly* registered devices fail with the same mismatch, prioritize server/project configuration rather than asking every tester to re-enrol repeatedly.

## Privacy

Lock-screen wording follows each user's Nightjar notification privacy mode:
- Full
- Discreet (default)
- Minimal

Push permission is independent from Terms of Use, Privacy Notice acknowledgement and marketing preferences.
