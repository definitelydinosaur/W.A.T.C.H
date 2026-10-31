import { describe, expect, it } from '@jest/globals';
import {
  announcementContentHash,
  isDuplicateAnnouncement,
  matchesAnnouncementAudience,
  parseAnnouncementClassification,
  shouldSkipOldAnnouncement,
} from './announcement-classifier';

const valid = JSON.stringify({
  is_relevant: true,
  category: 'class_suspension',
  affects_location: 'Cebu City',
  effective_date: '2026-10-30T00:00:00+08:00',
  scope: 'citywide',
  summary: 'According to the source, classes are suspended tomorrow.',
  confidence: 0.9,
});

describe('announcement processing rules', () => {
  it('parses valid AI JSON and rejects malformed or unsafe shapes', () => {
    expect(parseAnnouncementClassification(valid).category).toBe(
      'class_suspension',
    );
    expect(() => parseAnnouncementClassification('{bad')).toThrow(
      'malformed JSON',
    );
    expect(() =>
      parseAnnouncementClassification(
        JSON.stringify({ ...JSON.parse(valid), confidence: 1.2 }),
      ),
    ).toThrow('does not match');
    expect(() =>
      parseAnnouncementClassification(
        JSON.stringify({ ...JSON.parse(valid), extra: true }),
      ),
    ).toThrow('does not match');
    expect(() =>
      parseAnnouncementClassification(
        JSON.stringify({ ...JSON.parse(valid), summary: 'One. Two. Three.' }),
      ),
    ).toThrow('does not match');
  });

  it('deduplicates source posts by external id or normalized content hash', () => {
    const hash = announcementContentHash(' No classes tomorrow. ');
    expect(announcementContentHash('no   classes tomorrow.')).toBe(hash);
    expect(
      isDuplicateAnnouncement(
        [{ external_post_id: 'p-1', content_hash: 'old' }],
        'p-1',
        hash,
      ),
    ).toBe(true);
    expect(
      isDuplicateAnnouncement(
        [{ external_post_id: 'p-2', content_hash: hash }],
        'p-3',
        hash,
      ),
    ).toBe(true);
    expect(isDuplicateAnnouncement([], 'new', hash)).toBe(false);
  });

  it('skips old posts unless their effective date is still in the future', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(shouldSkipOldAnnouncement('2026-10-27T00:00:00Z', null, now)).toBe(
      true,
    );
    expect(
      shouldSkipOldAnnouncement(
        '2026-10-27T00:00:00Z',
        '2026-10-30T00:00:00Z',
        now,
      ),
    ).toBe(false);
  });

  it('matches institutional alerts only to the same institution and LGU alerts by city', () => {
    const user = {
      id: 'user-1',
      homeCity: 'Cebu City',
      institutionId: 'school-1',
      notificationPrefs: { announcements: true },
    };
    expect(
      matchesAnnouncementAudience(
        { type: 'institution', institutionId: 'school-1' },
        user,
      ),
    ).toBe(true);
    expect(
      matchesAnnouncementAudience(
        { type: 'institution', institutionId: 'school-2' },
        user,
      ),
    ).toBe(false);
    expect(
      matchesAnnouncementAudience(
        { type: 'lgu_mayor', city: 'cebu city' },
        user,
      ),
    ).toBe(true);
    expect(
      matchesAnnouncementAudience({ type: 'lgu', city: 'City of Cebu' }, user),
    ).toBe(true);
    expect(
      matchesAnnouncementAudience(
        { type: 'lgu_mayor', city: 'Lapu-Lapu City' },
        user,
      ),
    ).toBe(false);
    expect(
      matchesAnnouncementAudience(
        { type: 'barangay', city: 'Cebu City', name: 'Lahug' },
        { ...user, homeBarangay: 'Lahug' },
      ),
    ).toBe(true);
    expect(
      matchesAnnouncementAudience(
        { type: 'lgu_mayor', city: 'Cebu City' },
        { ...user, notificationPrefs: { announcements: false } },
      ),
    ).toBe(false);
  });
});
