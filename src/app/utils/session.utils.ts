/**
 * The per-game token the lobby stores, if this browser has one for this game.
 *
 * Returns an empty string rather than throwing or redirecting: nothing downstream needs the
 * value — the hub authenticates with the account's own JWT and works out the seat from it — and a
 * missing or malformed one is not a reason to refuse to show a board. Demanding it meant every
 * game started by accepting an invitation, rather than through /lobby, bounced off its own board.
 */
export function readSessionToken(gameId: string): string {
  try {
    const raw = localStorage.getItem('mtg_session');
    if (!raw) {
      return '';
    }

    const session = JSON.parse(raw) as { gameId?: string; playerToken?: string };
    return session.gameId === gameId ? (session.playerToken ?? '') : '';
  } catch {
    return '';
  }
}
