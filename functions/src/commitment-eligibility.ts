export type CommitmentTaskState = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'excused' | 'cancelled';

export type CommitmentTask = {
  id: string;
  mandatory: boolean;
  state: CommitmentTaskState;
};

export type RoleCommitmentAssessment = {
  role: 'creator' | 'writer' | 'editor' | 'artist';
  assigned: boolean;
  effective: boolean;
  tasks: CommitmentTask[];
  approvedException?: boolean;
  exceptionReason?: string | null;
};

export type CommitmentRoleResult = {
  role: RoleCommitmentAssessment['role'];
  assigned: boolean;
  applicableMandatoryCount: number;
  completedMandatoryCount: number;
  completionPercent: number | null;
  qualifies: boolean;
  state: 'not_assigned' | 'not_effective' | 'complete' | 'incomplete' | 'excused';
};

/**
 * Evaluates one role for one already-selected assessment period.
 * Period selection, assignment permissions and evidence review belong to
 * trusted backend workflows; this helper only evaluates supplied states.
 */
export const evaluateRoleCommitments = (assessment: RoleCommitmentAssessment): CommitmentRoleResult => {
  if (!assessment.assigned) {
    return { role: assessment.role, assigned: false, applicableMandatoryCount: 0, completedMandatoryCount: 0, completionPercent: null, qualifies: false, state: 'not_assigned' };
  }
  if (!assessment.effective) {
    return { role: assessment.role, assigned: true, applicableMandatoryCount: 0, completedMandatoryCount: 0, completionPercent: null, qualifies: false, state: 'not_effective' };
  }
  if (assessment.approvedException) {
    return { role: assessment.role, assigned: true, applicableMandatoryCount: 0, completedMandatoryCount: 0, completionPercent: 100, qualifies: true, state: 'excused' };
  }

  const mandatory = assessment.tasks.filter((task) => task.mandatory && task.state !== 'cancelled' && task.state !== 'excused');
  const completed = mandatory.filter((task) => task.state === 'approved');
  const completionPercent = mandatory.length === 0 ? 100 : Math.floor((completed.length / mandatory.length) * 10000) / 100;
  const qualifies = mandatory.length > 0 && completed.length === mandatory.length;

  return {
    role: assessment.role,
    assigned: true,
    applicableMandatoryCount: mandatory.length,
    completedMandatoryCount: completed.length,
    completionPercent,
    qualifies,
    state: qualifies ? 'complete' : 'incomplete',
  };
};

export const qualifiesForCreatorPool = (assessments: RoleCommitmentAssessment[]) =>
  assessments.some((assessment) =>
    ['creator', 'writer', 'editor', 'artist'].includes(assessment.role) &&
    evaluateRoleCommitments(assessment).qualifies,
  );
