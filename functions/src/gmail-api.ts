export type GmailMessage = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
};

export type GoogleOAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

const cleanHeader = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

const encodeHeader = (value: string) => {
  const cleaned = cleanHeader(value);
  return /^[\x20-\x7E]*$/.test(cleaned)
    ? cleaned
    : '=?UTF-8?B?' + Buffer.from(cleaned, 'utf8').toString('base64') + '?=';
};

const encodeBody = (value: string) => {
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  return encoded.match(/.{1,76}/g)?.join('\r\n') ?? '';
};

const formatAddress = (emailValue: string, nameValue?: string | null) => {
  const email = cleanHeader(emailValue);
  const name = cleanHeader(nameValue);
  return name ? '"' + name.replace(/"/g, '\\"') + '" <' + email + '>' : '<' + email + '>';
};

const toBase64Url = (value: string) => Buffer
  .from(value, 'utf8')
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

export const buildGmailRawMessage = (
  fromEmail: string,
  fromName: string,
  replyTo: string | null,
  message: GmailMessage,
) => {
  const boundary = 'nightjar_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  const headers = [
    'From: ' + formatAddress(fromEmail, fromName),
    'To: ' + formatAddress(message.toEmail, message.toName),
    'Subject: ' + encodeHeader(message.subject),
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    ...(replyTo ? ['Reply-To: ' + formatAddress(replyTo)] : []),
  ];

  const body = [
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(message.text),
    '--' + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(message.html),
    '--' + boundary + '--',
    '',
  ].join('\r\n');

  return toBase64Url([...headers, '', body].join('\r\n'));
};

const parseGoogleTokenResponse = async (response: Response) => {
  const data = await response.json().catch(() => ({})) as GoogleOAuthTokenResponse;
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || ('HTTP ' + response.status);
    throw new Error('Google OAuth token request failed: ' + detail);
  }
  return data;
};

export const exchangeGoogleAuthorizationCode = async (input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) => {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return parseGoogleTokenResponse(response);
};

export const refreshGoogleAccessToken = async (input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) => {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  return parseGoogleTokenResponse(response);
};

export const sendGmailApiMessage = async (input: {
  accessToken: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  message: GmailMessage;
}) => {
  const raw = buildGmailRawMessage(
    input.fromEmail,
    input.fromName,
    input.replyTo ?? null,
    input.message,
  );

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + input.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error && typeof data.error === 'object'
      ? data.error as Record<string, unknown>
      : null;
    const message = String(error?.message ?? ('HTTP ' + response.status));
    throw new Error('Gmail API send failed: ' + message);
  }

  return {
    id: String(data.id ?? ''),
    threadId: String(data.threadId ?? ''),
  };
};

export const revokeGoogleToken = async (token: string) => {
  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) {
    throw new Error('Google token revocation failed: HTTP ' + response.status);
  }
};


export const getGoogleUserInfo = async (accessToken: string) => {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error('Google account verification failed: HTTP ' + response.status);
  }
  return {
    email: String(data.email ?? '').trim().toLowerCase(),
    emailVerified: data.email_verified === true,
    subject: String(data.sub ?? ''),
  };
};


export const getGoogleTokenInfo = async (accessToken: string) => {
  const response = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken),
  );
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error('Google token inspection failed: HTTP ' + response.status);
  }
  const scope = String(data.scope ?? '').trim();
  return {
    scope,
    scopes: scope.split(/\s+/).filter(Boolean),
    expiresIn: Number(data.expires_in ?? 0),
    audience: String(data.aud ?? ''),
  };
};
