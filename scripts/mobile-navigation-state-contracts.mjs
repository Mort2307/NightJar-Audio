import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Run the actual production functions, not an independently reimplemented
// formula. No browser, Firebase or authentication context is needed.
const source=readFileSync(new URL('../src/platform/mobile-navigation-state.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,
}}).outputText;
const {isMobileNavigationActive,activityAccessibleName,inboxAccessibleName}=await import(
  'data:text/javascript;base64,'+Buffer.from(compiled).toString('base64')
);

for(const view of ['settings','profile','calendar','protection']){
  assert.equal(isMobileNavigationActive(view,'settings'),true,
    'You is the visible/current destination when visiting '+view);
}
for(const view of ['discover','library','creators','messages','admin','writer','artist','editor','creator']){
  assert.equal(isMobileNavigationActive(view,'settings'),false,
    'You must not impersonate '+view);
}
assert.equal(isMobileNavigationActive('messages','messages'),true);
assert.equal(isMobileNavigationActive('admin','admin'),true);
assert.equal(isMobileNavigationActive('profile','messages'),false);
assert.equal(isMobileNavigationActive('discover','discover'),true);

assert.equal(activityAccessibleName('Activity and notifications',0),'Activity and notifications');
assert.equal(activityAccessibleName('Activity and notifications',1),'Activity and notifications. 1 unread notification.');
assert.equal(activityAccessibleName('Activity and notifications',14),'Activity and notifications. 14 unread notifications.');
assert.equal(activityAccessibleName('Activity and notifications',-1),'Activity and notifications');

const inbox='NightJar Inbox and creator replies';
assert.equal(inboxAccessibleName(inbox,0,0),inbox);
assert.equal(inboxAccessibleName(inbox,1,0),inbox+'. 1 unread message.');
assert.equal(inboxAccessibleName(inbox,13,0),inbox+'. 13 unread messages.');
assert.equal(inboxAccessibleName(inbox,0,1),inbox+'. 1 conversation needs your reply.');
assert.equal(inboxAccessibleName(inbox,0,3),inbox+'. 3 conversations need your reply.');
assert.equal(inboxAccessibleName(inbox,11,2),inbox+'. 11 unread messages. 2 conversations need your reply.');
assert.equal(inboxAccessibleName(inbox,-5,NaN),inbox);

const mobile=readFileSync(new URL('../src/components/MobileNavigation.tsx',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../src/components/RoleDashboard.tsx',import.meta.url),'utf8');
assert.match(mobile,/isMobileNavigationActive\(view, item\.view\)/);
assert.match(mobile,/activityAccessibleName\(baseLabel, activityUnreadCount\)/);
assert.match(mobile,/inboxAccessibleName\(baseLabel, messageUnreadCount, messageNeedsReplyCount\)/);
assert.match(mobile,/aria-current=\{active \? 'page' : undefined\}/,
  'active tab is announced when within its group');
assert.match(mobile,/aria-label=\{accessibleLabel\}/,'dynamic count info accompanies the tab');
assert.match(mobile,/className="nj-mobile-nav-icon" aria-hidden="true"/,
  'decorative badge text must not double-speak counts');
assert.match(mobile,/key=\{item\.view \?\? \(item\.activity \? 'activity' : 'search'\)\}/,
  'activity and search do not share a recycled tab identity');
assert.match(mobile,/Exactly five unique destinations/,
  'do not add a sixth tab for related Account views');
assert.match(dashboard,/actions\.length \? actions\.slice\(0,4\)/);
assert.match(dashboard,/loading \? <div className="nj-next-actions-clear" role="status" aria-live="polite">/,
  'pending workspace actions must show a loading state');
assert.match(dashboard,/You’re caught up\./,
  'no-action state must remain available AFTER data loads');
assert.doesNotMatch(source,/firebase|https?:\/\//i,
  'navigation labels are UI metadata and must not call external services');

console.log('Nightjar mobile account navigation, unread announcements and dashboard loading checks PASS.');
