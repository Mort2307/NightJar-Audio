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
requireText(functions,"requireAccountRole(request, ['creator','writer','editor','artist'])",'Professional-message role gate is missing');
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
requireText(functions,'readAt:{ [identity.uid]:new Date().toISOString() }','Timestamped sender read state is missing');
requireText(functions,'readAt[identity.uid] = seenAt','Timestamped recipient read receipt is missing');
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
requireText(app,'onStatusChange={({unread,needsReply,awaitingReply})=>','App shell does not receive live Inbox responsibility changes');
requireText(app,'communityByRelease={communityByRelease}','Public profile community counts are not bound to live release state');
// The direct reaction controls must remain Listener-only AND disabled while an
// administrator views a real-data read-only Listener preview. Both profile
// components are mounted independently, so protect both render paths.
const publicProfileReactionGuard = "canReact={effectiveRole==='listener' && !liveRolePreview}";
const guardedProfileCount = app.split(publicProfileReactionGuard).length - 1;
if (guardedProfileCount !== 2) failures.push('Both public profile reaction controls must be Listener-only and disabled in live admin preview; found '+guardedProfileCount);
if (app.includes("canReact={effectiveRole==='listener'}")) failures.push('Unguarded public profile reaction control can leak into live admin preview');
requireText(app,'<MessageCircle size={14}/> Comments','Published-work comments are not directly discoverable on release cards');
requireText(app,'openNotification(item)','Activity rows no longer deep-link to their target');
const navMessageCommands=(app.match(/id:'nav-messages'/g)??[]).length;
if(navMessageCommands!==1) failures.push('Universal search must expose exactly one Messages command; found '+navMessageCommands);

requireText(inbox,'nightjarMessaging.open','Inbox is not using canonical message thread API');
requireText(inbox,'nightjarMessaging.setBlocked','Inbox block control is missing');
requireText(inbox,'nightjarMessaging.report','Inbox report control is missing');
requireText(inbox,'message-read-state','Inbox read-receipt UI is missing');
requireText(inbox,'message.readAt?.[selected.otherUserId]','Inbox timestamped read receipt is missing');
requireText(inbox,'onStatusChange?.({ unread:unreadTotal, needsReply:needsReplyTotal, awaitingReply:awaitingReplyTotal })','Inbox live responsibility propagation is missing');
requireText(inbox,'messaging-responsibility-bar','Conversation responsibility summary is missing');
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

requireText(accountAccess,'Listener · included','Universal Listener access at registration is missing');
requireText(accountAccess,"role:'creator'",'Creator role-first registration card is missing');
requireText(accountAccess,"role:'writer'",'Writer role-first registration card is missing');
requireText(accountAccess,"role:'editor'",'Audio Editor registration option is missing');
requireText(accountAccess,"role:'artist'",'Artist registration option is missing');
requireText(accountAccess,'registrationRoles.includes','Multi-role professional signup selection is missing');
requireText(accountAccess,'nightjar.registrationRoles','Chosen signup professional roles are not persisted through verification');
requireText(accountPortal,"role === 'editor'",'Dedicated Audio Editor account routing is missing');
requireText(functions,"type SelectableRole = 'creator' | 'listener' | 'writer' | 'editor' | 'artist'",'Server role selection is missing a Nightjar account type');
requireText(functions,"const PROFESSIONAL_ROLE_KEYS = ['creator','writer','editor','artist'] as const",'Professional approval gate is missing the full professional role set');

['submitCreatorSuggestion','listCreatorSuggestions','reviewCreatorSuggestion','creatorRecommendationLink'].forEach((name)=>
  requireText(functions,'export const '+name,'Creator referral callable is missing: '+name)
);
requireText(referralsClient,'suggestCreator','Creator suggestion client is missing');
requireText(referralsClient,'recommendCreator','Creator recommendation-link client is missing');
requireText(app,'CreatorSuggestionBox','Directory Creator suggestion experience is missing');
requireText(app,'onRecommend={(person) => void recommendCreator(', 'Existing Creator recommendation action must be delegated into Professional Library');
requireText(read('src/components/ProfessionalLibrary.tsx'),"category==='creator'&&<button", 'Creator recommendation must remain available in the VA category');

requireText(functions,'releaseWorkAccess','Credited-work playback entitlement helper is missing');
// PR #14 hardening replaced the unsafe status-only active/trialing rule.
const verifiedEntitlements=read('functions/src/entitlements.ts');
requireText(functions,"hasPaidEntitlement(doc.data(), userId)",'Server playback must use the verified paid entitlement helper');
requireText(verifiedEntitlements,"subscription.status === 'active'",'Paid listening requires a confirmed active subscription');
requireText(verifiedEntitlements,"subscription.providerVerified === true",'Unverified billing records cannot unlock paid audio');
requireText(verifiedEntitlements,"periodEndMillis(subscription.currentPeriodEnd) > now",'Expired subscriptions cannot unlock paid audio');
requireText(functions,"reason:'credited_work'",'Credited contributor free-access reason is missing');
requireText(functions,"reason:'subscription_required'",'Unrelated paid-work subscription boundary is missing');
requireText(functions,"collection('playbackGrants')",'Verified listening is not bound to server-issued playback access');
requireText(app,'playbackAccessReason','Catalogue UI does not receive playback entitlement reason');
requireText(creatorPipeline,'grants that credited person access to this release','Release credits do not explain free collaborator access');
requireText(creatorPipeline,'Unlinked / external credit · no account access','External credits are not distinguished from Nightjar-linked entitlements');

if (exists('src/components/ReleaseCommunity.tsx')) failures.push('Obsolete duplicate ReleaseCommunity component still exists');
if (exists('src/components/ProfessionalInbox.tsx')) failures.push('Obsolete duplicate ProfessionalInbox component still exists');


// SPOTLIGHT EXPERIENCE: visual recognition, real delivery, privacy and fair
// one-per-day idempotence. Source-level checks complement device QA.
const spotlightUi=read('src/components/SpotlightExperience.tsx');
const productStyles=read('src/styles/product-system.css');
requireText(app,'<SpotlightExperience','Nightjar discover must use the premium spotlight component');
requireText(app,"if (item.type === 'spotlight')", 'Spotlight bell notification must open the featured section');
requireText(app,"'/people/' + encodeURIComponent(spotlight.targetId)",'Shared Spotlight must link to the featured member rather than generic Discover');
requireText(spotlightUi,'THE NIGHTJAR SPOTLIGHT', 'Premium spotlight should have its own editorial identity');
requireText(spotlightUi,'IT’S YOUR SPOTLIGHT DAY!', 'Featured member must see the celebratory in-app state');
requireText(spotlightUi,'!simulationMode && viewerUserId', 'Personal spotlight must not treat owner simulations as real users');
requireText(spotlightUi,"className=\"nj-spotlight-card\"", 'All featured roles must receive an equal Spotlight card, not a privileged hero');
requireText(spotlightUi,'SPOTLIGHT DAY', 'Featured members must have an accurate rotating day badge');
if (spotlightUi.includes('TODAY ONLY') || spotlightUi.includes('nj-spotlight-lead') || spotlightUi.includes('featured={index===0}')) failures.push('Spotlight must not diminish other roles through ranked hero layout or a misleading today-only label');
requireText(productStyles,'.nj-spotlight-experience .nj-spotlight-editorial-grid>.nj-spotlight-card', 'All desktop Spotlight cards must match the Maze-sized feature');
requireText(spotlightUi,'person.publicProfile !== false', 'Sharing and profile links must respect privacy');
requireText(spotlightUi,'const available = props.spotlights.filter', 'Empty profession lanes should not dominate the premium spotlight');
requireText(productStyles,'.nj-spotlight-editorial-grid', 'Premium Spotlight responsive cards are missing');
requireText(functions,"export const notifyDailySpotlights = onSchedule({", 'UK-morning Spotlight notification scheduling is missing');
requireText(functions,"timeZone: 'Europe/London'",'Daily spotlight dispatch must respect UK daylight saving');
requireText(functions,"await ref.create({", 'Concurrent Spotlight updates must create the one-time notification atomically');
requireText(functions,"collection('notificationDispatches').doc('spotlight_' + date)", 'FCM push must be claimed once by UK date per person regardless of professional role');
requireText(functions,"if (localHour < 9 || localHour >= 21) return;",'Nightjar must never deliver promotional phone pushes during UK night hours');
requireText(functions,"collection('spotlightDailySelections').doc(dateKey + '_' + role)",'A spotlight person must retain their entire featured UK day despite new approvals');
requireText(functions,"doc('spotlight_' + date + '_' + kind)", 'Spotlight notification must be unique by London date and professional role');
requireText(functions,"preferences.followedProfiles === false", 'Spotlight push must respect existing member opt-out');
requireText(functions,"if (item.publicProfile === false) return;", 'Private spotlight accounts must not receive promotional pushes');
requireText(functions,"await deliverPushNotification(targetId, mobilePayload, displayMode, ref.id)", 'Featured members need an actual FCM phone notification');
requireText(functions,"const mobilePayload = displayMode === 'full'", 'Push notification must respect display privacy levels');
requireText(functions,"Promise.allSettled(spotlights.map", 'Push availability must not break daily Spotlight state');


// Professional Library: role-specific public discovery for every approved
// VA, Writer, Audio Editor and Artist without exposing hidden/private people.
const proLibrary=read('src/components/ProfessionalLibrary.tsx');
requireText(app,"import ProfessionalLibrary from './components/ProfessionalLibrary'",'Professional library must be imported');
requireText(app,'<ProfessionalLibrary','Directory must render dedicated Professional Library');
requireText(app,'filteredProfiles={filteredDirectoryProfiles}','Professional Library must use the existing public directory filtering');
requireText(app,'category={directoryRoleFilter}','Category selection must match directory search and saved filters');
requireText(app,'onOpen={openPublicProfile}','Library must use actual public-profile renderer');
requireText(app,'readOnly={liveRolePreview||(demoMode&&!simulationMode)}','Owner preview and passive demo cannot follow or message members');
for(const role of ["'creator'","'writer'","'editor'","'artist'"]) {
  requireText(proLibrary,'id:'+role, 'Professional category missing '+role);
}
requireText(proLibrary,'belongsToLibraryCategory','Multi-role members must appear under each approved profession');
requireText(proLibrary,'profile.roles.includes(category)','Multi-role membership must not rely only on primary account role');
requireText(proLibrary,'person.roleProfiles?.[category]','A role-scoped headline must be used for each category');
requireText(proLibrary,'new Set(filteredProfiles.filter','All-professionals matching total must deduplicate multi-role accounts');
requireText(proLibrary,'category===\'all\' ? categories.map','All-professionals mode should show distinct sections for all four roles');
requireText(proLibrary,'role===\'listener\'','Listener community should remain optional, not dominate professional library');
requireText(proLibrary,'data-nj-preview-safe="true"','Public profiles must be viewable in read-only owner preview');
requireText(proLibrary,'!readOnly&&canMessage','Role-based private messaging should not appear in owner preview');
requireText(functions,'if (!data || data.publicProfile === false) return null;', 'Private profiles must be filtered at the backend');


// Listener-facing Creator Collection uses the SAME protected public profiles,
// not an unmoderated duplicate directory. Its actions deliberately differ
// from professional work enquiries.
const listenerDiscovery = read('src/components/ListenerCreatorDiscovery.tsx');
const listenerLibrary = read('src/components/ListenerLibrary.tsx');
const mobileNav = read('src/components/MobileNavigation.tsx');
requireText(app,"effectiveRole==='listener'&&<Suspense", 'All real Listener accounts need the Creator Collection route');
requireText(app,'<ListenerCreatorDiscovery', 'Listener discovery must be mounted in shared Directory');
requireText(app,"audience={effectiveRole==='listener'?'listener':'professional'}", 'Professional cards must adapt to the member perspective');
requireText(app,'onSupport={(person,role)=>', 'Listener directory needs optional Nightjars support');
requireText(app,'<NightjarGiftPanel recipientUserId={supportTarget.userId}', 'Support controls need the existing verified Nightjars gift workflow');
requireText(proLibrary,"audience==='listener'?'The Creator Collection'", 'Listener library must not read like a commissioning directory');
requireText(proLibrary,"!readOnly&&canMessage&&category!=='listener'", 'Professional messaging must remain role-gated');
requireText(proLibrary,"!readOnly&&audience==='listener'&&category!=='listener'&&onSupport", 'Listener support is optional and role-scoped');
requireText(listenerDiscovery,'THE NIGHTJAR CREATOR COLLECTION', 'Listener discovery needs its own editorial identity');
requireText(listenerDiscovery,'publicCreativeCredits', 'Discovery must link actual published release credits to visible makers');
requireText(listenerDiscovery,'belongsToLibraryCategory(person,role)', 'Only eligible public professionals may be linked from release credits');
requireText(listenerDiscovery,'onClick={()=>void onFollow(person.userId)}', 'Listener following must be an explicit user action');
requireText(listenerLibrary,'onDiscoverCreators', 'Listener personal library must link to the Creator Collection');
requireText(mobileNav,"label: 'Creators', accessibleLabel:'Discover creators and their work'", 'Listener mobile nav must surface Creators, not a hiring directory');

if (failures.length) {
  console.error('COMMUNITY CONTRACT FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar community and messaging contracts passed.');
