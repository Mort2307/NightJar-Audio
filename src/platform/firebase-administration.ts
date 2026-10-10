import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';
import { repairMojibakeDisplayData } from './text-integrity';

const functions = getFunctions(firebaseApp, 'europe-west2');

const overviewCall = httpsCallable<void, { people: any }>(functions, 'adminAccountOverview');
const setRoleCall = httpsCallable<{ userId: string; role: 'listener' | 'creator' | 'writer' | 'editor' | 'artist'; status: 'active' | 'pending_review' | 'suspended' }, { userId: string; role: string; status: string }>(functions, 'adminSetAccountRole');
const setClosedBetaTesterCall = httpsCallable<{ email: string; enabled: boolean; note?: string }, { email: string; enabled: boolean; matchedAccounts: number }>(functions, 'adminSetClosedBetaTester');
const setTestAccessCall = httpsCallable<{ userId: string; enabled: boolean }, { userId: string; testAccess: boolean }>(functions, 'adminSetTestAccess');
const professionalBankCall = httpsCallable<void, { applications: any[]; buckets: Record<string, number>; total: number }>(functions, 'listProfessionalApplicationBank');
const retryApprovalEmailCall = httpsCallable<{ userId: string; eventId: string }, { userId: string; eventId: string; outcome: 'sent' | 'failed' }>(functions, 'adminRetryProfessionalApprovalEmail');
const reviewProfessionalCall = httpsCallable<{
  userId: string;
  decision: 'banked' | 'approved' | 'rejected' | 'waitlist';
  roles?: ('creator' | 'writer' | 'editor' | 'artist')[];
  wave?: string;
}, {
  userId: string;
  decision: string;
  approvedProfessionalRoles: string[];
  pendingProfessionalRoles: string[];
  activeRole: string;
  applicationStatus: string;
  wave: string | null;
}>(functions, 'reviewProfessionalApplication');

export type AdminEmailAudience = 'all_professionals' | 'creator' | 'writer' | 'editor' | 'artist' | 'all_testers' | 'all_members';
export type AdminEmailCategory = 'testing_update' | 'creator_operations' | 'account_service';

export type AdminGmailOAuthStatus = {
  configured: boolean;
  connected: boolean;
  healthy: boolean;
  reconnectRequired: boolean;
  senderEmail: string;
  connectedAt: string | null;
  connectedBy: string | null;
  scope: string;
  transport: 'gmail_api_oauth2';
};

export type AdminEmailAudiencePreview = {
  audience: AdminEmailAudience;
  audienceLabel: string;
  recipientCount: number;
  sendLimit: number;
  overSendLimit: boolean;
  recipients: {
    email: string;
    displayName: string;
    roleLabel: string;
    source: 'account' | 'tester_allowlist';
  }[];
  recipientPreviewTruncated: boolean;
};

export type AdminEmailCampaign = {
  id: string;
  subject: string;
  category: AdminEmailCategory;
  categoryLabel: string;
  audience: AdminEmailAudience;
  audienceLabel: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string | null;
  completedAt: string | null;
  createdBy: string;
};

const gmailOAuthStatusCall = httpsCallable<void, AdminGmailOAuthStatus>(functions, 'adminGmailOAuthStatus');
const beginGmailOAuthCall = httpsCallable<void, { authorizationUrl: string; senderEmail: string; redirectUri: string }>(functions, 'adminBeginGmailOAuth');
const disconnectGmailOAuthCall = httpsCallable<void, { disconnected: boolean }>(functions, 'adminDisconnectGmailOAuth');
const emailAudiencePreviewCall = httpsCallable<{ audience: AdminEmailAudience }, AdminEmailAudiencePreview>(functions, 'adminEmailAudiencePreview');
const emailCampaignsCall = httpsCallable<void, { campaigns: AdminEmailCampaign[] }>(functions, 'adminListEmailCampaigns');
const sendEmailTestCall = httpsCallable<{
  subject: string;
  body: string;
  category: AdminEmailCategory;
  recipientEmails?: string[];
}, {
  sent: boolean;
  recipientEmail: string | null;
  recipientEmails: string[];
  sentCount: number;
  failedCount: number;
  results: { email: string; status: 'sent' | 'failed'; error?: string }[];
}>(functions, 'adminSendEmailTest');
const sendEmailCampaignCall = httpsCallable<{
  subject: string;
  body: string;
  audience: AdminEmailAudience;
  category: AdminEmailCategory;
  clientRequestId: string;
  confirmPrivateIndividualDelivery: boolean;
}, { campaign: AdminEmailCampaign; duplicateRequest: boolean }>(functions, 'adminSendEmailCampaign');
const retryEmailCampaignCall = httpsCallable<{ campaignId: string }, {
  campaign: AdminEmailCampaign;
  retried: number;
  recovered?: number;
  stillFailed?: number;
}>(functions, 'adminRetryEmailCampaign');

export const nightjarAdministration = {
  async overview() {
    return repairMojibakeDisplayData((await overviewCall()).data);
  },

  async setAccountRole(userId: string, role: 'listener' | 'creator' | 'writer' | 'editor' | 'artist', status: 'active' | 'pending_review' | 'suspended' = 'active') {
    return (await setRoleCall({ userId, role, status })).data;
  },

  async setClosedBetaTester(email: string, enabled: boolean, note = '') {
    return (await setClosedBetaTesterCall({ email: email.trim(), enabled, ...(note ? { note } : {}) })).data;
  },

  async setTestAccess(userId: string, enabled: boolean) {
    return (await setTestAccessCall({ userId, enabled })).data;
  },

  async professionalApplicationBank() {
    return repairMojibakeDisplayData((await professionalBankCall()).data);
  },

  async retryProfessionalApprovalEmail(userId: string, eventId: string) {
    return (await retryApprovalEmailCall({ userId, eventId })).data;
  },

  async reviewProfessionalApplication(userId: string, decision: 'banked' | 'approved' | 'rejected' | 'waitlist', roles: ('creator' | 'writer' | 'editor' | 'artist')[] = [], wave = '') {
    return (await reviewProfessionalCall({ userId, decision, ...(roles.length ? { roles } : {}), ...(wave ? { wave } : {}) })).data;
  },

  async gmailOAuthStatus() {
    return (await gmailOAuthStatusCall()).data;
  },

  async beginGmailOAuth() {
    return (await beginGmailOAuthCall()).data;
  },

  async disconnectGmailOAuth() {
    return (await disconnectGmailOAuthCall()).data;
  },

  async emailAudiencePreview(audience: AdminEmailAudience) {
    return repairMojibakeDisplayData((await emailAudiencePreviewCall({ audience })).data);
  },

  async emailCampaigns() {
    return repairMojibakeDisplayData((await emailCampaignsCall()).data);
  },

  async sendEmailTest(subject: string, body: string, category: AdminEmailCategory, recipientEmails: string[] = []) {
    return (await sendEmailTestCall({
      subject,
      body,
      category,
      ...(recipientEmails.length ? { recipientEmails } : {}),
    })).data;
  },

  async sendEmailCampaign(input: {
    subject: string;
    body: string;
    audience: AdminEmailAudience;
    category: AdminEmailCategory;
    clientRequestId: string;
    confirmPrivateIndividualDelivery: boolean;
  }) {
    return (await sendEmailCampaignCall(input)).data;
  },

  async retryEmailCampaign(campaignId: string) {
    return (await retryEmailCampaignCall({ campaignId })).data;
  },
};
