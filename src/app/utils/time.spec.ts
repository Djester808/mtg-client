import { absoluteTime, timeAgo } from './time';

describe('timeAgo', () => {
  const now = new Date('2026-08-15T12:00:00Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('reports anything under a minute as "just now"', () => {
    expect(timeAgo(ago(0), now)).toBe('just now');
    expect(timeAgo(ago(59 * SEC), now)).toBe('just now');
  });

  it('reports minutes, hours and days', () => {
    expect(timeAgo(ago(5 * MIN), now)).toBe('5m ago');
    expect(timeAgo(ago(3 * HOUR), now)).toBe('3h ago');
    expect(timeAgo(ago(10 * DAY), now)).toBe('10d ago');
  });

  it('rolls up to months and years past 30 days', () => {
    expect(timeAgo(ago(60 * DAY), now)).toBe('2mo ago');
    expect(timeAgo(ago(400 * DAY), now)).toBe('1y ago');
  });

  it('treats a future timestamp as "just now" rather than a negative duration', () => {
    // Server clock a few seconds ahead of the browser is normal; "-1m ago" is not.
    expect(timeAgo(new Date(now + 5 * SEC).toISOString(), now)).toBe('just now');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(timeAgo('not-a-date', now)).toBe('');
  });

  // ---- Timezone designator -----------------------------------------------
  // The regression these guard: a timestamp with no trailing Z is read by JS as local
  // time, so west of UTC every event landed in the future and read "just now" for hours.

  it('treats a timestamp with no timezone designator as UTC', () => {
    const withZ = timeAgo('2026-08-15T11:45:00Z', now);
    const bare = timeAgo('2026-08-15T11:45:00', now);
    expect(bare).toBe(withZ);
    expect(bare).toBe('15m ago');
  });

  it('does not shift a timestamp that already carries Z', () => {
    expect(timeAgo('2026-08-15T11:00:00Z', now)).toBe('1h ago');
  });

  it('respects an explicit offset rather than forcing UTC', () => {
    // 07:00 at -05:00 is 12:00Z, which is exactly `now`.
    expect(timeAgo('2026-08-15T07:00:00-05:00', now)).toBe('just now');
  });

  it('reports a 15-minute-old bare timestamp as minutes, not "just now"', () => {
    // The reported bug, stated directly. The API stamps 7 fractional digits, which puts
    // this a hair under 15 minutes — hence 14m, and hence no exact-15 expectation here.
    const reported = timeAgo('2026-08-15T11:45:00.1234567', now);
    expect(reported).not.toBe('just now');
    expect(reported).toBe('14m ago');
  });
});

describe('absoluteTime', () => {
  it('formats a real timestamp', () => {
    expect(absoluteTime('2026-08-15T12:00:00Z')).not.toBe('');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(absoluteTime('nope')).toBe('');
  });
});
