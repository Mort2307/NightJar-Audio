import { useState, type CSSProperties } from 'react';
import { Bell, Check, Heart, ImagePlus, ShieldCheck, Sparkles, Star, UserCircle2 } from 'lucide-react';
import SearchableMultiSelect from './SearchableMultiSelect';
import { nightjarHandleError, normaliseNightjarHandle, suggestNightjarHandle } from '../platform/profile-handle';
import AccountSecurityActivity from './AccountSecurityActivity';
import AccessibilityPreferences from './AccessibilityPreferences';
import SocialLinksEditor from './SocialLinksEditor';
import ContextHelp from './ContextHelp';
import LegalAgreementPanel from './LegalAgreementPanel';
import ProfileSectionBoundary from './ProfileSectionBoundary';
import ImageFramingEditor from './ImageFramingEditor';
import FramedApprovedImage from './FramedApprovedImage';
import type {ImageFraming} from '../platform/image-framing';
import { PROFILE_CATEGORY_OPTIONS, PROFILE_TROPE_OPTIONS } from '../data/nightjarTaxonomy';

type AccountRole = 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | 'artist';

type Props = {
  profile: any;
  setProfile: (updater: any) => void;
  userName?: string | null;
  userEmail?: string | null;
  role: AccountRole | null;
  roles?: AccountRole[];
  profileCompletion: number;
  profileLoading: boolean;
  profileDirty: boolean;
  profileBaseline: any | null;
  profileImageBusy: boolean;
  combinedTagOptions: readonly string[];
  tasteVector: any[];
  onUploadAvatar: (file: File) => Promise<void>;
  onSaveApprovedFraming:(kind:'avatar'|'banner',assetId:string,framing:ImageFraming)=>Promise<void>;
  onRemoveAvatar: () => Promise<void>;
  onUploadBanner: (file: File) => Promise<void>;
  onRemoveBanner: () => Promise<void>;
  onSave: () => Promise<void>;
  onRevert: () => void;
  notify: (message:string) => void;
  simulationMode?:boolean;
  onOpenEditorStudio?: () => void;
};

const roleLabel = (role: AccountRole | null) => {
  if (role === 'creator') return 'VA Creator';
  if (role === 'editor') return 'Audio Editor';
  if (role === 'writer') return 'Writer';
  if (role === 'artist') return 'Artist';
  if (role === 'admin') return 'Administrator';
  return 'Listener';
};

const roleSummary = (roles: AccountRole[] | undefined, fallback: AccountRole | null) => {
  const unique = Array.from(new Set((Array.isArray(roles) ? roles : []).filter(Boolean)));
  return unique.length ? unique.map((item) => roleLabel(item)).join(' · ') : roleLabel(fallback);
};

export default function UserProfileStudio({
  profile,
  setProfile,
  userName,
  userEmail,
  role,
  roles,
  profileCompletion,
  profileLoading,
  profileDirty,
  profileBaseline,
  profileImageBusy,
  combinedTagOptions,
  tasteVector,
  onUploadAvatar,
  onSaveApprovedFraming,
  onRemoveAvatar,
  onUploadBanner,
  onRemoveBanner,
  onSave,
  onRevert,
  notify,
  simulationMode=false,
  onOpenEditorStudio,
}: Props) {
  const [framingUpload,setFramingUpload]=useState<{file:File;shape:'portrait'|'banner'}|null>(null);
  const [approvedFraming,setApprovedFraming]=useState<{kind:'avatar'|'banner';assetId:string;src:string}|null>(null);
  const handleProblem = nightjarHandleError(profile.handle);
  const suggestedHandle = handleProblem ? suggestNightjarHandle(profile.handle) : '';
  const displayName = String(profile.displayName || userName || userEmail?.split('@')[0] || 'Nightjar member');
  const handle = profile.handle ? '@' + String(profile.handle).replace(/^@/,'') : '@yourhandle';
  const initials = profile.avatarInitials || displayName.split(/\s+/).map((part:string)=>part[0]).join('').slice(0,2).toUpperCase() || 'NJ';
  const topTags = [
    ...(Array.isArray(profile.favouriteTags) ? profile.favouriteTags : []),
    ...(Array.isArray(profile.favouriteCategories) ? profile.favouriteCategories : []),
    ...(Array.isArray(profile.favouriteTropes) ? profile.favouriteTropes : []),
  ].slice(0, 8);

  const discoverable = role === 'admin' ? profile.adminCommunityVisible === true : profile.publicProfile !== false;

  return <div className="premium-user-profile">
    <section className="premium-user-hero">
      <div className="premium-user-hero-glow" aria-hidden="true"/>
      <div className="premium-user-avatar-wrap">
        <span className="premium-user-avatar" data-tone={profile.avatarTone || 'plum'}>
          {profile.avatarUrl ? <FramedApprovedImage src={profile.avatarUrl} alt="" framing={profile.avatarFraming} defaultMode="fill"/> : initials}
        </span>
        <span className={!discoverable ? 'premium-profile-state private' : 'premium-profile-state'}>
          {discoverable ? 'Discoverable' : 'Private'}
        </span>
      </div>

      <div className="premium-user-hero-copy">
        <span className="eyebrow"><Sparkles size={13}/> YOUR NIGHTJAR PROFILE</span>
        <h1>{displayName}</h1>
        <div className="premium-user-handle-row"><span>{handle}</span>{profile.pronouns && <span>{profile.pronouns}</span>}<span>{roleSummary(roles, role)}</span></div>
        <p>{profile.headline || 'Your own corner of Nightjar — shaped by what you choose to share.'}</p>
        {!!topTags.length && <div className="creator-profile-tags premium-user-top-tags">{topTags.map((tag:string)=><span key={tag}>{tag}</span>)}</div>}
      </div>

      <div className="premium-user-readiness">
        <div className="premium-user-readiness-score"><strong>{profileCompletion}%</strong><span>Profile details</span></div>
        <div className="nj-profile-progress-track"><span style={{width:profileCompletion + '%'}}/></div>
        <small>{profileCompletion >= 85 ? 'Your profile feels established.' : profileCompletion >= 60 ? 'Looking good — a few details will make it richer.' : 'Build this into a profile people remember.'}</small>
      </div>
    </section>

    <div className="premium-user-value-strip">
      <div><UserCircle2 size={16}/><span><strong>Personal identity</strong><small>One profile across Nightjar</small></span></div>
      <div><Heart size={16}/><span><strong>Your tastes</strong><small>Chosen by you, not inferred as identity</small></span></div>
      <div><ShieldCheck size={16}/><span><strong>Your privacy</strong><small>Only deliberate public details are shown</small></span></div>
      <div><Star size={16}/><span><strong>Your presence</strong><small>Listeners and professionals get equal profile care</small></span></div>
    </div>

    {role === 'editor' && onOpenEditorStudio && <section className="premium-role-handoff editor">
      <div><span className="mini-label">AUDIO EDITOR</span><h2>Your professional identity has its own Studio.</h2><p>Your personal profile stays personal. Editing services, experience, DAWs, credits, portfolio and collaboration availability live in Editor Studio.</p></div>
      <button className="primary-button" onClick={onOpenEditorStudio}>Open Editor Studio</button>
    </section>}

    <div className="premium-user-profile-grid">
      <article className="panel premium-user-card identity">
        <div className="premium-user-card-head"><div><span className="mini-label">IDENTITY</span><h2>How people see you.</h2></div><UserCircle2 size={18}/></div>
        <div className="premium-avatar-editor">
          <span className="premium-avatar-editor-preview" data-tone={profile.avatarTone || 'plum'}>
            {profile.avatarUrl ? <FramedApprovedImage src={profile.avatarUrl} alt="Approved profile" framing={profile.avatarFraming} defaultMode="fill"/> : initials}
          </span>
          <div>
            <label className="secondary-button upload-label"><ImagePlus size={14}/> {profileImageBusy ? 'Optimising photo…' : profile.avatarUrl ? 'Replace portrait' : 'Add portrait'}<input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif" hidden disabled={profileImageBusy} onChange={(event)=>{const file=event.target.files?.[0]; if(file)setFramingUpload({file,shape:'portrait'}); event.currentTarget.value='';}}/></label>
             <ContextHelp topic="profile-photo"/>
            {profile.avatarUrl && profile.avatarStatus === 'approved' && profile.avatarAssetId &&
              <button type="button" className="secondary-button" disabled={profileImageBusy}
                onClick={()=>setApprovedFraming({kind:'avatar',assetId:String(profile.avatarAssetId),src:String(profile.avatarUrl)})}>
                Adjust approved portrait
              </button>}
            {(profile.avatarUrl || profile.pendingAvatarAssetId || profile.avatarCleanupPending) && <button className="ghost-button" disabled={profileImageBusy} onClick={()=>void onRemoveAvatar()}>{profile.avatarCleanupPending?'Retry portrait cleanup':'Remove'}</button>}
            {profile.avatarCleanupPending && <small role="status">Portrait is hidden. Private file deletion needs another attempt.</small>}
            {profile.pendingAvatarStatus === 'pending' && <small>New portrait awaiting moderation.</small>}
            {profile.pendingAvatarStatus === 'rejected' && <small>The submitted portrait was not approved.</small>}
          </div>
        </div>

        <div className="premium-form-two">
          <label>Chosen name<input maxLength={80} value={profile.displayName ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,displayName:event.target.value}))} placeholder="How Nightjar should call you"/></label>
          <label>@handle <span className="optional-label">optional</span>
            <input maxLength={50} value={profile.handle ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,handle:event.target.value}))}
              placeholder="youruniquehandle" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={!!handleProblem} aria-describedby="nightjar-handle-guidance"/>
            <small id="nightjar-handle-guidance" role={handleProblem ? 'alert' : undefined}>
              {handleProblem || 'Use 3–30 letters, numbers, _ or -. Spaces and other symbols are not permitted. Blank is fine.'}
            </small>
            {handleProblem && <span className="profile-handle-fixes">
              {suggestedHandle && suggestedHandle !== normaliseNightjarHandle(profile.handle)
                && <button type="button" className="ghost-button" onClick={()=>setProfile((current:any)=>({...current,handle:suggestedHandle}))}>
                  Use @{suggestedHandle}
                </button>}
              <button type="button" className="ghost-button" onClick={()=>setProfile((current:any)=>({...current,handle:''}))}>Save without a handle</button>
            </span>}
          </label>
          <label>Pronouns <span className="optional-label">optional</span><input maxLength={60} value={profile.pronouns ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,pronouns:event.target.value}))} placeholder="e.g. they/them"/></label>
          <label>Profile tone<select value={profile.avatarTone || 'plum'} onChange={(event)=>setProfile((current:any)=>({...current,avatarTone:event.target.value}))}><option value="plum">Plum</option><option value="wine">Wine</option><option value="mauve">Mauve</option><option value="ivory">Ivory</option></select></label>
        </div>
      </article>

      <article className="panel premium-user-card presence">
        <div className="premium-user-card-head"><div><span className="mini-label">PRESENCE</span><h2>Introduce yourself.</h2></div><Sparkles size={18}/></div>
        <label>Profile headline<input maxLength={140} value={profile.headline ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,headline:event.target.value}))} placeholder="A short line that feels like you"/><small className="field-counter">{String(profile.headline ?? '').length}/140</small></label>
        <fieldset className="nj-profile-cover-choice">
          <legend>Public profile header</legend>
          <p>Your profile headline appears on the header image. Choose the classic Midnight Gold look or show your approved portrait in the background.</p>
          <div className="nj-profile-cover-options">
            <label><input type="radio" name="nightjar-profile-cover" value="cinematic" checked={profile.headerImageMode === 'cinematic'} onChange={()=>setProfile((current:any)=>({...current,headerImageMode:'cinematic'}))}/> Cinematic NightJar header</label>
            <label><input type="radio" name="nightjar-profile-cover" value="portrait" checked={profile.headerImageMode !== 'cinematic' && profile.headerImageMode !== 'custom'} onChange={()=>setProfile((current:any)=>({...current,headerImageMode:'portrait'}))}/> Use my approved profile photo</label>
            <label><input type="radio" name="nightjar-profile-cover" value="custom" checked={profile.headerImageMode === 'custom'} onChange={()=>setProfile((current:any)=>({...current,headerImageMode:'custom'}))}/> My custom cover image</label>
          </div>
          {profile.headerImageMode === 'portrait' && !profile.avatarUrl && <small>Upload a portrait and wait for approval before it can appear publicly. The Midnight Gold header stays visible until then.</small>}
          {profile.headerImageMode === 'custom' && profile.bannerStatus !== 'approved' && <small>Choose a cover image below and wait for approval. NightJar shows the cinematic header until the new cover is approved.</small>}
        </fieldset>
        <div className="nj-profile-banner-editor">
          <div className="nj-profile-banner-preview" role="img" aria-label="Approved custom cover preview">
            {profile.bannerStatus === 'approved' && profile.bannerUrl
              ? <FramedApprovedImage src={profile.bannerUrl} alt="" framing={profile.bannerFraming}
                  defaultMode="fit" absolute zIndex={-2} />
              : <span>YOUR NIGHTJAR COVER</span>}
            <span className="nj-profile-banner-title">{String(profile.headline || 'Your story. Your voice.')}</span>
          </div>
          <div className="nj-profile-banner-edit-actions">
            <label className="secondary-button upload-label"><ImagePlus size={14}/>
              {profileImageBusy ? 'Preparing cover…' : profile.bannerUrl ? 'Replace cover image' : 'Upload custom cover'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/avif" hidden
                disabled={profileImageBusy} onChange={(event)=>{const file=event.target.files?.[0];if(file)setFramingUpload({file,shape:'banner'});event.currentTarget.value='';}}/>
            </label>
            {profile.bannerStatus === 'approved' && profile.bannerUrl && profile.bannerAssetId &&
              <button type="button" className="secondary-button" disabled={profileImageBusy}
                onClick={()=>setApprovedFraming({kind:'banner',assetId:String(profile.bannerAssetId),src:String(profile.bannerUrl)})}>
                Adjust approved cover
              </button>}
            {(profile.bannerUrl || profile.pendingBannerAssetId || profile.bannerCleanupPending) && <button type="button" className="ghost-button" disabled={profileImageBusy}
              onClick={()=>void onRemoveBanner()}>{profile.bannerCleanupPending?'Retry cover cleanup':'Remove cover'}</button>}
            {profile.bannerCleanupPending && <small role="status">Cover is hidden. Private file deletion needs another attempt.</small>}
          </div>
          {profile.pendingBannerStatus === 'pending' && <small>Awaiting NightJar moderation; the previous approved cover remains live until approval.</small>}
          {profile.pendingBannerStatus === 'rejected' && <small>This cover wasn't approved. You can choose another image.</small>}
          <small>Use a landscape image (16:9 recommended). Images are resized and stripped of embedded location metadata before review.</small>
        </div>
        <label>About you<textarea maxLength={1200} value={profile.bio ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,bio:event.target.value}))} placeholder="Your story, your way."/><small className="field-counter">{String(profile.bio ?? '').length}/1200</small></label>
        <label>Welcome note <span className="optional-label">optional</span><textarea maxLength={300} value={profile.welcomeMessage ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,welcomeMessage:event.target.value}))} placeholder="A small message for people visiting your profile."/><small className="field-counter">{String(profile.welcomeMessage ?? '').length}/300</small></label>
        <label className="profile-toggle premium-profile-public-toggle"><input type="checkbox" checked={discoverable} onChange={(event)=>setProfile((current:any)=>role === 'admin' ? {...current,adminCommunityVisible:event.target.checked} : {...current,publicProfile:event.target.checked})}/>{role === 'admin' ? 'Show my Nightjar Team profile to the community' : 'Allow Nightjar members to discover my profile'}</label>
        {role === 'admin' && <ContextHelp topic="team-profile-visibility"/>}
      </article>

      <article className="panel premium-user-card discovery">
        <div className="premium-user-card-head"><div><span className="mini-label">YOUR WORLD</span><h2>What are you into? <ContextHelp topic="profile-interests"/></h2></div><Heart size={18}/></div>
        <SearchableMultiSelect label="Moods & tags" options={combinedTagOptions} values={profile.favouriteTags ?? []} onChange={(values)=>setProfile((current:any)=>({...current,favouriteTags:values}))} allowCreate={role !== 'admin'} createLabel="Add custom tag"/>
        <SearchableMultiSelect label="Tropes & themes" options={PROFILE_TROPE_OPTIONS} values={profile.favouriteTropes ?? []} onChange={(values)=>setProfile((current:any)=>({...current,favouriteTropes:values}))}/>
        <SearchableMultiSelect label="Categories" options={PROFILE_CATEGORY_OPTIONS} values={profile.favouriteCategories ?? []} onChange={(values)=>setProfile((current:any)=>({...current,favouriteCategories:values}))}/>
      </article>

      <article className="panel premium-user-card taste">
        <div className="premium-user-card-head"><div><span className="mini-label">YOUR LISTENING TASTES</span><h2>The stories and themes you enjoy. <ContextHelp topic="taste-constellation"/></h2></div><Star size={18}/></div>
        <div className="premium-taste-constellation">
          {tasteVector.length ? tasteVector.slice(0,10).map((item:any,index:number)=><div key={item.label} style={{'--weight':Math.max(.2,Math.min(1,Number(item.weight ?? .5))), '--index':index} as CSSProperties}><strong>{item.label}</strong><span>{Math.round(Number(item.weight ?? 0)*100)}%</span></div>) : <div className="people-empty"><Star size={17}/><strong>Your constellation will form naturally.</strong><span>Save, finish, replay and explore. Nightjar keeps this separate from your public identity.</span></div>}
        </div>
      </article>

      <ProfileSectionBoundary title="Social links"><SocialLinksEditor notify={notify} simulationMode={simulationMode} /></ProfileSectionBoundary>
      <ProfileSectionBoundary title="Accessibility preferences"><AccessibilityPreferences /></ProfileSectionBoundary>
      <ProfileSectionBoundary title="Legal agreements"><LegalAgreementPanel /></ProfileSectionBoundary>
      <ProfileSectionBoundary title="Sign-in activity"><AccountSecurityActivity /></ProfileSectionBoundary>
    </div>

    <div className="premium-profile-savebar">
      <div><Bell size={15}/><span><strong>{profileDirty ? 'You have unsaved profile changes.' : 'Your profile is saved.'}</strong><small>{profileDirty ? 'Keep shaping it, then save when it feels right.' : 'You can change any of this whenever you want.'}</small></span></div>
      <div>{profileDirty && profileBaseline && <button className="ghost-button" onClick={onRevert} disabled={profileLoading}>Revert</button>}<button className="primary-button" onClick={()=>void onSave()} disabled={profileLoading || !profileDirty}><Check size={14}/>{profileLoading?'Saving…':profileDirty?'Save profile':'Saved'}</button></div>
    </div>
    {approvedFraming && <ImageFramingEditor key={approvedFraming.assetId}
      approvedSrc={approvedFraming.src}
      shape={approvedFraming.kind==='banner'?'banner':'portrait'}
      initialFraming={approvedFraming.kind==='banner'
        ? profile.bannerFraming?.assetId===approvedFraming.assetId?profile.bannerFraming:null
        : profile.avatarFraming?.assetId===approvedFraming.assetId?profile.avatarFraming:null}
      onCancel={()=>setApprovedFraming(null)}
      onSaveFraming={async framing=>{
        await onSaveApprovedFraming(approvedFraming.kind,approvedFraming.assetId,framing);
        setApprovedFraming(null);
      }}
    />}
    {framingUpload && <ImageFramingEditor
      file={framingUpload.file}
      shape={framingUpload.shape}
      onCancel={()=>setFramingUpload(null)}
      onApply={async framed=>{
        const file=framed;
        if(framingUpload.shape==='portrait')await onUploadAvatar(file);
        else await onUploadBanner(file);
        setFramingUpload(null);
      }}
    />}
  </div>;
}
