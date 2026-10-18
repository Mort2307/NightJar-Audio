/**
 * Mobile file providers sometimes classify MP3/M4A/WAV as unknown,
 * octet-stream or a vendor-specific MIME. An accept="audio/*" filter greys
 * those files out before Nightjar even receives a selection.
 *
 * Keep the picker unrestricted, then validate the user's selection here.
 * Storage and the server still enforce Nightjar's private audio policy.
 */
const canonicalByExtension: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
};

const canonicalByMime: Record<string, string> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/ogg': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'audio/webm': 'audio/webm',
};

/** Don't accept arbitrary uploads: supported audio types are checked again in Firebase Storage. */
export const nightjarAudioContentType = (file: Pick<File, 'name' | 'type'>): string | null => {
  const extension = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  const expected = canonicalByExtension[extension];
  const declared = String(file.type ?? '').toLowerCase().split(';')[0].trim();

  // Android/browser file providers may supply no MIME or generic binary for
  // known audio extensions. Give Firebase the correct canonical audio MIME.
  if (expected && (!declared || declared === 'application/octet-stream' || declared === 'application/x-octet-stream')) {
    return expected;
  }

  // Some Android providers incorrectly identify .m4a as video/mp4.
  if (extension === 'm4a' && declared === 'video/mp4') return 'audio/mp4';

  const byMime = canonicalByMime[declared];
  if (expected && byMime && expected === byMime) return expected;
  // Recognised audio MIME is sufficient if the file provider omits a suffix.
  if (!extension && byMime) return byMime;
  return null;
};

export const nightjarAudioFileProblem = (file: Pick<File, 'name' | 'type' | 'size'>, maxMiB: number): string | null => {
  if (file.size <= 0) return 'This audio file is empty. Choose a recording with sound.';
  if (file.size > maxMiB * 1024 * 1024) return `Audio must be ${maxMiB} MB or smaller.`;
  if (!nightjarAudioContentType(file)) {
    return 'This audio format is not yet supported. Choose MP3, WAV, M4A, OGG, Opus or WebM. The file picker lets you select other formats, but Nightjar checks the format before uploading.';
  }
  return null;
};

export type NightjarAudioUploadStage = 'STORAGE' | 'FINALIZE';
export class NightjarAudioUploadError extends Error {
  constructor(readonly stage: NightjarAudioUploadStage, readonly code: string, message: string) {
    super(message);
    this.name = 'NightjarAudioUploadError';
  }
}

export const nightjarAudioUploadFailure = (stage: NightjarAudioUploadStage, original: unknown): NightjarAudioUploadError => {
  if (original instanceof NightjarAudioUploadError) return original;
  const input = original as { code?: unknown } | null;
  const code = typeof input?.code === 'string'
    ? input.code.replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 70)
    : 'unknown';
  const messages: Record<string, string> = {
    'storage/unauthorized': 'Nightjar Storage rejected this upload. Check that your VA or Editor role is approved and the release or showcase draft is editable.',
    'storage/unauthenticated': 'Your Nightjar sign-in expired. Sign in again and retry the audio upload.',
    'storage/quota-exceeded': 'Nightjar Storage is temporarily over its allowed capacity. Please tell the Nightjar team.',
    'storage/retry-limit-exceeded': 'The audio transfer timed out. Check your connection and retry.',
    'storage/canceled': 'The audio transfer was cancelled.',
    'functions/permission-denied': 'Nightjar could not finish the upload because this account does not have permission for that draft or role.',
    'functions/unauthenticated': 'Your Nightjar session expired before the audio could be attached.',
    'functions/failed-precondition': 'Nightjar could not attach this recording to the current draft. Check its status and your role approval.',
    'functions/not-found': 'Nightjar could not find the editable draft or uploaded file when finishing the upload.',
    'functions/invalid-argument': 'Nightjar rejected the audio metadata. Confirm you selected a supported format.',
    'functions/unavailable': 'The transfer finished, but Nightjar could not confirm attachment. Your private file was retained. Reopen this draft before uploading another copy.',
    'functions/deadline-exceeded': 'Nightjar timed out while confirming this audio attachment. Your private file was retained. Reopen the draft to check its status.',
    'functions/internal': 'Nightjar could not confirm the audio attachment. The private file was not deleted. Reopen this draft or contact the Nightjar team.'
  };
  const message = messages[code] ?? (
    stage === 'STORAGE'
      ? 'The private file transfer failed. Please send Nightjar the diagnostic shown below.'
      : 'The recording transferred, but Nightjar could not confirm its attachment. The private file was retained; check the draft before attempting another upload.'
  );
  return new NightjarAudioUploadError(stage, code, `${message} (Audio ${stage} / ${code})`);
};
