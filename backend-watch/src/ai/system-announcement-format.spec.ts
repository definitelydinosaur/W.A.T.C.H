import { describe, expect, it } from '@jest/globals';
import { parseSystemAnnouncement } from './system-announcement-format';

describe('parseSystemAnnouncement', () => {
  it('accepts additional fields and supplies safe fallbacks for missing fields', () => {
    const formatted = parseSystemAnnouncement(
      JSON.stringify({
        title: 'No class tomorrow',
        body: 'No class tomorrow.',
        extra: 'ignored',
      }),
      'No class tomorrow',
    );

    expect(formatted.title).toBe('No class tomorrow');
    expect(formatted.body).toBe('No class tomorrow.');
    expect(formatted.summary).toBe('No class tomorrow.');
    expect(formatted.key_points).toEqual(['No class tomorrow.']);
    expect(formatted.missing_info_note).toContain(
      'Confirm the issuing authority',
    );
  });

  it('preserves the original text and flags unusable AI output', () => {
    const formatted = parseSystemAnnouncement(
      'This is not JSON',
      'No class tomorrow',
    );

    expect(formatted.title).toBe('No class tomorrow');
    expect(formatted.body).toBe('No class tomorrow');
    expect(formatted.missing_info_note).toContain(
      'AI formatting was incomplete',
    );
    expect(formatted.missing_info_note).toContain(
      'Confirm the issuing authority',
    );
  });
});
