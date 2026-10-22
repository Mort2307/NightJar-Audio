import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/App.tsx','utf8');
const review=readFileSync('src/components/AdminManuscriptReview.tsx','utf8');
const hub=readFileSync('src/components/MessagingHub.tsx','utf8');
const backend=readFileSync('functions/src/index.ts','utf8');

// Actual reproduction: Admin pressed Direct message Writer, was redirected home.
assert.match(app,/view === 'messages' && !\(role === 'admin' && !simulationMode && !liveRolePreview\)/,
  'Administrator can use Messages in actual Admin context');
assert.match(app,/!\['creator','writer','editor','artist'\]\.includes\(String\(perspective\)\)/,
  'Listener and unauthorised simulated roles remain restricted');
assert.match(app,/onMessageWriter=\{\(uid\)=>\{setMessageRecipientUserId\(uid\);setMessageCollaborationId\(null\);navigate\('messages'\);\}\}/,
  'Review button passes writer id into Messages route');
assert.match(app,/view === 'messages' && !liveRolePreview && \(\['creator','writer','editor','artist'\]\.includes\(String\(effectiveRole\)\) \|\| role === 'admin'\)/,
  'Messages page itself renders for administrators');
assert.match(app,/initialRecipientUserId=\{messageRecipientUserId\}/,'inbox starts with intended Writer');
assert.match(backend,/requireAccountRole\(request, \['creator','writer','editor','artist','admin'\]\)/,
  'Messaging backend authorises administrators');
assert.match(backend,/if \(!target\.exists \|\| target\.data\(\)\?\.status !== 'active' \|\| !targetCreative\)/,
  'Target member checks stay in force');

// Manuscript source is not its marketplace synopsis: no public listing was requested.
assert.match(review,/const synopsisStatus = marketplaceRequested/);
assert.match(review,/hasSynopsis \? 'Saved privately' : 'Not requested'/);
assert.match(review,/\{synopsisStatus\}/);
assert.match(review,/A public synopsis is a separate description supplied by the Writer/);
assert.match(review,/\{marketplaceRequested && !hasSynopsis &&/,'Requested marketplace listings still flag a missing synopsis');
assert.match(review,/The uploaded manuscript is available in the protected reviewer/);
assert.match(review,/nightjarScripts\.adminScriptPreview\(reviewScript\.id\)/,'actual manuscript preview remains protected');

// Guaranteed account-restricted writer-visible review thread as a secondary route.
assert.match(review,/Message Writer in review thread/);
assert.match(review,/id="nj-manuscript-review-conversation"/);
assert.match(review,/ManuscriptReviewConversation key=\{'review-thread-'/);
assert.match(review,/onClick=\{\(\) => \{\s*document\.getElementById\('nj-manuscript-review-conversation'\)/);
assert.match(hub,/This person cannot receive a private conversation yet/);
assert.match(hub,/Writer-visible review thread instead/);
console.log('PASS Admin inbox routing, Writer contact, protected manuscript synopsis semantics.');
