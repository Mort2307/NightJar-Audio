// Run once in the Nightjar repository: node scripts/apply-didit-integration.mjs
// Re-runnable and fails closed if a source anchor has changed.
import fs from 'node:fs';

const patch = (file, task) => {
  const original = fs.readFileSync(file, 'utf8');
  const updated = task(original);
  if (updated !== original) {
    fs.writeFileSync(file, updated);
    console.log('Updated', file);
  } else {
    console.log('Already up to date', file);
  }
};
const replace = (body, before, after, label) => {
  if (after && body.includes(after)) return body;
  const count = body.split(before).length - 1;
  if (count === 0 && (after === '' || body.includes(after))) return body;
  if (count !== 1) throw new Error(label + ': expected one anchor, found ' + count);
  return body.replace(before, after);
};
const replaceAll = (body, before, after) => body.split(before).join(after);

patch('functions/src/index.ts', source => {
  let s = source;
  s = replace(s,
    "import { exchangeGoogleAuthorizationCode, getGoogleTokenInfo, getGoogleUserInfo, refreshGoogleAccessToken, revokeGoogleToken, sendGmailApiMessage } from './gmail-api';",
    "import { exchangeGoogleAuthorizationCode, getGoogleTokenInfo, getGoogleUserInfo, refreshGoogleAccessToken, revokeGoogleToken, sendGmailApiMessage } from './gmail-api';\nimport { DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT, diditConfigured, diditMode, diditPass, startDiditSession } from './didit';\nexport { diditWebhook, processDiditWebhook } from './didit';",
    'Didit backend export');
  s = replace(s, "const AGE_ASSURANCE_CONFIGURED = false;\n", '', 'remove retired age provider flag');
  s = replaceAll(s, 'TESTING_AGE_ASSURANCE_BYPASS && !AGE_ASSURANCE_CONFIGURED', 'TESTING_AGE_ASSURANCE_BYPASS');
  s = replace(s, 'if (!TESTING_AGE_ASSURANCE_BYPASS || AGE_ASSURANCE_CONFIGURED) {',
    'if (!TESTING_AGE_ASSURANCE_BYPASS) {', 'test-access control');
  s = replace(s,
    "const persistentVerified = data?.verified === true && data?.testMode !== true && data?.provider !== 'admin-test';",
    'const persistentVerified = diditPass(data);', 'server access gate');
  const a = s.indexOf('export const ageStatus = onCall(');
  const b = s.indexOf('\nexport const adminAgeTestPass =', a);
  if (a < 0 || b < 0) throw new Error('Age callable endpoints not found');
  if (!s.slice(a, b).includes('startDiditSession(')) {
    s = s.slice(0, a) + `export const ageStatus = onCall({
  region: REGION, secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
}, async request => {
  const identity = await requireActiveIdentity(request);
  const data = (await db.collection('ageAssurance').doc(identity.uid).get()).data() ?? {};
  const persistentlyVerified = diditPass(data);
  const bypass = persistentlyVerified ? { allowed: false, reason: null as string | null } : await temporaryAgeBypassFor(identity.uid);
  return {
    verified: persistentlyVerified || bypass.allowed,
    status: persistentlyVerified || bypass.allowed ? 'COMPLETE' : String(data.status ?? 'NOT_STARTED'),
    ageThreshold: 18,
    configured: diditConfigured(),
    provider: persistentlyVerified ? 'didit' : bypass.allowed ? 'temporary-test-access' : 'didit',
    environment: persistentlyVerified ? 'live' : bypass.allowed ? 'development' : diditMode(),
    verifiedAt: persistentlyVerified ? toIso(data.verifiedAt) : null,
    reverifyRequired: data.reverifyRequired === true,
    sessionActive: ['PENDING','IN_PROGRESS','PENDING_REVIEW','CREATING','RESUBMITTED'].includes(String(data.status ?? '')),
    temporaryBypass: bypass.allowed,
    temporaryBypassReason: bypass.reason,
    testAvailable: identity.admin || bypass.allowed,
  };
});

export const startAgeAssurance = onCall({
  region: REGION, secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
}, async request => {
  const identity = await requireActiveIdentity(request);
  const record = (await db.collection('ageAssurance').doc(identity.uid).get()).data() ?? {};
  if (diditPass(record)) return { verified: true, status: 'COMPLETE', configured: true, provider: 'didit', environment: 'live' };
  if (diditConfigured()) return startDiditSession(identity.uid);
  const bypass = await temporaryAgeBypassFor(identity.uid);
  if (bypass.allowed) return {
    verified: true, status: 'COMPLETE', configured: false,
    provider: 'temporary-test-access', environment: 'development',
    temporaryBypass: true, temporaryBypassReason: bypass.reason,
  };
  throw new HttpsError('failed-precondition', 'Didit verification is not configured.');
});
` + s.slice(b);
  }
  s = replaceAll(s, 'ageAssuranceConfigured: AGE_ASSURANCE_CONFIGURED',
    "ageAssuranceConfigured: false /* use ageStatus for Didit configuration */");
  s = replaceAll(s, 'ageAssurance.data()?.verified === true', 'diditPass(ageAssurance.data())');
  s = replaceAll(s, 'ageAssuranceSnapshot.data()?.verified !== true', '!diditPass(ageAssuranceSnapshot.data())');
  // Additional references can exist in newer Nightjar code. Replace this retired
  // static flag with a Didit runtime check instead of breaking the entire installer.
  if (s.includes('AGE_ASSURANCE_CONFIGURED')) {
    const remaining = s.split('\n')
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter(entry => entry.text.includes('AGE_ASSURANCE_CONFIGURED'));
    console.warn('Updating additional legacy age-configuration references:', remaining);
    s = s.replace(/\bAGE_ASSURANCE_CONFIGURED\b/g, 'diditConfigured()');
  }
  if (s.includes('AGE_ASSURANCE_CONFIGURED')) {
    throw new Error('Legacy age-provider configuration could not be retired.');
  }
  return s;
});

patch('functions/src/nightjars.ts', source => {
  let s = source;
  s = replace(s, "import { onSchedule } from 'firebase-functions/v2/scheduler';",
    "import { onSchedule } from 'firebase-functions/v2/scheduler';\nimport { diditPass } from './didit';",
    'Nightjar gift verification import');
  s = replace(s,
    'if (age.data()?.verified !== true && !temporaryTestAccess) {',
    'if (!diditPass(age.data()) && !temporaryTestAccess) {',
    'Nightjar gift verification guard');
  return s;
});

patch('src/platform/firebase-age.ts', source => {
  let s = source;
  s = replace(s, '  testAvailable: boolean;', '  testAvailable: boolean;\n  sessionActive?: boolean;', 'age status result');
  return s;
});

patch('src/App.tsx', source => {
  let s = source;
  s = replace(s, "const [ageProvider, setAgeProvider] = useState('yoti-sandbox');",
    "const [ageProvider, setAgeProvider] = useState('didit');", 'frontend provider');
  s = replace(s, "const [ageEnvironment, setAgeEnvironment] = useState<'sandbox' | 'production'>('sandbox');",
    "const [ageEnvironment, setAgeEnvironment] = useState<'sandbox' | 'live'>('sandbox');", 'frontend environment');
  s = replace(s, 'const [ageSessionActive, setAgeSessionActive] = useState(false);',
    "const [ageSessionActive, setAgeSessionActive] = useState(false);\n  const [ageLaunchUrl, setAgeLaunchUrl] = useState<string | null>(null);",
    'reopen verification link');
  s = replaceAll(s, "setAgeEnvironment(data.environment === 'production' ? 'production' : 'sandbox');",
    "setAgeEnvironment(data.environment === 'live' ? 'live' : 'sandbox');");
  s = replace(s, 'setAgeSessionActive(false);\n      setAgeStatus(data.status ===',
    'setAgeSessionActive(data.sessionActive === true);\n      setAgeStatus(data.status ===',
    'pending status');
  s = replace(s,
    "data.status === 'PENDING' || data.status === 'PROCESSING' || data.status === 'IN_PROGRESS'",
    "data.status === 'PENDING' || data.status === 'PROCESSING' || data.status === 'IN_PROGRESS' || data.status === 'PENDING_REVIEW' || data.status === 'CREATING' || data.status === 'RESUBMITTED'",
    'pending status values');
  s = replace(s, '      } else if (data.launchUrl) {\n        setAgeStatus(\'PENDING\');',
    "      } else if (data.launchUrl) {\n        setAgeLaunchUrl(String(data.launchUrl));\n        setAgeStatus('PENDING');",
    'verification launch link');
  s = replace(s, "setAgeProvider('yoti-sandbox');", "setAgeProvider('didit');", 'signout provider reset');
  s = replace(s, "ageProvider === 'yoti' ? 'Yoti Age Verification' : 'Yoti Age Verification · Sandbox'",
    "ageProvider === 'didit' ? 'Didit Age Verification' : 'Nightjar Private Testing'",
    'Didit branding');
  s = replaceAll(s, 'Yoti verification', 'Didit verification');
  s = replaceAll(s, 'Yoti verified', 'Didit verified');
  s = replace(s, "          <p className=\"access-fine\">{ageTemporaryBypass ?",
    "          {ageLaunchUrl && !ageVerified && <p className=\"access-fine\"><a href={ageLaunchUrl} target=\"_blank\" rel=\"noopener noreferrer\">Open / resume Didit verification</a></p>}\n          <p className=\"access-fine\">{ageTemporaryBypass ?",
    'verification link fallback');
  return s;
});

patch('firebase.json', source => {
  let s = source;
  const needle = '    "rewrites": [\n';
  const newEntry = '    "rewrites": [\n      {\n        "source": "/api/webhooks/didit",\n        "function": { "functionId": "diditWebhook", "region": "europe-west2" }\n      },\n';
  s = replace(s, needle, newEntry, 'Firebase webhook rewrite');
  return s;
});

patch('scripts/launch-readiness.mjs', source => {
  let s = source;
  s = replace(s,
    "const ageAssuranceConfigured = /const AGE_ASSURANCE_CONFIGURED\\s*=\\s*true/.test(backend);",
    "const diditIntegrationWired = backend.includes('startDiditSession(identity.uid)') && backend.includes('diditPass(data)');\nconst liveConfigAcknowledged = process.env.DIDIT_LIVE_CONFIG_ACK === 'yes';",
    'launch verification guard');
  s = replace(s,
    "if (!ageAssuranceConfigured) {\n  failures.push('Production age assurance is not configured. AGE_ASSURANCE_CONFIGURED must be true only after the live provider is genuinely configured.');\n}",
    "if (!diditIntegrationWired) failures.push('Didit session and age-status functions are not wired.');\nif (!liveConfigAcknowledged) failures.push('Confirm the live Didit workflow, webhook, age threshold and production secrets: DIDIT_LIVE_CONFIG_ACK=yes npm run validate:launch');",
    'launch readiness');
  s = replace(s, "console.log('✓ Production age assurance configured.');",
    "console.log('✓ Didit integration wired and operator attestation supplied.');",
    'launch success');
  return s;
});
console.log('Didit integration changes applied. Review git diff, run tests and deploy after secrets are configured.');
