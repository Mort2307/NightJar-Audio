/**
 * Nightjar presentation boundary for recoverable UTF-8/Windows-1252 mojibake.
 * This never edits existing records in Firebase or intercepts text entry.
 */
const readableFields = new Set([
  'name', 'displayName', 'firstName', 'lastName', 'title', 'subtitle',
  'headline', 'bio', 'roleHeadline', 'roleBio', 'roleDetailOne', 'roleDetailTwo',
  'description', 'synopsis', 'welcomeMessage', 'statement', 'experience',
  'note', 'reviewNote', 'decisionNote', 'moderationNote', 'approvalEmailError',
  'message', 'creatorName', 'writerName', 'editorName', 'artistName',
  'featuredNote', 'portfolioNote', 'productionNote', 'roleSpecialties',
  'roleSecondary', 'roleFocus', 'favouriteTags', 'favouriteTropes',
  'favouriteCategories', 'genres', 'tropes', 'tags', 'category', 'genre',
  'specialties', 'languages', 'credits', 'commissionType', 'wave',
  'avatarInitials', 'roleAvailability', 'roleDetail', 'scriptTitle',
]);

const utf8 = new TextEncoder();
const windows1252 = new TextDecoder('windows-1252');
const recovered = new Map<string, string>();

// Construct the verified mojibake sequences from UTF-8 bytes interpreted as
// Windows-1252. Covers common accents and typographic characters.
const add = (codepoint: number) => {
  const character = String.fromCodePoint(codepoint);
  const mangled = windows1252.decode(utf8.encode(character));
  if (/^[ÂÃâï]/.test(mangled) && !mangled.includes('\uFFFD') && mangled !== character) {
    recovered.set(mangled, character);
  }
};
for (let cp = 0xA0; cp <= 0x024F; cp++) add(cp);
for (let cp = 0x2000; cp <= 0x206F; cp++) add(cp);
for (let cp = 0x20A0; cp <= 0x20CF; cp++) add(cp);
for (let cp = 0x2100; cp <= 0x219F; cp++) add(cp);
for (let cp = 0x25A0; cp <= 0x27BF; cp++) add(cp);
// Older records sometimes contain a truncated/incorrect euro encoding.
recovered.set('Â€', '€');

const escapeRegex = (value: string) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
const mojibakePattern = new RegExp(
  [...recovered.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|'),
  'g',
);

export function repairMojibakeText(value: string): string {
  if (!/[ÂÃâï]/.test(value)) return value;
  let result = value;
  for (let pass = 0; pass < 2; pass++) {
    const next = result.replace(mojibakePattern, (match) => recovered.get(match) ?? match);
    if (next === result) break;
    result = next;
  }
  return result;
}

/**
 * Normalise only human-readable fields of a JSON-like callable response.
 * IDs, email addresses, URLs, message bodies, script text, legal terms and
 * financial metadata remain unchanged. Never mutates the original response.
 */
export function repairMojibakeDisplayData<T>(data: T): T {
  const visit = (value: unknown, field: string, depth: number): unknown => {
    if (depth > 12 || value == null) return value;
    if (typeof value === 'string') return readableFields.has(field) ? repairMojibakeText(value) : value;
    if (Array.isArray(value)) return value.map((item) => visit(item, field, depth + 1));
    if (typeof value !== 'object') return value;
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, key, depth + 1)]));
  };
  return visit(data, '', 0) as T;
}
