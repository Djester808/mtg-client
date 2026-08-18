/**
 * Escapes a string so it can be dropped into a regular expression as a literal.
 *
 * Written twice before it was written once: `card-search-panel` needed it to highlight a
 * search term, and `KeywordLinkService` needed it to build the keyword alternation. The
 * two copies were character-identical, which is the easy case to catch and the easy case
 * to leave lying around.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
