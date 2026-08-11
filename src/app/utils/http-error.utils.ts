import { HttpErrorResponse } from '@angular/common/http';

/**
 * RFC 7807 problem document. The API returns this for every handled failure.
 */
interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
}

/**
 * Turns an HTTP failure into a message worth showing a user.
 *
 * The API reports failures as ProblemDetails, so prefer `detail` (the human-readable
 * explanation), then `title`. Falls back to a status-specific message, because
 * "502 Bad Gateway" means nothing to someone scanning a card.
 *
 * @param err     The caught value; anything non-HTTP falls through to `fallback`.
 * @param fallback Shown when the error carries no usable information.
 */
export function describeHttpError(err: unknown, fallback = 'Something went wrong'): string {
  if (!(err instanceof HttpErrorResponse)) return fallback;

  const problem = err.error as ProblemDetails | string | null;

  if (problem && typeof problem === 'object') {
    if (problem.detail) return problem.detail;
    if (problem.title) return problem.title;
  } else if (typeof problem === 'string' && problem.trim()) {
    return problem;
  }

  switch (err.status) {
    // 0 = the request never reached the server (offline, CORS, server down).
    case 0:
      return 'Cannot reach the server';
    case 401:
      return 'Please sign in again';
    case 403:
      return 'You do not have access to this';
    case 404:
      return 'Not found';
    case 409:
      return 'That cannot be done right now';
    case 429:
      return 'Too many requests — please wait a moment';
    case 502:
      return 'The AI service is unavailable — please retry';
    case 503:
      return 'Service unavailable — please retry';
    case 504:
      return 'The AI service timed out — please retry';
    default:
      return fallback;
  }
}
