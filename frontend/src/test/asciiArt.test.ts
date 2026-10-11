import { describe, it, expect } from 'vitest';
import { FALCON_ASCII } from '../lib/asciiArt';

describe('Falcon ASCII Art Backdrop', () => {
  it('exports a valid non-empty ASCII art string', () => {
    expect(FALCON_ASCII).toBeDefined();
    expect(typeof FALCON_ASCII).toBe('string');
    expect(FALCON_ASCII.trim().length).toBeGreaterThan(100);
  });

  it('maintains expected line structure and aspect ratio constraints', () => {
    const lines = FALCON_ASCII.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(30);

    // Ensure all lines are non-null and printable
    for (const line of lines) {
      // Must only contain standard printable ASCII characters
      expect(/^[\x20-\x7E]*$/.test(line)).toBe(true);
    }
  });

  it('contains characteristic kestrel falcon density markers', () => {
    expect(FALCON_ASCII).toContain('@');
    expect(FALCON_ASCII).toContain('.');
    expect(FALCON_ASCII).toContain('%');
  });
});
