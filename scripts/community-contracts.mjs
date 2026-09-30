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

[
  'releaseCommunity',
  'setReleaseReaction',
  'postReleaseComment',
  'deleteOwnReleaseComment',
  'reportReleaseComment',
  'listMessageConversations',
  'startDirectConversation',
  'listDirectMessages',
  'sendDirectMessage',
  'setDirectMessageBlock',
  'reportDirectMessage',
  'adminListCommunityReports',
  'adminResolveCommunityReport',
].forEach((name)=>requireText(functions,'export const '+name,name+' callable is missing'));

requireText(functions,"requireAccountRole(request, ['listener'])",'Listener-only community posting contract is missing');
requireText(functions,"requireAccountRole(request, ['creator','writer','editor'])",'Professional-message role gate is missing');
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
requireText(inbox,'Awaiting reply · 48h+','Inbox awaiting-reply indicator is missing');
requireText(app,'nav-messages','Universal search does not expose the professional Inbox');
requireText(functions,'directMessagingBlockedBetween','Professional message block enforcement is missing');
requireText(functions,'readBy:[identity.uid]','Direct-message read state is missing');
['listProfessionalConversations','startProfessionalConversation','openProfessionalConversation','sendProfessionalMessage','setProfessionalMessageBlock','reportProfessionalMessage'].forEach((legacy)=>{
  if(functions.includes('export const '+legacy)) failures.push('Legacy parallel messaging callable still exported: '+legacy);
});

requireText(app,"'messages'",'Messages route is missing');
requireText(app,'viewerRole={effectiveRole}','Release Community does not receive the current role for Listener-only interaction');
requireText(app,'messageUnreadCount','Unread Inbox state is missing');
requireText(app,'setMessageCollaborationId','Collaboration-to-message context is missing');
requireText(app,'initialConversationId={messageConversationId}','Message notifications cannot open an exact private thread');
requireText(app,'messageUnreadCount','Unread professional message state is missing');
requireText(app,'<MessageCircle size={14}/> Comments','Published-work comments are not directly discoverable on release cards');

requireText(inbox,'nightjarMessaging.open','Inbox is not using canonical message thread API');
requireText(inbox,'nightjarMessaging.setBlocked','Inbox block control is missing');
requireText(inbox,'nightjarMessaging.report','Inbox report control is missing');
requireText(inbox,'message-read-state','Inbox read-receipt UI is missing');

requireText(community,'nightjarEngagement.setReaction','Like/Love Community action is missing');
requireText(community,'Post comment','Direct Listener comment UI is missing');
requireText(community,'Formal reviews are moderated before publication','Review/comment moderation distinction is missing');

requireText(prefs,"['messages','Private messages']", 'Private-message notification preference is missing');
requireText(messagingClient,"'listMessageConversations'",'Messaging client canonical conversation callable is missing');
requireText(messagingClient,"'startDirectConversation'",'Messaging client canonical conversation-start callable is missing');
requireText(messagingClient,"'listDirectMessages'",'Messaging client canonical thread callable is missing');
requireText(messagingClient,"'sendDirectMessage'",'Messaging client canonical send callable is missing');
requireText(messagingClient,"'setDirectMessageBlock'",'Messaging client block callable is missing');
requireText(messagingClient,"'reportDirectMessage'",'Messaging client report callable is missing');
requireText(engagementClient,"'setReleaseReaction'",'Engagement client reaction callable is missing');

if (exists('src/components/ReleaseCommunity.tsx')) failures.push('Obsolete duplicate ReleaseCommunity component still exists');
if (exists('src/components/ProfessionalInbox.tsx')) failures.push('Obsolete duplicate ProfessionalInbox component still exists');

if (failures.length) {
  console.error('COMMUNITY CONTRACT FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar community and messaging contracts passed.');
