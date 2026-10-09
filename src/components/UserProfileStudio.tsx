import type { CSSProperties } from 'react';
import { Bell, Check, Heart, ImagePlus, ShieldCheck, Sparkles, Star, UserCircle2 } from 'lucide-react';
import SearchableMultiSelect from './SearchableMultiSelect';
import AccountSecurityActivity from './AccountSecurityActivity';
import AccessibilityPreferences from './AccessibilityPreferences';
import LegalAgreementPanel from './LegalAgreementPanel';
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
  onRemoveAvatar: () => Promise<void>;
  onSave: () => Promise<void>;
  onRevert: () => void;
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
  const unique = Array.from(new Set((roles ?? []).filter(Boolean)));
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
  onRemoveAvatar,
  onSave,
  onRevert,
  onOpenEditorStudio,
}: Props) {
  const displayName = profile.displayName || userName || userEmail?.split('@')[0] || 'Nightjar member';
  const handle = profile.handle ? '@' + String(profile.handle).replace(/^@/,'') : '@yourhandle';
  const initials = profile.avatarInitials || displayName.split(/\s+/).map((part:string)=>part[0]).join('').slice(0,2).toUpperCase() || 'NJ';
  const topTags = [
    ...(profile.favouriteTags ?? []),
    ...(profile.favouriteCategories ?? []),
    ...(profile.favouriteTropes ?? []),
  ].slice(0, 8);

  return <div className="premium-user-profile">
    <section className="premium-user-hero">
      <div className="premium-user-hero-glow" aria-hidden="true"/>
      <div className="premium-user-avatar-wrap">
        <span className="premium-user-avatar" data-tone={profile.avatarTone || 'plum'}>
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" loading="lazy" decoding="async"/> : initials}
        </span>
        <span className={profile.publicProfile === false ? 'premium-profile-state private' : 'premium-profile-state'}>
          {profile.publicProfile === false ? 'Private' : 'Discoverable'}
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
        <div className="premium-user-readiness-score"><strong>{profileCompletion}%</strong><span>Profile depth</span></div>
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
        <div className="premium-user-card-head"><div><span className="mini-label">IDENTITY</span><h2>The version of you people meet.</h2></div><UserCircle2 size={18}/></div>
        <div className="premium-avatar-editor">
          <span className="premium-avatar-editor-preview" data-tone={profile.avatarTone || 'plum'}>
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Approved profile" loading="lazy" decoding="async"/> : initials}
          </span>
          <div>
            <label className="secondary-button upload-label"><ImagePlus size={14}/> {profileImageBusy ? 'Working…' : profile.avatarUrl ? 'Replace portrait' : 'Add portrait'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={profileImageBusy} onChange={(event)=>{const file=event.target.files?.[0]; if(file) void onUploadAvatar(file); event.currentTarget.value='';}}/></label>
            {(profile.avatarUrl || profile.pendingAvatarAssetId) && <button className="ghost-button" disabled={profileImageBusy} onClick={()=>void onRemoveAvatar()}>Remove</button>}
            {profile.pendingAvatarStatus === 'pending' && <small>New portrait awaiting moderation.</small>}
            {profile.pendingAvatarStatus === 'rejected' && <small>The submitted portrait was not approved.</small>}
          </div>
        </div>

        <div className="premium-form-two">
          <label>Chosen name<input maxLength={80} value={profile.displayName ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,displayName:event.target.value}))} placeholder="How Nightjar should call you"/></label>
          <label>@handle<input maxLength={30} value={profile.handle ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,handle:event.target.value}))} placeholder="youruniquehandle"/></label>
          <label>Pronouns <span className="optional-label">optional</span><input maxLength={60} value={profile.pronouns ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,pronouns:event.target.value}))} placeholder="e.g. they/them"/></label>
          <label>Profile tone<select value={profile.avatarTone || 'plum'} onChange={(event)=>setProfile((current:any)=>({...current,avatarTone:event.target.value}))}><option value="plum">Plum</option><option value="wine">Wine</option><option value="mauve">Mauve</option><option value="ivory">Ivory</option></select></label>
        </div>
      </article>

      <article className="panel premium-user-card presence">
        <div className="premium-user-card-head"><div><span className="mini-label">PRESENCE</span><h2>Make the profile memorable.</h2></div><Sparkles size={18}/></div>
        <label>Profile headline<input maxLength={140} value={profile.headline ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,headline:event.target.value}))} placeholder="A short line that feels like you"/><small className="field-counter">{String(profile.headline ?? '').length}/140</small></label>
        <label>About you<textarea maxLength={1200} value={profile.bio ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,bio:event.target.value}))} placeholder="Your story, your way."/><small className="field-counter">{String(profile.bio ?? '').length}/1200</small></label>
        <label>Welcome note <span className="optional-label">optional</span><textarea maxLength={300} value={profile.welcomeMessage ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,welcomeMessage:event.target.value}))} placeholder="A small message for people visiting your profile."/><small className="field-counter">{String(profile.welcomeMessage ?? '').length}/300</small></label>
        <label className="profile-toggle premium-profile-public-toggle"><input type="checkbox" checked={role === 'admin' ? false : profile.publicProfile !== false} disabled={role === 'admin'} onChange={(event)=>setProfile((current:any)=>({...current,publicProfile:event.target.checked}))}/>{role === 'admin' ? 'Administrator profiles stay private' : 'Allow Nightjar members to discover my profile'}</label>
      </article>

      <article className="panel premium-user-card discovery">
        <div className="premium-user-card-head"><div><span className="mini-label">YOUR WORLD</span><h2>What belongs in your Nightjar orbit?</h2></div><Heart size={18}/></div>
        <p className="panel-note">This makes Listener profiles interesting too. These are public-facing interests and discovery signals — never a claim about who you are or what you must like next.</p>
        <SearchableMultiSelect label="Moods & tags" options={combinedTagOptions} values={profile.favouriteTags ?? []} onChange={(values)=>setProfile((current:any)=>({...current,favouriteTags:values}))} allowCreate={role !== 'admin'} createLabel="Add custom tag"/>
        <SearchableMultiSelect label="Tropes & themes" options={PROFILE_TROPE_OPTIONS} values={profile.favouriteTropes ?? []} onChange={(values)=>setProfile((current:any)=>({...current,favouriteTropes:values}))}/>
        <SearchableMultiSelect label="Categories" options={PROFILE_CATEGORY_OPTIONS} values={profile.favouriteCategories ?? []} onChange={(values)=>setProfile((current:any)=>({...current,favouriteCategories:values}))}/>
      </article>

      <article className="panel premium-user-card taste">
        <div className="premium-user-card-head"><div><span className="mini-label">TASTE CONSTELLATION</span><h2>Your evolving discovery fingerprint.</h2></div><Star size={18}/></div>
        <p className="panel-note">Listening can refine recommendations without redefining your identity. Think of this as your private discovery compass, not a personality score.</p>
        <div className="premium-taste-constellation">
          {tasteVector.length ? tasteVector.slice(0,10).map((item:any,index:number)=><div key={item.label} style={{'--weight':Math.max(.2,Math.min(1,Number(item.weight ?? .5))), '--index':index} as CSSProperties}><strong>{item.label}</strong><span>{Math.round(Number(item.weight ?? 0)*100)}%</span></div>) : <div className="people-empty"><Star size={17}/><strong>Your constellation will form naturally.</strong><span>Save, finish, replay and explore. Nightjar keeps this separate from your public identity.</span></div>}
        </div>
      </article>

      <AccessibilityPreferences />
      <LegalAgreementPanel />
      <AccountSecurityActivity />
    </div>

    <div className="premium-profile-savebar">
      <div><Bell size={15}/><span><strong>{profileDirty ? 'You have unsaved profile changes.' : 'Your profile is saved.'}</strong><small>{profileDirty ? 'Keep shaping it, then save when it feels right.' : 'You can change any of this whenever you want.'}</small></span></div>
      <div>{profileDirty && profileBaseline && <button className="ghost-button" onClick={onRevert} disabled={profileLoading}>Revert</button>}<button className="primary-button" onClick={()=>void onSave()} disabled={profileLoading || !profileDirty}><Check size={14}/>{profileLoading?'Saving…':profileDirty?'Save profile':'Saved'}</button></div>
    </div>
  </div>;
}
