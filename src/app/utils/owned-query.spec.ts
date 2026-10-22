import { ownedPattern } from './owned-query';
describe('Owned regular expressions', () => {
  it('supports case, whole words and malformed input', () => {
    expect(ownedPattern('sol', false, true).pattern?.test('Sol Ring')).toBeTrue();
    expect(ownedPattern('sol', true, true).pattern?.test('Sol Ring')).toBeFalse();
    expect(ownedPattern('sol', false, true).pattern?.test('Solar Ring')).toBeFalse();
    expect(ownedPattern('[').error).toContain('invalid');
    expect(ownedPattern('').error).toBe('');
    expect(ownedPattern('(a+)+').error).not.toBe('');
    expect(ownedPattern('a'.repeat(201)).error).not.toBe('');
  });
});
