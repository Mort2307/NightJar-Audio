/** Convert a comma-separated draft to distinct searchable genres/tropes at save time only. */
export function parseListingTags(draft: string, limit: number): string[] {
  const values = draft
    .split(',')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  return [...new Set(values)].slice(0, limit);
}
