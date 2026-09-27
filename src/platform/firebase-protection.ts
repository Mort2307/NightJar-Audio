import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const eventCall = httpsCallable<Record<string, unknown>, { recorded: boolean; evidenceId: string; alert?: any }>(functions, 'recordProtectionEvent');
const evidenceCall = httpsCallable<void, { evidence: any[] }>(functions, 'listProtectionEvidence');
const reportsCall = httpsCallable<void, { reports: any[] }>(functions, 'listProtectionReports');
const adminReportsCall = httpsCallable<void, { reports: any[] }>(functions, 'listAdminProtectionReports');
const submitReportCall = httpsCallable<{ category: string; summary: string }, { report: any }>(functions, 'submitProtectionReport');
const alertsCall = httpsCallable<void, { alerts: any[] }>(functions, 'listSecurityAlerts');
const suspendCall = httpsCallable<{ alertId: string }, { suspended: boolean; revokedReaderSessions: number }>(functions, 'suspendFromSecurityAlert');
const revokeCall = httpsCallable<{ alertId: string }, { revoked: boolean; userId: string; revokedReaderSessions: number }>(functions, 'revokeSessionsFromSecurityAlert');
const benignCall = httpsCallable<{ alertId: string; note?: string }, { closed: boolean }>(functions, 'closeSecurityAlertBenign');

export const nightjarProtection = {
  async record(input: Record<string, unknown>) {
    return (await eventCall(input)).data;
  },

  async evidence() {
    return (await evidenceCall()).data;
  },

  async reports() {
    return (await reportsCall()).data;
  },

  async adminReports() {
    return (await adminReportsCall()).data;
  },

  async submitReport(category: string, summary: string) {
    return (await submitReportCall({ category, summary })).data;
  },

  async alerts() {
    return (await alertsCall()).data;
  },

  async suspend(alertId: string) {
    return (await suspendCall({ alertId })).data;
  },

  async revokeSessions(alertId: string) {
    return (await revokeCall({ alertId })).data;
  },

  async closeBenign(alertId: string, note = '') {
    return (await benignCall({ alertId, note })).data;
  },
};
