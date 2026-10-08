# Nightjar Mail — Gmail API OAuth 2.0 setup

Nightjar Mail sends one independently addressed Gmail API message per recipient. It does not use group To fields, CC, BCC, or Gmail password/App Password SMTP authentication.

## Google Cloud setup

Use the Google Cloud project that will own Nightjar's Gmail integration.

1. Enable **Gmail API**.
2. Configure the OAuth consent screen.
3. Add `nightjar.audio.app@gmail.com` as a test user while the OAuth app remains in testing.
4. Request only:
   - `openid`
   - `email`
   - `https://www.googleapis.com/auth/gmail.send`
5. Create an OAuth 2.0 Client ID of type **Web application**.
6. Add this exact authorised redirect URI:

```
https://europe-west2-nightjar-audio.cloudfunctions.net/adminGmailOAuthCallback
```

## Firebase secrets

From the Nightjar project root:

```powershell
firebase functions:secrets:set NIGHTJAR_GMAIL_CLIENT_ID --project nightjar-audio
firebase functions:secrets:set NIGHTJAR_GMAIL_CLIENT_SECRET --project nightjar-audio
```

Enter the OAuth Web Client ID and Client Secret from Google Cloud. Never commit either value.

Deploy the functions and hosting:

```powershell
firebase deploy --only functions,hosting --project nightjar-audio
```

## Connect the Gmail account

1. Sign into Nightjar as an Administrator.
2. Open **Admin → Nightjar Mail**.
3. Press **Connect Gmail**.
4. Google should prompt for the Nightjar account. Authorise **nightjar.audio.app@gmail.com**.
5. Nightjar verifies the authorised Google identity before storing the refresh token.
6. The refresh token is stored only in the backend `systemIntegrations/gmail` document. Firestore client rules deny all direct reads and writes.
7. Return to Nightjar Mail. Status should show **CONNECTED**.

## Delivery guarantees

- One Gmail API `users.messages.send` call per recipient.
- One `To:` recipient per MIME message.
- No CC.
- No BCC.
- Successful deliveries are logged individually.
- Failed deliveries can be retried without resending successful messages.
- Nightjar resolves current account/tester email addresses server-side at send time.
- Manual test recipients never become members or live-audience recipients.

## Disconnect / recovery

Use **Disconnect** in Nightjar Mail to revoke the stored Google refresh token and clear Nightjar's Gmail connection. Use **Re-authorise Gmail** if Google revokes access or Nightjar reports that reconnection is required.

The legacy `NIGHTJAR_SMTP_USER` and `NIGHTJAR_SMTP_PASSWORD` secrets are no longer read by Nightjar Mail and may be removed from Firebase Secret Manager after the OAuth deployment is verified.
