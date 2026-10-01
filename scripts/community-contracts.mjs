import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const exists=(file)=>fs.existsSync(path.join(root,file));
const failures=[];
const requireText=(source,text,label)=>{ if(!source.includes(text)) failures.push(label); };

const functions=read('functions/src/index.ts');
const app=read('src/App.tsx');
const inbox=read('src/components/MessagingHub.tsx');
const community=read('src/components/ReleaseReviews.tsx');
const prefs=read('src/components/NotificationPreferences.tsx');
const messagingClient=read('src/platform/firebase-messaging.ts');
const engagementClient=read('src/platform/firebase-engagement.ts');
const accountAccess=read('src/components/AccountAccess.tsx');
const accountPortal=read('src/components/AccountPortal.tsx');
const referralsClient=read('src/platform/firebase-referrals.ts');
const creatorPipeline=read('src/components/CreatorAudioPipeline.tsx');

[
  'releaseCommunity',
  'setReleaseReaction',
  'postReleaseComment',
  'replyToReleaseComment',
  'deleteOwnReleaseComment',
  'reportReleaseComment',
  'listMessageConversations',
  'startDirectConversation',
  'listDirectMessages',
  'sendDirectMessage',
  'sendDirectMessageReminder',
  'closeDirectConversationLoop',
  'setDirectMessageBlock',
  'reportDirectMessage',
  'adminListCommunityReports',
  'adminResolveCommunityReport',
].forEach((name)=>requireText(functions,'export const '+name,name+' callable is missing'));

requireText(functions,"requireAccountRole(request, ['listener'])",'Listener-only community posting contract is missing');
requireText(functions,"requireAccountRole(request, ['creator','writer','editor'])",'Professional-message role gate is missing');
requireText(functions,'Only credited members of this release can reply as the work team.','Credited work-team reply boundary is missing');
requireText(functions,'hideReleaseCommentReplies','Parent-comment deletion no longer hides orphaned work-team replies');
requireText(functions,'reporterName:reporter.displayName','Admin community reports no longer expose human-readable reporter context');
requireText(functions,'subjectName:subject.displayName','Admin community reports no longer expose human-readable subject context');
requireText(functions,'reminderForLastMessageAt','Per-unanswered-streak reminder state is missing');
requireText(functions,'A reminder has already been sent for this unanswered message.','One-reminder-per-streak guard is missing');
requireText(functions,'A reminder is available after 48 hours without a reply.','48-hour reminder threshold is missing');
requireText(functions,'resolvedForLastMessageAt','Close-loop state is missing from professional messaging');
requireText(functions,"subtype:'direct_message_reminder'",'Professional follow-up notification is missing');
requireText(functions,"dedupeKey:'release-reaction:'",'Reaction notification dedupe is missing');
requireText(functions,'Please wait before posting more comments.','Comment rate-limit contract is missing');
requireText(functions,'Please slow down before sending more messages.','Message rate-limit contract is missing');
requireText(functions,"type:'direct_message'",'Reported direct-message moderation path is missing');
requireText(functions,"type:'release_comment'",'Reported comment moderation path is missing');
requireText(functions,'communityLikeCount','Published-work Like summary field is missing');
requireText(functions,'communityLoveCount','Published-work Love summary field is missing');
requireText(functions,'communityCommentCount','Published-work comment summary field is missing');
requireText(functions,'syncReleaseCommunitySummary','Published-work summary synchronisation is missing');
requireText(app,'communityCommentCount','Release cards do not expose comment counts');
requireText(app,'communityLikeCount','Release cards do not expose Like counts');
requireText(app,'communityLoveCount','Release cards do not expose Love counts');
const appInboxPolls=(app.match(/nightjarMessaging\.conversations\(\)/g)??[]).length;
if(appInboxPolls!==1) failures.push('App shell must have exactly one background Inbox polling path; found '+appInboxPolls);
requireText(app,'messageAwaitingReplyCount','Professional awaiting-reply workflow is missing from role dashboards');
requireText(app,'messageNeedsReplyCount','Read-but-unanswered Inbox responsibility state is missing from role dashboards');
requireText(app,'creatorUserId: reviewTrack.creatorUserId','Release Community no longer receives Creator credit context');
requireText(app,'contributors: reviewTrack.contributors','Release Community no longer receives contributor credit context');
requireText(inbox,'Reply needed','Inbox reply-needed indicator is missing');
requireText(inbox,'Send one reminder','Inbox safe follow-up action is missing');
requireText(inbox,'nightjarMessaging.remind','Inbox reminder API integration is missing');
requireText(inbox,'Close loop','Inbox no-reply-needed control is missing');
requireText(inbox,'nightjarMessaging.closeLoop','Inbox close-loop API integration is missing');
requireText(app,'nav-messages','Universal search does not expose the professional Inbox');
requireText(functions,'directMessagingBlockedBetween','Professional message block enforcement is missing');
requireText(functions,'readBy:[identity.uid]','Direct-message read state is missing');
requireText(functions,'messagingCollaborationContext','Verified multi-project message context validation is missing');
requireText(functions,'collaborationIds','Multi-project professional conversation context is missing');
requireText(functions,".where('participantUserIds', 'array-contains', identity.uid)",'Inbox conversation query is not participant-scoped');
requireText(functions,".orderBy('createdAt', 'desc')",'Message history does not use deterministic recent ordering');
['listProfessionalConversations','startProfessionalConversation','openProfessionalConversation','sendProfessionalMessage','setProfessionalMessageBlock','reportProfessionalMessage'].forEach((legacy)=>{
  if(functions.includes('export const '+legacy)) failures.push('Legacy parallel messaging callable still exported: '+legacy);
});

requireText(app,"'messages'",'Messages route is missing');
requireText(app,'viewerRole={effectiveRole}','Release Community does not receive the current role for Listener-only interaction');
requireText(app,'messageUnreadCount','Unread Inbox state is missing');
requireText(app,'setMessageCollaborationId','Collaboration-to-message context is missing');
requireText(app,'initialConversationId={messageConversationId}','Message notifications cannot open an exact private thread');
requireText(app,'suspendReportedCommunityAccount','Manual Administrator suspension escalation for serious community reports is missing');
requireText(app,"'suspended'","Administrator report escalation no longer targets suspended account status");
requireText(app,'messageUnreadCount','Unread professional message state is missing');
requireText(app,'<MessageCircle size={14}/> Comments','Published-work comments are not directly discoverable on release cards');
requireText(app,'openNotification(item)','Activity rows no longer deep-link to their target');
const navMessageCommands=(app.match(/id:'nav-messages'/g)??[]).length;
if(navMessageCommands!==1) failures.push('Universal search must expose exactly one Messages command; found '+navMessageCommands);

requireText(inbox,'nightjarMessaging.open','Inbox is not using canonical message thread API');
requireText(inbox,'nightjarMessaging.setBlocked','Inbox block control is missing');
requireText(inbox,'nightjarMessaging.report','Inbox report control is missing');
requireText(inbox,'message-read-state','Inbox read-receipt UI is missing');
requireText(inbox,'messaging-project-contexts','Multi-project Inbox context switcher is missing');
requireText(inbox,'activeCollaborationId','Per-message project context state is missing');
requireText(inbox,"'needs_reply'",'Inbox responsibility filter for replies owed by the current user is missing');
requireText(inbox,"'awaiting_reply'",'Inbox filter for conversations awaiting another professional is missing');
requireText(inbox,'messaging-filter-tabs','Inbox responsibility filter controls are missing');

requireText(community,'nightjarEngagement.setReaction','Like/Love Community action is missing');
requireText(community,'Post comment','Direct Listener comment UI is missing');
requireText(community,'Reply as work team','Credited work-team reply UI is missing');
requireText(community,'creditedViewer','Work-team reply control is no longer credit-aware');
requireText(community,'Work team','Work-team reply attribution is missing');
requireText(community,'nightjarEngagement.reply','Release comment reply API integration is missing');
requireText(community,'Formal reviews are moderated before publication','Review/comment moderation distinction is missing');

requireText(prefs,"['messages','Private messages']", 'Private-message notification preference is missing');
requireText(messagingClient,"'listMessageConversations'",'Messaging client canonical conversation callable is missing');
requireText(messagingClient,"'startDirectConversation'",'Messaging client canonical conversation-start callable is missing');
requireText(messagingClient,"'listDirectMessages'",'Messaging client canonical thread callable is missing');
requireText(messagingClient,"'sendDirectMessage'",'Messaging client canonical send callable is missing');
requireText(messagingClient,"'sendDirectMessageReminder'",'Messaging client follow-up reminder callable is missing');
requireText(messagingClient,"'closeDirectConversationLoop'",'Messaging client close-loop callable is missing');
requireText(messagingClient,'collaborationId?:string|null','Messaging client no longer carries per-message collaboration context');
requireText(messagingClient,"'setDirectMessageBlock'",'Messaging client block callable is missing');
requireText(messagingClient,"'reportDirectMessage'",'Messaging client report callable is missing');
requireText(engagementClient,"'setReleaseReaction'",'Engagement client reaction callable is missing');
requireText(engagementClient,"'replyToReleaseComment'",'Engagement client work-team reply callable is missing');

requireText(accountAccess,"role:'listener'",'Listener role-first registration card is missing');
requireText(accountAccess,"role:'creator'",'Creator role-first registration card is missing');
requireText(accountAccess,"role:'writer'",'Writer role-first registration card is missing');
requireText(accountAccess,"role:'editor'",'Audio Editor role-first registration card is missing');
requireText(accountAccess,'nightjar.registrationRole','Chosen signup role is not persisted through verification');
requireText(accountPortal,"nextAccount.role === 'editor'",'Dedicated Audio Editor account routing is missing');
requireText(functions,"type SelectableRole = 'creator' | 'listener' | 'writer' | 'editor'",'Server role selection is missing a Nightjar account type');
requireText(functions,"requestedRole === 'creator' || requestedRole === 'editor'",'Professional approval gate is missing Creator/Audio Editor coverage');

['submitCreatorSuggestion','listCreatorSuggestions','reviewCreatorSuggestion','creatorRecommendationLink'].forEach((name)=>
  requireText(functions,'export const '+name,'Creator referral callable is missing: '+name)
);
requireText(referralsClient,'suggestCreator','Creator suggestion client is missing');
requireText(referralsClient,'recommendCreator','Creator recommendation-link client is missing');
requireText(app,'CreatorSuggestionBox','Directory Creator suggestion experience is missing');
requireText(app,'recommendCreator(person)','Existing Creator recommendation action is missing');

requireText(functions,'releaseWorkAccess','Credited-work playback entitlement helper is missing');
requireText(functions,"['active','trialing']", 'Active/trialing subscription playback rule is missing');
requireText(functions,"reason:'credited_work'",'Credited contributor free-access reason is missing');
requireText(functions,"reason:'subscription_required'",'Unrelated paid-work subscription boundary is missing');
requireText(functions,"collection('playbackGrants')",'Verified listening is not bound to server-issued playback access');
requireText(app,'playbackAccessReason','Catalogue UI does not receive playback entitlement reason');
requireText(creatorPipeline,'grants that credited person access to this release','Release credits do not explain free collaborator access');
requireText(creatorPipeline,'Unlinked / external credit · no account access','External credits are not distinguished from Nightjar-linked entitlements');

if (exists('src/components/ReleaseCommunity.tsx')) failures.push('Obsolete duplicate ReleaseCommunity component still exists');
if (exists('src/components/ProfessionalInbox.tsx')) failures.push('Obsolete duplicate ProfessionalInbox component still exists');

if (failures.length) {
  console.error('COMMUNITY CONTRACT FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar community and messaging contracts passed.');
