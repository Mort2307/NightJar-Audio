export const demoCreators = [
  { userId: 'demo-creator-aria', name: 'Aria Vale', handle: 'ariavale', initials: 'AV', note: 'Cinematic character-led audio with slow-burn storytelling.', followers: 1842, releases: 14, imageUrl: null },
  { userId: 'demo-creator-rowan', name: 'Rowan Ash', handle: 'rowanash', initials: 'RA', note: 'Low-key immersive performances and late-night stories.', followers: 1260, releases: 9, imageUrl: null },
  { userId: 'demo-creator-luca', name: 'Luca Grey', handle: 'lucagrey', initials: 'LG', note: 'Dialogue-heavy romance, tension and atmospheric roleplay.', followers: 973, releases: 11, imageUrl: null },
  { userId: 'demo-creator-nova', name: 'Nova Quinn', handle: 'novaquinn', initials: 'NQ', note: 'Playful multi-character performance and experimental sound.', followers: 711, releases: 7, imageUrl: null },
  { userId: 'demo-creator-eden', name: 'Eden Hart', handle: 'edenhart', initials: 'EH', note: 'Gentle voice-led stories, reassurance and wind-down audio.', followers: 604, releases: 6, imageUrl: null },
];

export const demoTracks = [
  {
    id: 'demo-release-1', title: 'After Midnight', creator: 'Aria Vale', duration: '31 min', category: 'Story',
    descriptor: 'A rain-soaked slow-burn story built around conversation, tension and a quiet late-night setting.',
    featured: true, audioAvailable: true, audioUrl: null, artworkUrl: null, creatorUserId: 'demo-creator-aria',
    genre: 'Contemporary romance', tags: ['Atmospheric','Cinematic','Story-led'], tropes: ['Slow burn','Mutual pining'],
    contributors: [
      { userId: 'demo-creator-aria', name: 'Aria Vale', role: 'Voice Actor' },
      { userId: 'demo-writer-mara', name: 'Mara Bell', role: 'Writer' },
      { userId: 'demo-editor-sam', name: 'Sam Reed', role: 'Audio Editor' },
    ],
    contentRating: 'adult', seriesTitle: 'City After Dark', episodeNumber: 1, nightjarOriginal: true,
    productionNote: 'Demo production showing linked Voice Actor, Writer and Audio Editor credits.',
  },
  {
    id: 'demo-release-2', title: 'Window Seat', creator: 'Rowan Ash', duration: '18 min', category: 'Audio roleplay',
    descriptor: 'A compact strangers-to-lovers scene with soft dialogue and a restrained sound bed.',
    audioAvailable: true, audioUrl: null, artworkUrl: null, creatorUserId: 'demo-creator-rowan',
    genre: 'Romantic story', tags: ['Gentle','Conversational'], tropes: ['Strangers to lovers','Meet-cute'],
    contributors: [{ userId: 'demo-writer-ivy', name: 'Ivy North', role: 'Writer' }, { userId: 'demo-editor-sam', name: 'Sam Reed', role: 'Audio Editor' }],
    contentRating: 'suggestive', seriesTitle: null, episodeNumber: null, nightjarOriginal: false, productionNote: null,
  },
  {
    id: 'demo-release-3', title: 'The Long Way Home', creator: 'Luca Grey', duration: '44 min', category: 'Audio drama',
    descriptor: 'A longer character piece with layered dialogue, an ensemble cast and cinematic pacing.',
    audioAvailable: true, audioUrl: null, artworkUrl: null, creatorUserId: 'demo-creator-luca',
    genre: 'Drama', tags: ['Cinematic','Dialogue-heavy','Sound-rich'], tropes: ['Second chance','Reunion'],
    contributors: [{ userId: 'demo-writer-mara', name: 'Mara Bell', role: 'Writer' }, { userId: 'demo-editor-rin', name: 'Rin Cole', role: 'Audio Editor' }, { userId: 'demo-creator-nova', name: 'Nova Quinn', role: 'Voice Actor' }],
    contentRating: 'adult', seriesTitle: 'The Long Way Home', episodeNumber: 2, nightjarOriginal: true,
    productionNote: 'Ensemble demo with multiple credited performers.',
  },
  {
    id: 'demo-release-4', title: 'Static Between Us', creator: 'Nova Quinn', duration: '12 min', category: 'Performance',
    descriptor: 'A playful short-form performance designed for quick discovery.',
    audioAvailable: true, audioUrl: null, artworkUrl: null, creatorUserId: 'demo-creator-nova',
    genre: 'Comedy / playful', tags: ['Playful','Voice-led'], tropes: ['Teasing','Friends to lovers'],
    contributors: [{ userId: 'demo-writer-ivy', name: 'Ivy North', role: 'Writer' }],
    contentRating: 'suggestive', seriesTitle: null, episodeNumber: null, nightjarOriginal: false, productionNote: null,
  },
  {
    id: 'demo-release-5', title: 'Stay Awhile', creator: 'Eden Hart', duration: '27 min', category: 'Wind-down',
    descriptor: 'A gentle reassurance-focused listen with minimal production and a calm pace.',
    audioAvailable: true, audioUrl: null, artworkUrl: null, creatorUserId: 'demo-creator-eden',
    genre: 'Sleep / wind-down', tags: ['Gentle','Slow-paced','Voice-led'], tropes: ['Comfort & reassurance','Aftercare'],
    contributors: [{ userId: 'demo-editor-rin', name: 'Rin Cole', role: 'Audio Editor' }],
    contentRating: 'sfw', seriesTitle: null, episodeNumber: null, nightjarOriginal: false, productionNote: null,
  },
  {
    id: 'demo-release-6', title: 'The Observatory', creator: 'Aria Vale', duration: '52 min', category: 'Story',
    descriptor: 'A long-form science-fiction romance demo with environmental sound and a full production team.',
    audioAvailable: true, audioUrl: null, artworkUrl: null, creatorUserId: 'demo-creator-aria',
    genre: 'Sci-fi romance', tags: ['Immersive','Cinematic','Sound-rich'], tropes: ['Forbidden attraction','Sci-fi romance'],
    contributors: [{ userId: 'demo-writer-mara', name: 'Mara Bell', role: 'Writer' }, { userId: 'demo-editor-sam', name: 'Sam Reed', role: 'Audio Editor' }, { userId: 'demo-creator-luca', name: 'Luca Grey', role: 'Voice Actor' }],
    contentRating: 'adult', seriesTitle: 'Orbit', episodeNumber: 1, nightjarOriginal: true,
    productionNote: 'Demo Nightjar Original showing a larger collaborative production.',
  },
];

export const demoSpotlights = {
  creators: [{ kind:'creator', name:'Aria Vale', handle:'ariavale', title:'Creator Spotlight', edition:'Today', detail:'Cinematic storytelling and collaborative productions.', initials:'AV', targetId:'demo-creator-aria', publicProfile:true, imageUrl:null }],
  writers: [{ kind:'writer', name:'Mara Bell', handle:'marabell', title:'Writer Spotlight', edition:'Today', detail:'Character-led scripts with clear licensing controls.', initials:'MB', targetId:'demo-writer-mara', publicProfile:true, imageUrl:null }],
  editors: [{ kind:'editor', name:'Sam Reed', handle:'samreed', title:'Audio Editor Spotlight', edition:'Today', detail:'Dialogue editing, mixing and production polish.', initials:'SR', targetId:'demo-editor-sam', publicProfile:true, imageUrl:null }],
  listener: { kind:'listener', name:'Jamie', handle:'jamielistens', title:'Listener Spotlight', edition:'This week', detail:'A regular listener supporting independent work.', initials:'JL', targetId:'demo-listener-jamie', publicProfile:true, imageUrl:null, listenerRank:3, weeklyTrackedMinutes:286, weeklyTopSevenCount:2 },
};

export const demoCreatorDashboard = {
  metrics: { released: 14, drafts: 3, verifiedListeningMinutes: 18420, uniqueListeners: 2314 },
  releases: [
    { id:'demo-draft-1', title:'After Midnight', description:'Live Nightjar Original demo release.', category:'Story', genre:'Contemporary romance', mood:'Atmospheric', tags:['Atmospheric','Cinematic'], tropes:['Slow burn'], durationMinutes:31, audioAvailable:true, artworkUrl:null, status:'released', contributors:[{userId:'demo-writer-mara',name:'Mara Bell',role:'Writer'},{userId:'demo-editor-sam',name:'Sam Reed',role:'Audio Editor'}], contentRating:'adult', seriesTitle:'City After Dark', episodeNumber:1, nightjarOriginal:true, productionNote:'Demo release.' },
    { id:'demo-draft-2', title:'Room 47', description:'A draft awaiting final audio.', category:'Audio roleplay', genre:'Contemporary romance', mood:'Intimate', tags:['Dialogue-heavy'], tropes:['Neighbours'], durationMinutes:0, audioAvailable:false, artworkUrl:null, status:'draft', contributors:[{userId:'demo-writer-ivy',name:'Ivy North',role:'Writer'}], contentRating:'adult', seriesTitle:null, episodeNumber:null, nightjarOriginal:false, productionNote:null },
    { id:'demo-draft-3', title:'Orbit: Signal Lost', description:'Submitted collaborative production.', category:'Audio drama', genre:'Sci-fi romance', mood:'Cinematic', tags:['Immersive','Sound-rich'], tropes:['Forbidden attraction'], durationMinutes:39, audioAvailable:true, artworkUrl:null, status:'pending_review', contributors:[{userId:'demo-writer-mara',name:'Mara Bell',role:'Writer'},{userId:'demo-editor-sam',name:'Sam Reed',role:'Audio Editor'}], contentRating:'adult', seriesTitle:'Orbit', episodeNumber:2, nightjarOriginal:false, productionNote:'Awaiting moderation in simulation.' },
  ],
};

export const demoWriterScripts = [
  {
    id:'demo-script-1', title:'The Observatory', status:'Approved', version:4, content:'[DEMO MANUSCRIPT CONTENT]\nA protected manuscript would appear here for authorised readers.',
    lastEditorialComment:'Approved after dialogue pacing revision.',
    rights:{ copyrightOwner:'Mara Bell', writerRetainsCopyright:true, licenceType:'non-exclusive', licenceLength:'24 months', adaptationApprovalRequired:true, significantEditsApprovalRequired:true, castingApprovalRequired:true, finalAudioApprovalRequired:true, aiTrainingAllowed:false, commercialUse:true, withdrawalTerms:'Withdrawal available at end of agreed licence period.' },
    marketplace:{ visibility:'marketplace', synopsis:'A remote observatory, a failing signal and two people who should not become attached.', genres:['Sci-fi romance'], tropes:['Forbidden attraction','Slow burn'], commissionPricePence:18000, collaborationWanted:true, editorWanted:false },
  },
  {
    id:'demo-script-2', title:'Room 47', status:'Under review', version:2, content:'[DEMO MANUSCRIPT CONTENT]', lastEditorialComment:'Tighten the final scene and clarify performance notes.',
    rights:{ copyrightOwner:'Mara Bell', writerRetainsCopyright:true, licenceType:'none', licenceLength:'', adaptationApprovalRequired:true, significantEditsApprovalRequired:true, castingApprovalRequired:false, finalAudioApprovalRequired:false, aiTrainingAllowed:false, commercialUse:false, withdrawalTerms:'' },
    marketplace:{ visibility:'invitation', synopsis:'A neighbourly encounter that becomes something more.', genres:['Contemporary romance'], tropes:['Neighbours','Slow burn'], commissionPricePence:12000, collaborationWanted:true, editorWanted:true },
  },
  {
    id:'demo-script-3', title:'Rain Check', status:'Draft', version:1, content:'[DEMO MANUSCRIPT CONTENT]', lastEditorialComment:null,
    rights:{ copyrightOwner:'Mara Bell', writerRetainsCopyright:true, licenceType:'none', licenceLength:'', adaptationApprovalRequired:true, significantEditsApprovalRequired:true, castingApprovalRequired:false, finalAudioApprovalRequired:false, aiTrainingAllowed:false, commercialUse:false, withdrawalTerms:'' },
    marketplace:{ visibility:'private', synopsis:'', genres:['Romantic story'], tropes:['Second chance'], commissionPricePence:null, collaborationWanted:false, editorWanted:false },
  },
];

export const demoEditorQueue = [
  { id:'demo-script-2', title:'Room 47', status:'Under review', version:2, lastEditorialComment:'Tighten the final scene and clarify performance notes.' },
  { id:'demo-editor-script-2', title:'Signal Lost', status:'Submitted', version:3, lastEditorialComment:'No editorial note recorded yet.' },
  { id:'demo-editor-script-3', title:'Sunday Morning', status:'Revision requested', version:2, lastEditorialComment:'Please reduce duplicated stage direction and mark intended pauses.' },
];

export const demoDirectory = [
  { userId:'demo-creator-aria', name:'Aria Vale', role:'creator' },
  { userId:'demo-creator-rowan', name:'Rowan Ash', role:'creator' },
  { userId:'demo-creator-luca', name:'Luca Grey', role:'creator' },
  { userId:'demo-writer-mara', name:'Mara Bell', role:'writer' },
  { userId:'demo-writer-ivy', name:'Ivy North', role:'writer' },
  { userId:'demo-editor-sam', name:'Sam Reed', role:'editor' },
  { userId:'demo-editor-rin', name:'Rin Cole', role:'editor' },
];

export const demoCollaborations = [
  { id:'demo-collab-1', scriptId:'demo-script-1', scriptTitle:'The Observatory', writerUserId:'demo-writer-mara', writerName:'Mara Bell', recipientUserId:'demo-creator-aria', recipientName:'Aria Vale', recipientRole:'creator', message:'I think your cinematic style fits the restrained sci-fi tone.', paymentProposal:'£180 flat script licence', licenceSummary:'24-month non-exclusive licence', status:'accepted', responseNote:'Love the tone. Happy to move this into production.' },
  { id:'demo-collab-2', scriptId:'demo-script-2', scriptTitle:'Room 47', writerUserId:'demo-writer-mara', writerName:'Mara Bell', recipientUserId:'demo-editor-sam', recipientName:'Sam Reed', recipientRole:'editor', message:'Could you handle dialogue cleanup and final mix?', paymentProposal:'£120 editing fee', licenceSummary:'Production services only', status:'discussing', responseNote:'Available next week; let us confirm delivery dates.' },
  { id:'demo-collab-3', scriptId:'demo-script-3', scriptTitle:'Rain Check', writerUserId:'demo-writer-mara', writerName:'Mara Bell', recipientUserId:'demo-creator-rowan', recipientName:'Rowan Ash', recipientRole:'creator', message:'A quieter second-chance piece that may suit your catalogue.', paymentProposal:'Discuss', licenceSummary:'12-month non-exclusive licence', status:'sent', responseNote:'' },
];

export const demoMarketplaceScripts = [
  demoWriterScripts[0],
  {
    id:'demo-market-ivy-1', title:'Northbound', writerUserId:'demo-writer-ivy', writerName:'Ivy North', writerHandle:'ivynorth', status:'Approved',
    rights:{ writerRetainsCopyright:true, licenceType:'non-exclusive' },
    marketplace:{ visibility:'marketplace', synopsis:'Two strangers share an overnight train journey and a conversation neither expected.', genres:['Romantic story'], tropes:['Strangers to lovers','Meet-cute'], commissionPricePence:14000, collaborationWanted:true, editorWanted:true },
  },
  {
    id:'demo-market-ivy-2', title:'The Last Table', writerUserId:'demo-writer-ivy', writerName:'Ivy North', writerHandle:'ivynorth', status:'Approved',
    rights:{ writerRetainsCopyright:true, licenceType:'exclusive' },
    marketplace:{ visibility:'marketplace', synopsis:'A closing shift, one remaining customer and a long-overdue conversation.', genres:['Contemporary romance'], tropes:['Second chance','Mutual pining'], commissionPricePence:16500, collaborationWanted:true, editorWanted:false },
  },
];

export const demoLibrary = {
  history: [
    { ...demoTracks[0], creatorName:demoTracks[0].creator, positionSeconds:1310, durationSeconds:1860, completed:false, favourite:true },
    { ...demoTracks[1], creatorName:demoTracks[1].creator, positionSeconds:1080, durationSeconds:1080, completed:true, favourite:true },
    { ...demoTracks[4], creatorName:demoTracks[4].creator, positionSeconds:540, durationSeconds:1620, completed:false, favourite:false },
    { ...demoTracks[2], creatorName:demoTracks[2].creator, positionSeconds:2640, durationSeconds:2640, completed:true, favourite:false },
  ],
  continueListening: [
    { ...demoTracks[0], creatorName:demoTracks[0].creator, positionSeconds:1310, durationSeconds:1860, completed:false, favourite:true },
    { ...demoTracks[4], creatorName:demoTracks[4].creator, positionSeconds:540, durationSeconds:1620, completed:false, favourite:false },
  ],
  favourites: [
    { ...demoTracks[0], creatorName:demoTracks[0].creator, positionSeconds:1310, durationSeconds:1860, completed:false, favourite:true },
    { ...demoTracks[1], creatorName:demoTracks[1].creator, positionSeconds:1080, durationSeconds:1080, completed:true, favourite:true },
  ],
  playlists: [
    { id:'demo-playlist-1', title:'Late night stories', releaseIds:['demo-release-1','demo-release-6'] },
    { id:'demo-playlist-2', title:'Quick listens', releaseIds:['demo-release-2','demo-release-4'] },
  ],
};

export const demoCompensation = {
  model:'capped_equal_rate', activePaidSubscribers:12500, standardMonthlyRatePence:150000, monthlyCapPence:300000,
  rateBands:[
    { minPaidSubscribers:0, monthlyRatePence:25000 },
    { minPaidSubscribers:1000, monthlyRatePence:50000 },
    { minPaidSubscribers:2500, monthlyRatePence:75000 },
    { minPaidSubscribers:5000, monthlyRatePence:100000 },
    { minPaidSubscribers:10000, monthlyRatePence:150000 },
    { minPaidSubscribers:20000, monthlyRatePence:200000 },
    { minPaidSubscribers:40000, monthlyRatePence:250000 },
    { minPaidSubscribers:75000, monthlyRatePence:300000 },
  ],
  eligibilityDefinition:'Demo only: eligible contracted Creators have completed their agreed monthly deliverables and remain in good standing.',
  popularityAffectsBaseRate:false, verifiedListeningIsAnalyticsOnly:true, payoutCadence:'Monthly',
};

export const demoTransparency = {
  planningMonthlyPricePence:500, compensationModel:'capped_equal_rate', creatorMonthlyCapPence:300000,
  popularityAffectsBaseRate:false, tipsEnabled:false, individualPurchasesEnabled:false,
  activeCreativeAccounts:{ creators:5, writers:4, editors:3 },
  principles:[
    'Creators are paid against a published capped standard rate rather than popularity.',
    'Verified listening remains an analytics and discovery signal, not the standard-rate formula.',
    'Writers retain copyright unless an explicit agreement says otherwise.',
    'Nightjar does not permit AI training on protected manuscripts by default.',
  ],
};

export const demoNotifications = [
  { id:'demo-notification-1', type:'release', title:'New release from Aria Vale', message:'The Observatory is now available.', read:false },
  { id:'demo-notification-2', type:'collaboration', title:'Collaboration updated', message:'Room 47 moved to discussion.', read:false },
  { id:'demo-notification-3', type:'spotlight', title:'Writer Spotlight', message:'Mara Bell is today’s Writer Spotlight.', read:true },
];


const demoModerationProfileImage = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3e2438"/><stop offset="1" stop-color="#151017"/></linearGradient></defs><rect width="900" height="900" fill="url(#g)"/><circle cx="450" cy="330" r="150" fill="#b995ad"/><path d="M170 850c20-210 135-320 280-320s260 110 280 320" fill="#7c536f"/><text x="450" y="790" text-anchor="middle" fill="#f4eaf1" font-family="Arial" font-size="42">SAFE DEMO PROFILE</text></svg>`)}`;
const demoModerationArtworkImage = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17131b"/><stop offset=".55" stop-color="#5f3d58"/><stop offset="1" stop-color="#140f15"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g2)"/><circle cx="930" cy="180" r="105" fill="#c6a8bc" opacity=".42"/><path d="M0 610C220 500 330 690 550 590s350-30 650-130v340H0z" fill="#0a080b" opacity=".72"/><text x="80" y="150" fill="#f4eaf1" font-family="Georgia" font-size="76">WINDOW SEAT</text><text x="84" y="205" fill="#cdb9c7" font-family="Arial" font-size="28">SAFE FICTIONAL DEMO ARTWORK</text></svg>`)}`;

export const demoAdminData = {
  applications: [
    { id:'demo-application-1', creatorName:'Nia Stone', email:'nia.demo@example.invalid', status:'pending' },
    { id:'demo-application-2', creatorName:'Theo March', email:'theo.demo@example.invalid', status:'waitlist' },
  ],
  subscriptions: [
    { id:'demo-sub-1', email:'listener.one@example.invalid', plan:'Nightjar · £5 monthly', status:'active', confirmedMonthlyAmountPence:500, currentPeriodEnd:'30 Oct 2026' },
    { id:'demo-sub-2', email:'listener.two@example.invalid', plan:'Nightjar · £5 monthly', status:'trialing', confirmedMonthlyAmountPence:500, currentPeriodEnd:'04 Oct 2026' },
    { id:'demo-sub-3', email:'listener.three@example.invalid', plan:'Nightjar · £5 monthly', status:'past_due', confirmedMonthlyAmountPence:500, currentPeriodEnd:'27 Sep 2026' },
  ],
  commercial: {
    subscriptions:{ active:12500, trialing:420, pastDue:86 },
    confirmedGrossMrrPence:6250000,
    activePaidSubscribers:12500,
    unpricedActiveSubscriptions:0,
    trialPotentialPence:210000,
    pastDueAtRiskPence:43000,
    potentialGrossWithTrialsPence:6460000,
    activeCreatorCount:5,
    standardMonthlyCreatorRatePence:150000,
    plannedCreatorPayoutPence:750000,
    reservePence:937500,
    planningBalanceBeforeFeesTaxPence:4562500,
    settings:{
      planningMonthlyPricePence:500,
      reservePercent:15,
      payoutCadence:'Monthly',
      eligibleListeningDefinition:'Verified listening is used for analytics and discovery only in this demo.',
      compensationModel:'capped_equal_rate',
      creatorMonthlyCapPence:300000,
      creatorRateBands:[
        { minPaidSubscribers:0, monthlyRatePence:25000 },
        { minPaidSubscribers:1000, monthlyRatePence:50000 },
        { minPaidSubscribers:2500, monthlyRatePence:75000 },
        { minPaidSubscribers:5000, monthlyRatePence:100000 },
        { minPaidSubscribers:10000, monthlyRatePence:150000 },
        { minPaidSubscribers:20000, monthlyRatePence:200000 },
        { minPaidSubscribers:40000, monthlyRatePence:250000 },
        { minPaidSubscribers:75000, monthlyRatePence:300000 },
      ],
      creatorEligibilityDefinition:'Illustrative demo: contracted Creators who complete their agreed deliverables and remain in good standing.',
      popularityAffectsBaseRate:false,
      tipsEnabled:false,
      individualPurchasesEnabled:false,
    },
  },
  scripts: [
    { id:'demo-admin-script-1', title:'Room 47', status:'Submitted', version:2, editorUserId:'demo-editor-sam' },
    { id:'demo-admin-script-2', title:'Signal Lost', status:'Under review', version:3, editorUserId:'demo-editor-rin' },
    { id:'demo-admin-script-3', title:'Rain Check', status:'Submitted', version:1, editorUserId:null },
  ],
  editors: [
    { userId:'demo-editor-sam', name:'Sam Reed', email:'sam.demo@example.invalid' },
    { userId:'demo-editor-rin', name:'Rin Cole', email:'rin.demo@example.invalid' },
  ],
  reports: [
    { id:'demo-report-1', caseId:'DEMO-2041', category:'Feedback / feature request', status:'New', reporterName:'Jamie', reporterHandle:'jamielistens', reporterEmail:'jamie.demo@example.invalid', createdAt:'2026-09-28T12:20:00.000Z', summary:'Would like a quicker way to jump back into a followed series.' },
    { id:'demo-report-2', caseId:'DEMO-2036', category:'Technical issue', status:'Reviewing', reporterName:'Lex', reporterHandle:'lexlistens', reporterEmail:'lex.demo@example.invalid', createdAt:'2026-09-27T19:10:00.000Z', summary:'Playlist order did not look right after moving between devices.' },
  ],
  reviews: [
    { id:'demo-review-admin-1', releaseTitle:'After Midnight', reviewerName:'Jamie', reviewerHandle:'jamielistens', rating:5, review:'Loved the pacing and the way the full production team was credited.' },
    { id:'demo-review-admin-2', releaseTitle:'Window Seat', reviewerName:'Lex', reviewerHandle:'lexlistens', rating:4, review:'Really clean performance and audio.' },
  ],
  securityAlerts: [
    { id:'demo-alert-1', severity:'medium', riskScore:58, reason:'Repeated protected-reader screenshot signal', userName:'Demo Collaborator', userHandle:'democollab', relatedId:'demo-script-1', createdAt:'2026-09-28T11:42:00.000Z', status:'open' },
    { id:'demo-alert-2', severity:'low', riskScore:31, reason:'Rapid protected-reader selection attempts', userName:'Sample User', userHandle:'sampleuser', relatedId:'demo-script-2', createdAt:'2026-09-27T21:05:00.000Z', status:'open' },
  ],
  imageModeration: [
    { id:'demo-image-1', kind:'profile_avatar', ownerEmail:'aria.demo@example.invalid', fileName:'aria-profile.webp', contentType:'image/webp', previewUrl:demoModerationProfileImage },
    { id:'demo-image-2', kind:'release_artwork', ownerEmail:'rowan.demo@example.invalid', fileName:'window-seat-cover.webp', contentType:'image/webp', previewUrl:demoModerationArtworkImage },
  ],
};

