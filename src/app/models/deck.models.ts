export interface DeckMeta {
  coverUri?: string | null;
}

export function parseDeckMeta(description: string | null | undefined): DeckMeta {
  if (!description) return {};
  try { return JSON.parse(description) as DeckMeta; }
  catch { return {}; }
}

export function encodeDeckMeta(meta: DeckMeta): string {
  return JSON.stringify(meta);
}
