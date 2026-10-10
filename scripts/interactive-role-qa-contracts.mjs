import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const manager = fs.readFileSync('src/components/ProfessionalRoleManager.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
const check = (source, needle, why) => assert.ok(source.includes(needle), why);

check(app, "onClick={() => startSimulation(option.id)}", 'Owner View as must open a functional isolated role, not sparse public directory');
check(app, "const interactiveRoleTest = role === 'admin' && simulationMode && Boolean(previewRole);", 'Role QA requires an authenticated administrator');
check(app, "role === 'admin' && Boolean(previewRole) && !simulationMode && !demoMode", 'Live read-only mode must stay separate from interactive mock');
check(app, "Live public data (read-only)", 'The user can still inspect actual public Firebase content');
check(app, "INTERACTIVE {previewRole ? roleMeta[previewRole].label.toUpperCase()", 'QA must be visibly labelled');
check(app, "nightjar-role-qa-banner", 'Always show clear QA context');
check(app, "simulationMode={interactiveRoleTest}", 'Multi-role manager must receive explicit sandbox mode');
// Match the guarded handler structurally: Windows Git may check out CRLF line endings.
assert.match(
  app,
  /onRoleChanged=\{\(nextRole\)\s*=>\s*\{[\s\S]*?if\s*\(interactiveRoleTest\)\s*\{\s*setPreviewRole\(next\);\s*navigate\([\s\S]*?\);\s*return;\s*\}\s*setRole\(next\);/,
  'Role switches never overwrite the actual administrator account role',
);
check(app, "if (!interactiveRoleTest || !user?.userId || !ageVerified) return;", 'Simulated profile hydration requires authenticated owner and real QA flag');
check(app, "if (!user?.userId || (canAdmin && !simulationMode)) return;", 'My Roles must be usable only by genuine members or the explicit owner sandbox');
check(app, "view === 'profile' && profileRolesPage && (!canAdmin || interactiveRoleTest)", 'Member role application page must open in QA');
check(app, "if (!demoMode) { resetDemo(); productLoadEpoch.current++; }", 'Fresh QA session must isolate fictional local records');
for (const field of ["simulationMode?: boolean", "initialRole?: 'listener' | NightjarProfessionalRole", "writeDemo('professionalRoleQa', next)", "if (simulationMode) {", "Simulate approval", "onRoleChanged?.(role)"]) {
  check(manager, field, 'Missing interactive local My Roles action: ' + field);
}
for (const remoteCall of [
  "await nightjarLegal.accept(",
  "await nightjarAccount.applyForProfessionalRoles(",
  "await nightjarAccount.removeProfessionalRole(",
  "await nightjarAccount.setActiveRole(",
]) {
  check(manager, remoteCall, 'Real member workflows must remain intact: ' + remoteCall);
}
check(css, ".nightjar-role-qa-banner", 'QA requires a distinct safety banner');
assert.ok(!app.includes("onClick={() => setRole(option.id)}"), 'Never grant or impersonate a member role from Owner View as');
console.log('Nightjar interactive owner role-QA navigation, isolated multi-role lifecycle, and non-impersonation contracts PASS (source-level only).');
