import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRoleCommitments, qualifiesForCreatorPool } from './commitment-eligibility';

test('one completed approved role is enough when another role is still in progress', () => {
  const result = qualifiesForCreatorPool([
    { role: 'writer', assigned: true, effective: true, tasks: [{ id: 'w1', mandatory: true, state: 'approved' }] },
    { role: 'creator', assigned: true, effective: true, tasks: [{ id: 'c1', mandatory: true, state: 'in_progress' }] },
  ]);
  assert.equal(result, true);
});

test('a role at 99 percent does not qualify', () => {
  const result = evaluateRoleCommitments({
    role: 'writer', assigned: true, effective: true,
    tasks: [
      { id: 'a', mandatory: true, state: 'approved' },
      { id: 'b', mandatory: true, state: 'submitted' },
    ],
  });
  assert.equal(result.completionPercent, 50);
  assert.equal(result.qualifies, false);
});

test('unassigned roles and empty assignments do not qualify by default', () => {
  assert.equal(evaluateRoleCommitments({ role: 'artist', assigned: false, effective: true, tasks: [] }).qualifies, false);
  assert.equal(evaluateRoleCommitments({ role: 'artist', assigned: true, effective: true, tasks: [] }).qualifies, false);
});

test('optional tasks do not prevent full mandatory completion', () => {
  const result = evaluateRoleCommitments({
    role: 'editor', assigned: true, effective: true,
    tasks: [
      { id: 'required', mandatory: true, state: 'approved' },
      { id: 'optional', mandatory: false, state: 'not_started' },
    ],
  });
  assert.equal(result.qualifies, true);
});


test('an approved exception without a documented reason cannot qualify', () => {
  const result = evaluateRoleCommitments({
    role: 'artist', assigned: true, effective: true, tasks: [],
    approvedException: true, exceptionReason: '',
  });
  assert.equal(result.qualifies, false);
});

test('an approved exception with an audit reason can qualify', () => {
  const result = evaluateRoleCommitments({
    role: 'artist', assigned: true, effective: true, tasks: [],
    approvedException: true, exceptionReason: 'Nightjar cancelled all assigned work',
  });
  assert.equal(result.qualifies, true);
  assert.equal(result.state, 'excused');
});
