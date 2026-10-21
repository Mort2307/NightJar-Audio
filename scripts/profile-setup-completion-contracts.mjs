import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual shared TypeScript helper, not a duplicated test formula.
const tsSource=readFileSync('src/platform/profile-setup-state.ts','utf8');
const compiled=ts.transpileModule(tsSource,{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const {profileCompletionPercentage,isProfileSetupComplete}=await import(
  'data:text/javascript;base64,'+Buffer.from(compiled).toString('base64')
);

const rich={
  displayName:'QP',handle:'qpvoice',headline:'Voice Actor',
  bio:'I love to tell stories',welcomeMessage:'Welcome to my page',
  favouriteTags:['Romance'],favouriteCategories:['Audio drama'],avatarStatus:'approved',
  onboardingComplete:false,onboardingDraft:{displayName:'',handle:'',headline:''},
};
assert.equal(profileCompletionPercentage(rich),100,'QP-style legacy full profile is 100%');
assert.equal(isProfileSetupComplete(rich),true,'full legacy account does not need the welcome wizard');
assert.equal(isProfileSetupComplete({...rich,onboardingComplete:undefined}),true,'old flag missing is fine');
assert.equal(profileCompletionPercentage({...rich,avatarStatus:null}),88,'one missing field is incomplete');
assert.equal(isProfileSetupComplete({...rich,avatarStatus:null}),false,'incomplete profile retains resume option');
assert.equal(isProfileSetupComplete({onboardingComplete:true}),true,'completed wizard stays complete even with optional fields missing');
assert.equal(isProfileSetupComplete({onboardingDeferred:true,displayName:'New member'}),false,'deferred unfinished profile can resume');
assert.equal(isProfileSetupComplete(null),false,'new empty account can be onboarded');
assert.equal(profileCompletionPercentage({...rich,displayName:'   '}),88,'whitespace-only names cannot count as complete');

const app=readFileSync('src/App.tsx','utf8');
const wizard=readFileSync('src/components/NightjarOnboarding.tsx','utf8');
assert.match(app,/const completed = isProfileSetupComplete\(nextProfile\) \|\|/,'hydration skips wizard for full legacy profile');
assert.match(app,/const profileCompletion = profileCompletionPercentage\(profile\);/,'badge shares the same definition');
assert.match(app,/Boolean\(profileBaseline\) && !profileLoading && !isProfileSetupComplete\(profile\)/,'banner waits for loaded profile and hides once complete');
assert.match(wizard,/!isProfileSetupComplete\(initialProfile\)/,'stale draft cannot replace a completed profile');
assert.match(wizard,/typeof published === 'string' && published\.trim\(\)/,'saved published text wins over blank onboarding draft');
assert.match(wizard,/Array\.isArray\(published\) && published\.length/,'saved selections win over blank onboarding draft');
assert.match(wizard,/savedDraft\?\.stepIndex/,'incomplete onboarding still resumes at its saved step');
assert.match(wizard,/nightjarCommunity\.saveOnboardingDraft/,'existing cross-device resume remains intact');
console.log('NightJar completed legacy profile, setup banner and safe draft prefill regression checks passed.');
