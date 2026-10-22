export function ownedPattern(
  query: string,
  matchCase = false,
  wholeWord = false,
): { pattern: RegExp | null; error: string } {
  if (!query.trim()) return { pattern: null, error: '' };
  if (query.length > 200)
    return { pattern: null, error: 'Keep regular expressions to 200 characters.' };
  // Card names are short. Reject constructs that can recursively backtrack in the browser.
  if (/\)[*+{?]|\(\?|\\[1-9]/.test(query) || (query.match(/[*+{]/g)?.length ?? 0) > 2)
    return {
      pattern: null,
      error:
        'Use a simple expression without repeated groups, lookarounds or backreferences (at most two repetitions).',
    };
  try {
    return {
      pattern: new RegExp(wholeWord ? '\\b(?:' + query + ')\\b' : query, matchCase ? '' : 'i'),
      error: '',
    };
  } catch {
    return { pattern: null, error: 'This regular expression is invalid.' };
  }
}
