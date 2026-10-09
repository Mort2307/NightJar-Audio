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

## Privacy

Lock-screen wording follows each user's Nightjar notification privacy mode:
- Full
- Discreet (default)
- Minimal

Push permission is independent from Terms of Use, Privacy Notice acknowledgement and marketing preferences.
