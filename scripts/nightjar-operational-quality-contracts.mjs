import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file=(p)=>readFileSync(p,'utf8');
const backend=file('functions/src/nightjar-quality.ts');
const backendIndex=file('functions/src/index.ts');
const portal=file('src/components/AccountPortal.tsx');
const onboarding=file('src/components/ProfessionalRoleManager.tsx');
const you=file('src/components/NightjarSettings.tsx');
const admin=file('src/components/AdminQualityCentre.tsx');
const workshop=file('src/components/ManualTranscriptSync.tsx');
const player=file('src/components/NightjarPlayer.tsx');
const creator=file('src/components/CreatorAudioPipeline.tsx');
const app=file('src/App.tsx');
const workflow=file('.github/workflows/firebase-hosting-merge.yml');
const ci=file('.github/workflows/nightjar-quality-candidate-ci.yml');
const requireText=(s,x,msg)=>assert.ok(s.includes(x),msg??'Missing '+x);
requireText(portal,'18+ VERIFICATION REQUIRED');
assert.ok(!portal.includes('Age assurance is temporarily disabled'),'Outdated age-bypass claim still visible');
requireText(backendIndex,'const DIDIT_VERIFICATION_PAUSED = false');
requireText(backendIndex,'const TESTING_AGE_ASSURANCE_BYPASS = false');
requireText(backendIndex,"buildNightjarQualityCallables(requireActiveIdentity,requireAdminIdentity,requireAgeVerified)");
for(const name of ['submitTesterFeedback','adminListTesterFeedback','adminReviewTesterFeedback','adminGetQualityAcceptance','adminRecordQualityCheck'])
  requireText(backend,name);
requireText(backend,"await requireAgeVerified(identity.uid)");
requireText(backend,"const identity=requireAdmin(request)");
requireText(backend,"tx.create(ref.collection('audit').doc()");
requireText(backend,"if(count>=5)");
requireText(backend,"status==='pass'&&evidence.length<20");
requireText(admin,"nightjarQuality.record(selected,decision,evidence.trim())");
requireText(admin,'Not measured');
requireText(admin,'Real admin queue count');
requireText(you,'<TesterFeedbackForm/>');
requireText(app,'<AdminQualityCentre');
requireText(app,'<ManualTranscriptSync label="Audio Editor');
requireText(app,'<ManualTranscriptSync label="Admin');
requireText(creator,'<ManualTranscriptSync key=');
requireText(creator,'transcriptAccessibilityReviewed:false');
requireText(workshop,'navigator.clipboard.writeText');
requireText(workshop,'URL.createObjectURL(file)');
requireText(workshop,'URL.revokeObjectURL');
requireText(workshop,'No AI, no third-party services');
requireText(player,'transcriptFollowPlayback');
requireText(player,'activeTranscriptCueId');
requireText(onboarding,'How professional approval works');
requireText(onboarding,'No automatic acceptance or guaranteed review time');
requireText(workflow,'Deploy Quality Centre callables before Hosting');
requireText(workflow,"if grep -Eq '^firestore.indexes.json$'");
assert.ok(!workflow.includes('src/components/VerifiedCreditWorkspace.tsx|src/platform/verified-credit.ts|firestore.indexes.json|src/App.tsx'),'Frontend should not trigger backend redeploy');
requireText(ci,'NO production deployments');
requireText(ci,'npm run validate');
requireText(ci,'npm run build');
requireText(ci,'nightjar-quality-callable-emulator.mjs');
requireText(file('scripts/nightjar-quality-callable-emulator.mjs'),'buildNightjarQualityCallables');
const writerRights=file('src/components/WriterRightsPanel.tsx');
const writerStyles=file('src/components/writer-submission-guide.css');
const controlledDidit=file('src/platform/firebase-didit-controlled.ts');
requireText(app,"I've finished Didit — sync my existing approval");
requireText(app,"nightjarDiditControlled.reconcile()");
requireText(app,"const recoverCompletedDiditDecision = async (silent = false) => {");
requireText(app,"No new verification has been started");
requireText(app,"Checking your NightJar access and current privacy notice");
requireText(controlledDidit,"reconcileMyDiditVerification");
requireText(writerRights,"JUST THREE ESSENTIALS");
requireText(writerRights,"Required declarations · 2 to complete");
requireText(writerRights,"nj-writer-advanced-rights");
requireText(writerRights,"!rights.ownershipAttested || !rights.contributorPermissionsConfirmed");
requireText(writerRights,"script.sourceFile?.fileName");
requireText(writerStyles,".nj-writer-essential-steps");
requireText(app,"nj-writer-create-steps");
requireText(app,"nj-writer-optional-art");
requireText(app,'nj-writer-simple-step');
requireText(app,'nj-writer-secondary-actions');
requireText(app,'Didit approved you, but NightJar hasn\'t updated?');
requireText(app,"document.addEventListener('visibilitychange',checkExisting)");
requireText(app,'diditRecoveryLock.current');
requireText(app,'now-diditLastSafeCheck.current<45000');
requireText(backendIndex,"'PENDING','PROCESSING','IN_PROGRESS','RESUBMITTED','PENDING_REVIEW'");
assert.ok(!app.includes('Approved QA accounts can use restricted temporary test access until the production age-assurance provider is live'),
  'Old beta verification notice must not remain in the entry page');
assert.ok(!app.includes('Testing build: age assurance is not globally bypassed.'),
  'Old beta bypass account copy must not remain in the entry page');
// Recovery can inspect the existing provider decision but must never start a paid check.
const recoveryHandler=app.slice(
  app.indexOf('const recoverCompletedDiditDecision = async'),
  app.indexOf('const beginAgeVerificationFromGate = async')
);
assert.ok(!recoveryHandler.includes('openAgeCheck(') && !recoveryHandler.includes('nightjarAge.start('),
  'Recovery handler must never create a new Didit session');
console.log('PASS: NightJar operational release candidates, mandatory live Didit, human acceptance, private feedback, manual sync and backend-first cost guard.');
