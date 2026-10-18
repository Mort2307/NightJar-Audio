// Only creator-editable release metadata is automatically persisted.
// Auth tokens, uploaded bytes, media references, ownership, visibility and
// legal/right/accuracy attestations are intentionally excluded.
export type CreatorMetadataFields = {
  title?: string; description?: string; category?: string; genre?: string; mood?: string;
  tags?: string[]; tropes?: string[];
  contributors?: {userId?: string | null; name:string; role:string}[];
  contentRating?: string; seriesTitle?: string | null; episodeNumber?: number | null;
  productionNote?: string | null;
  releaseDistribution?: string;
  scheduledAt?: string | null; scheduledLocal?: string | null; scheduledTimeZone?: string | null;
  transcriptText?: string; transcriptLanguage?: string;
};
export function creatorEditableMetadata(source: CreatorMetadataFields) {
  return {
    title: source.title ?? '',
    description: source.description ?? '',
    category: source.category ?? '',
    genre: source.genre ?? '',
    mood: source.mood ?? '',
    tags: source.tags ?? [],
    tropes: source.tropes ?? [],
    contributors: source.contributors ?? [],
    contentRating: source.contentRating ?? 'adult',
    seriesTitle: source.seriesTitle ?? null,
    episodeNumber: source.episodeNumber ?? null,
    productionNote: source.productionNote ?? null,
    releaseDistribution: source.releaseDistribution ?? 'standard',
    scheduledAt: source.scheduledAt ?? null,
    scheduledLocal: source.scheduledLocal ?? null,
    scheduledTimeZone: source.scheduledTimeZone ?? null,
    transcriptText: source.transcriptText ?? '',
    transcriptLanguage: source.transcriptLanguage ?? 'en',
  };
}
export const creatorMetadataSignature = (source: CreatorMetadataFields) =>
  JSON.stringify(creatorEditableMetadata(source));
