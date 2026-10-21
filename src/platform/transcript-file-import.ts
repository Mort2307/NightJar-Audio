/** Strictly non-AI, on-device import of creator-authorised transcript files.
 * No media upload, remote recogniser or model usage is performed here.
 * This function returns draft text only; release editing requires human review.
 */
const TRANSCRIPT_LIMIT = 120000;
const MAX_FILE_BYTES = 250000;

const timestamp = (value: string): string | null => {
  const match = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})(?:[,.]\d{1,3})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return null;
  return match[1]
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export function prepareCreatorTranscriptImport(filename: string, input: string): string {
  const extension = filename.toLowerCase().match(/\.(txt|md|srt|vtt)$/)?.[1];
  if (!extension) throw new Error('Choose a .txt, .md, .srt or .vtt transcript file.');
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!source.trim()) throw new Error('The selected transcript file is empty.');
  let result = source.trim();
  if (extension === 'srt' || extension === 'vtt') {
    const cues: string[] = [];
    const blocks = source.split(/\n\s*\n/);
    for (const block of blocks) {
      const rows = block.split('\n').map(line => line.trim()).filter(Boolean);
      const index = rows.findIndex(row => row.includes('-->'));
      if (index === -1) continue;
      const at = timestamp(rows[index].split(/\s*-->\s*/)[0]);
      if (!at) continue;
      const words = rows.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim();
      if (words) cues.push(`[${at}] ${words}`);
    }
    if (!cues.length) throw new Error('No readable caption cues found. Export a valid SRT/VTT file or use plain text.');
    result = cues.join('\n');
  }
  if (result.length > TRANSCRIPT_LIMIT) throw new Error('The imported transcript exceeds the 120,000-character limit.');
  return result;
}

export async function readCreatorTranscriptFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose a transcript file smaller than 250 KB.');
  return prepareCreatorTranscriptImport(file.name, await file.text());
}
