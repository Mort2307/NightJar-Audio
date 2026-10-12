import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const server=read('functions/src/index.ts');
const client=read('src/platform/firebase-team-community.ts');
const ui=read('src/components/NightjarTeamCommunity.tsx');
const app=read('src/App.tsx');
const css=read('src/components/nightjar-team-community.css');

const section=(start,end)=>{
  const body=server.split(start)[1]?.split(end)[0];
  assert.ok(body,'Missing protected backend section: '+start);
  return body;
};

const list=section('export const listNightjarTeamUpdates = onCall','export const saveNightjarTeamUpdate = onCall');
assert.match(list,/await requireActiveIdentity\(request\)/);
assert.match(list,/await requireAgeVerified\(identity.uid\)/);
assert.match(list,/where\('status','==','published'\)/);
assert.match(list,/identity\.admin\?nightjarTeamFeedback\.limit/);
assert.match(list,/identity\.admin\|\|post.status==='published'/);
assert.match(list,/const inbox=identity.admin&&feedback/);
assert.doesNotMatch(list,/memberUserId:|updatedBy:|createdBy:|email:/,'No sensitive metadata in member feed response');
const publishing=section('export const saveNightjarTeamUpdate = onCall','export const submitNightjarTeamFeedback = onCall');
assert.match(publishing,/requireAdminIdentity\(request\)/,'Only a server-verified administrator may write team news');
assert.match(publishing,/const status=teamText\(input.status,24\)/);
assert.match(publishing,/\['draft','published','archived'\]/);
assert.match(publishing,/expectedRevision/,'Protect concurrent editor changes');
assert.match(publishing,/tx\.set\(ref,record,\{merge:true\}\)/);
const intake=section('export const submitNightjarTeamFeedback = onCall','export const reviewNightjarTeamFeedback = onCall');
assert.match(intake,/await requireActiveIdentity\(request\)/);
assert.match(intake,/await requireAgeVerified\(identity.uid\)/);
assert.match(intake,/now-Number\(prior.lastAtMs/,'Feedback must be rate-limited');
assert.match(intake,/if\(count>=10\)/,'Daily spam limit must exist');
assert.match(intake,/tx\.create\(feedbackRef/,'Feedback is private and created only through a transaction');
const review=section('export const reviewNightjarTeamFeedback = onCall','// NIGHTJAR TEAM COMMUNITY END');
assert.match(review,/requireAdminIdentity\(request\)/,'Feedback review must be admin-only');
assert.match(review,/status:'reviewed'/);
for(const name of ['listNightjarTeamUpdates','saveNightjarTeamUpdate','submitNightjarTeamFeedback','reviewNightjarTeamFeedback']){
  assert.ok(server.includes('export const '+name+' ='),'Missing function '+name);
  assert.ok(client.includes("'"+name+"'"),'Missing callable '+name);
}
assert.match(ui,/publicPosts|const published=posts.filter\(p=>p.status==='published'\)/,'Reader must not show drafts');
assert.match(ui,/readOnly\|\|demoMode/,'Demo and preview cannot write');
assert.match(ui,/Get a creator's permission before sharing personal details/);
assert.match(ui,/Your message stays private/);
assert.match(app,/const NightjarTeamCommunity = lazy/);
assert.match(app,/<NightjarTeamCommunity admin=\{canAdmin&&!liveRolePreview\} readOnly=\{liveRolePreview\|\|demoMode\}/);
assert.match(css,/--ivory/,'Respect active theme text colours');
console.log('Nightjar Team community publication, feedback and privacy contracts passed.');
