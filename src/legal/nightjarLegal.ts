export type NightjarLegalDocumentId = 'platform_terms' | 'privacy_notice' | 'professional_terms' | 'age_assurance_notice';

export const NIGHTJAR_LEGAL_VERSION = '2026-10-15.1';
export const NIGHTJAR_AGE_NOTICE_VERSION = '2026-10-14.3';
export const NIGHTJAR_PROFESSIONAL_VERSION = '2026-10-09.1';

export type NightjarLegalDocument = {
  id: NightjarLegalDocumentId;
  title: string;
  shortTitle: string;
  version: string;
  path: string;
  summary: string;
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
};

export const NIGHTJAR_LEGAL_DOCUMENTS: Record<NightjarLegalDocumentId, NightjarLegalDocument> = {
  platform_terms: {
    id:'platform_terms',
    title:'Nightjar Terms of Use',
    shortTitle:'Terms of Use',
    version:NIGHTJAR_LEGAL_VERSION,
    path:'/legal/terms',
    summary:'The rules for using Nightjar during private beta and, after legal review, the basis for the public service.',
    sections:[
      { heading:'1. Private beta and adults only', paragraphs:[
        'Nightjar is currently a private beta service intended only for adults aged 18 or over. Access may be limited, changed or withdrawn while the platform is being tested.',
        'Age assurance and access controls are part of Nightjar’s safety model. You must not attempt to bypass them or allow another person to use your verified account.'
      ]},
      { heading:'2. Your account', paragraphs:[
        'You are responsible for keeping your account credentials secure and for activity carried out through your account. Tell Nightjar promptly if you believe your account has been compromised.',
        'Professional roles may require approval. Approval may be suspended or removed where reasonably necessary for safety, fraud prevention, rights disputes, serious policy breaches or platform integrity.'
      ]},
      { heading:'3. Acceptable use and hard content boundaries', paragraphs:[
        'Do not use Nightjar to harass, threaten, exploit, impersonate, defraud or unlawfully target another person. Do not upload unlawful material or content you do not have the necessary rights or permissions to use.',
        'Nightjar is an adults-only platform, but adult status does not make every form of content acceptable. Nightjar does not permit sexual content involving minors, anyone presented as under 18, sexualised age-play involving child presentation, incest content, sexual exploitation, or material whose creation or publication is unlawful. Content involving real people must respect applicable consent, privacy, performer and intellectual-property rights.',
        'Nightjar may maintain additional safety and content standards as the platform develops. Published content remains subject to moderation, age-assurance controls, safety rules and applicable law.'
      ]},
      { heading:'4. Content and moderation', paragraphs:[
        'Nightjar may review, restrict, reject, remove or unpublish content where reasonably required for safety, legal compliance, rights protection, quality control or enforcement of these terms.',
        'Moderation approval is not a legal determination that content is lawful or that the uploader owns all necessary rights. Uploaders remain responsible for the accuracy of their rights and permission declarations.'
      ]},
      { heading:'5. Availability and beta changes', paragraphs:[
        'Features, pricing, creator systems and workflows may change during beta. Nightjar may need to interrupt the service for maintenance, security, testing or legal changes.',
        'Where a future change materially affects paid consumer rights, Nightjar will provide appropriate information and any rights required by applicable consumer law.'
      ]},
      { heading:'6. Intellectual property in the platform', paragraphs:[
        'Nightjar’s software, branding, interface and platform materials remain protected by applicable intellectual-property rights. These terms do not transfer ownership of the Nightjar platform to users.'
      ]},
      { heading:'7. Ending access', paragraphs:[
        'You may stop using Nightjar at any time. Nightjar may suspend or terminate access where reasonably necessary for serious or repeated breaches, legal requirements, safety risks, fraud, rights infringement or security.',
        'Any contractual payment, licensing or content-removal obligations that are intended to survive account closure continue according to their applicable terms.'
      ]},
      { heading:'8. Protecting the community and creative work', paragraphs:[
        'Nightjar restricts unauthorised copying, extraction, recording, bulk collection and redistribution of private scripts, unreleased media and restricted platform content. Members must respect copyright, licences, role access and other creators\' permissions.',
        'To investigate security incidents, Nightjar records limited account-linked events such as protected-content opens, blocked copy/print/download actions, and capture-related shortcuts or operating-system callbacks when a device supports them. Nightjar does not record everything you type, log your passwords or silently activate your camera or microphone.',
        'Browser screenshot and screen-recording detection is incomplete. An isolated keyboard shortcut, screen-sharing activity or missing signal is not by itself proof of misuse. Nightjar reviews evidence and context before any discretionary enforcement.',
        'Serious or repeated violations may lead to temporary suspension or termination following a reasonable review. Suspended members may contact Nightjar Support to challenge a decision; access restrictions do not eliminate applicable privacy or contractual rights.'
      ]},
      { heading:'9. Beta legal status', paragraphs:[
        'This document is the Nightjar private-beta Terms of Use. It must receive UK solicitor review and final operator details before public commercial launch. Nothing in these terms excludes rights or remedies that cannot lawfully be excluded.'
      ]},
    ],
  },

  privacy_notice: {
    id:'privacy_notice',
    title:'Nightjar Privacy Notice',
    shortTitle:'Privacy Notice',
    version:NIGHTJAR_LEGAL_VERSION,
    path:'/legal/privacy',
    summary:'How Nightjar handles account, safety, content, payment, communication and usage information.',
    sections:[
      { heading:'1. What Nightjar collects', paragraphs:[
        'Nightjar may process account details, profile information, role applications, age-assurance status, uploaded content and metadata, collaborations, messages, moderation records, security events, notification-device information, payment/subscription records and support or safety reports.',
        'To protect accounts and creative work, Nightjar may log limited security-related interactions, such as a protected document being opened, blocked copying, a print or save shortcut, a possible screenshot shortcut and a platform or device capture signal where supported. These records may include the account ID, time, page and event type. A shortcut signal is not proof that a capture occurred. Nightjar does not record general keystrokes, typed messages, passwords or form contents for this purpose.',
        'Nightjar should minimise data collection to what is reasonably necessary for the relevant purpose. Age-assurance providers should return the minimum result Nightjar needs rather than unnecessary identity data wherever the provider supports that model.'
      ]},
      { heading:'2. Why it is used', paragraphs:[
        'Data is used to provide and secure accounts, operate the service, deliver content and notifications, manage professional collaboration, process subscriptions or payouts, moderate content, protect users and rights holders, investigate reports, meet legal obligations and improve Nightjar.',
        'Different processing purposes may rely on different lawful bases. Nightjar does not treat this Privacy Notice as blanket consent to all processing.'
      ]},
      { heading:'3. Who receives information', paragraphs:[
        'Information may be processed by service providers needed to run Nightjar, such as hosting, authentication, age assurance, email, payment, security and professional advisers. Public profile information and approved public work are visible according to the choices and publishing controls shown in Nightjar.',
        'Nightjar does not make private manuscripts, private messages or unpublished creator files public merely because they are stored in the service.'
      ]},
      { heading:'4. Notifications and device data', paragraphs:[
        'If you enable push notifications, Nightjar stores a device messaging token and limited device metadata needed to deliver and troubleshoot notifications. Push can be disabled on the device and Nightjar provides notification-category and privacy wording controls.',
        'Because Nightjar is an adult service, notification wording defaults to discreet rather than exposing sensitive content on a lock screen.'
      ]},
      { heading:'5. Retention, security and rights', paragraphs:[
        'Nightjar should retain information only for as long as needed for the relevant operational, contractual, safety, financial or legal purpose. Security and evidence records may need different retention periods from ordinary profile data.',
        'UK data-protection rights can include access, correction, deletion, restriction, objection and portability depending on the circumstances and lawful basis. Requests and privacy questions can be directed to Nightjar through the support route published in the app.'
      ]},
      { heading:'6. International services and processors', paragraphs:[
        'Some technology providers may process information outside the UK. Before public launch, Nightjar must document its processors, international-transfer safeguards and retention schedule in the final Privacy Notice.'
      ]},
      { heading:'7. Account security event monitoring', paragraphs:[
        'For service security, fraud prevention and protection of creators\' work, Nightjar records limited in-app security metadata: account identifier, date and time, protected resource identifier, app page, attempted protected action and capture signals where supported. Some events can be associated with a browser/device token. Nightjar does not record general keystrokes or store passwords, private message text or the contents of your clipboard as security telemetry.',
        'A web browser cannot reliably detect screenshots or external screen recordings. Capture signals are treated as indicators for contextual review, not conclusive evidence or grounds for an automatic ban. We may restrict an account based on substantiated security or policy breaches after human review, record the reason, and provide a support review route.',
        'Necessary security processing relies on an applicable legal basis assessed by Nightjar, such as legitimate interests where appropriate, rather than forced consent. Accepting the Terms is required for continued use; acknowledging this notice confirms you have seen it, not that you consent to optional tracking. Optional push notifications and marketing choices remain separately controllable.',
        'Only authorised administrators may view identifiable security records. Records will be retained for defined, proportionate periods with access and deletion controls, subject to justified dispute or legal holds. Nightjar must finalise retention periods and a legitimate-interests assessment before expanding systematic monitoring.'
      ]},
      { heading:'8. Beta legal status', paragraphs:[
        'This is the private-beta Privacy Notice framework. The final public version must identify the legal operator and contact details, applicable lawful bases, processor categories, retention periods and international-transfer arrangements following professional legal/data-protection review.'
      ]},
    ],
  },

  age_assurance_notice: {
    id:'age_assurance_notice',
    title:'Nightjar Age Verification & Didit Privacy Notice',
    shortTitle:'Age Verification',
    version:NIGHTJAR_AGE_NOTICE_VERSION,
    path:'/legal/age-verification',
    summary:'Why everyone must verify as 18+, what Didit handles, what Nightjar retains, and how to request help.',
    sections:[
      { heading:'1. Why Nightjar checks your age', paragraphs:[
        'Nightjar is an adults-only audio service. Every account, including existing creators and invited testers, must complete highly effective age assurance before accessing adult material. This helps prevent access by people under 18 and supports Nightjar’s duties under the UK Online Safety Act and other applicable laws.',
        'The check is separate from signing in, accepting platform terms, any creator approval and any subscription. Once your live 18+ result is valid on your account, routine visits, updates and device changes do not require another ID check.'
      ]},
      { heading:'2. Who processes identity evidence', paragraphs:[
        'Nightjar requests the check and acts as the data controller. Didit is the verification provider and acts as a data processor on Nightjar’s instructions. You complete the identity check on Didit’s secure hosted service.',
        'Depending on the selected Didit workflow, Didit may request a government-issued photo ID, an image or video selfie, liveness/face-matching checks and details on the ID such as your name and date of birth. Didit processes and holds this verification evidence. Nightjar does not receive or save copies of the ID images, selfie recordings or extracted date of birth in its application database.',
        'Nightjar’s authorised administrators may need to use the restricted Didit Business Console to review an unsuccessful verification, investigate misuse, handle requests, or supply legally required evidence. This is controlled access, not unrestricted visibility of your identity data.'
      ]},
      { heading:'3. What Nightjar retains and why', paragraphs:[
        'Nightjar receives and stores a minimum account-linked verification record: provider name, session reference, whether the adult check passed, verification status and timestamps, and any revocation/review indicator. It uses this record to allow or prevent adult access, troubleshoot verification, avoid charging for repeat sessions, and maintain a security/compliance audit trail.',
        'The approved age status is retained while the account and its verification remain valid. On account closure, Nightjar reviews what limited records must be deleted and what evidence must temporarily be retained for legal obligations, disputes or safety; longer statutory or dispute holds take precedence where genuinely applicable.',
        'Nightjar has configured a six-month retention period for identity-verification session evidence in its Didit application, confirmed by its administrator on 14 October 2026. This applies to existing and new verification sessions for that application. Some categories of data have different retention arrangements: Didit states its API audit logs may be retained for 365 days, and separate security records or legally required holds may last longer. Nightjar retains a minimal verified-adult status tied to your account so that deleting verification images after six months does not require you to pay for or complete another identity check.'
      ]},
      { heading:'4. Security, sharing and your choices', paragraphs:[
        'Didit states that verification evidence is encrypted in transit and at rest, processed in the EU by default and restricted to authorised personnel. Nightjar retains only the result needed for its gate and does not use the ID images for advertising or public profiles.',
        'You can read this notice before choosing to begin. If you do not wish to provide age evidence, you can decline, but Nightjar cannot provide access to adult material without a valid check. Acknowledging this notice records that it was presented to you; it is not blanket consent for unrelated data uses or a substitute for the provider’s own capture notices.',
        'Where processing involves biometric information, applicable legal grounds and additional safeguards must be reviewed separately. The underlying legal basis for necessary safety checks is not assumed to be user consent merely because this acknowledgement checkbox exists.'
      ]},
      { heading:'5. Privacy requests, corrections and disputes', paragraphs:[
        'Contact Nightjar through its published support/privacy route to request access, correction, restriction or deletion of information, or to challenge a verification result. Nightjar, as controller, is responsible for coordinating requests with Didit where relevant. Deletion and disclosure requests are assessed against applicable legal requirements.',
        'If your check is declined or under review, ask Nightjar support for a review rather than starting repeated paid checks. Nightjar may require a new check only following genuine revocation, an unresolved fraudulent use concern or a justified legal or safety review.'
      ]},
    ],
  },

  professional_terms: {
    id:'professional_terms',
    title:'Nightjar Professional & Content Terms',
    shortTitle:'Professional & Content Terms',
    version:NIGHTJAR_PROFESSIONAL_VERSION,
    path:'/legal/professional',
    summary:'Additional rules for VA Creators, Writers, Audio Editors and Artists who upload, collaborate, publish or earn through Nightjar.',
    sections:[
      { heading:'1. Your work remains yours', paragraphs:[
        'Nightjar does not take ownership of your copyright merely because you upload work. Subject to any separate collaboration or commercial agreement, creators retain the rights they legally own.',
        'To host, moderate, deliver and display content you choose to publish, Nightjar needs a limited licence to store, process, reproduce and communicate that content only as reasonably necessary to operate, secure, promote and provide the Nightjar service. This does not grant Nightjar permission to sell your copyright or use protected manuscripts for AI training.'
      ]},
      { heading:'2. Rights and permission warranties', paragraphs:[
        'Whenever Nightjar asks you to confirm rights, you must only confirm if you genuinely own or control the necessary rights or have a valid licence or other legal authority for the intended use.',
        'If another person’s voice, writing, music, artwork, performance, client material or other protected contribution appears in your upload, you must have any permission required to upload and publicly use it in the way selected.'
      ]},
      { heading:'3. Role-specific publishing', paragraphs:[
        'VA Creator releases, Writer manuscripts, Audio Editor showcase samples and Artist portfolio pieces use different publication controls because the underlying rights and privacy risks are different.',
        'Private source material remains private unless an authorised workflow explicitly publishes it. Public portfolio claims must not falsely imply that Nightjar verified external credits that Nightjar cannot independently verify.'
      ]},
      { heading:'4. Collaboration and licensing', paragraphs:[
        'Writers, performers, editors, artists and other collaborators should record ownership, licence scope, payment, approvals and permitted uses clearly. A Nightjar workflow or credit does not replace an agreement where the parties need one.',
        'Exclusive licences, assignments of copyright and other significant rights transactions may require specific written terms. Nightjar’s collaboration tools are intended to record and support agreements, not manufacture rights a party does not possess.'
      ]},
      { heading:'5. Payments and professional status', paragraphs:[
        'Professional approval does not guarantee earnings, minimum work, employment status or a particular volume of listeners. Any creator-rate, commission, gift, payout or revenue-sharing system is governed by the applicable published commercial rules and any individual contract.',
        'Professionals remain responsible for their own tax and business obligations unless Nightjar is legally required to handle a particular deduction or reporting duty.'
      ]},
      { heading:'6. Moderation, disputes and takedowns', paragraphs:[
        'Nightjar may hold publication while rights, consent, safety or authenticity questions are reviewed. Content may be removed or restricted while a credible rights or safety dispute is investigated.',
        'Knowingly false rights declarations, impersonation, stolen work or deliberate misuse of another person’s material may lead to removal of professional privileges or account action.'
      ]},
      { heading:'7. No AI-training permission by default', paragraphs:[
        'Nightjar does not interpret upload to the platform as permission to use protected manuscripts, performances, artwork or professional portfolio files to train generative AI models. Any future materially different use would require an appropriate legal basis and clear, specific terms rather than being silently added through an unrelated setting.'
      ]},
      { heading:'8. Beta legal status', paragraphs:[
        'These are private-beta Professional & Content Terms. Creator contracts, payout terms, intellectual-property licences and the final platform terms require UK legal review before commercial public launch.'
      ]},
    ],
  },
};

export const legalDocumentForPath = (pathname: string) =>
  Object.values(NIGHTJAR_LEGAL_DOCUMENTS).find((document) => document.path === pathname) ?? null;

export const currentLegalAcceptancePayload = (
  professional: boolean,
): Array<{ id: NightjarLegalDocumentId; version: string; accepted: true }> => {
  const documents: Array<{ id: NightjarLegalDocumentId; version: string; accepted: true }> = [
    { id:'platform_terms', version:NIGHTJAR_LEGAL_VERSION, accepted:true },
    { id:'privacy_notice', version:NIGHTJAR_LEGAL_VERSION, accepted:true },
  ];
  if (professional) {
    documents.push({ id:'professional_terms', version:NIGHTJAR_PROFESSIONAL_VERSION, accepted:true });
  }
  return documents;
};
