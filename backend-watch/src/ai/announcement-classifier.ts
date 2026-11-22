import { createHash } from 'crypto';

export const ANNOUNCEMENT_CATEGORIES = [
  'class_suspension',
  'holiday_no_class',
  'weather_update',
  'air_quality',
  'emergency',
  'evacuation',
  'other',
] as const;

export const ANNOUNCEMENT_SCOPES = [
  'citywide',
  'institution',
  'specific_levels',
  'unknown',
] as const;

export interface AnnouncementClassification {
  is_relevant: boolean;
  category: (typeof ANNOUNCEMENT_CATEGORIES)[number];
  affects_location: string | null;
  effective_date: string | null;
  scope: (typeof ANNOUNCEMENT_SCOPES)[number];
  summary: string;
  confidence: number;
}

export type AnnouncementAiScope = 'institution' | 'local' | 'weather';
export type SuspensionReason =
  'weather' | 'unhealthy_air' | 'extreme_heat' | 'flood' | 'other';

export interface AnnouncementAiDetails {
  scope: AnnouncementAiScope;
  is_class_suspension: boolean;
  suspension_reason: SuspensionReason | null;
  affected_levels: string | null;
  effective_date: string | null;
  short_summary: string;
  key_points: string[];
}

export interface AnnouncementAudience {
  id: string;
  homeCity?: string | null;
  homeBarangay?: string | null;
  institutionId?: string | null;
  notificationPrefs?: {
    announcements?: boolean;
    safety?: boolean;
    school?: boolean;
  } | null;
}

export interface AnnouncementSourceAudience {
  type: 'lgu' | 'lgu_mayor' | 'institution' | 'barangay';
  city?: string | null;
  institutionId?: string | null;
  name?: string;
}

export function isDuplicateAnnouncement(
  existing: {
    external_post_id?: string | null;
    content_hash?: string | null;
  }[],
  externalPostId: string | null,
  contentHash: string,
) {
  return existing.some(
    (item) =>
      (externalPostId !== null && item.external_post_id === externalPostId) ||
      item.content_hash === contentHash,
  );
}

export function parseAnnouncementClassification(
  output: string,
): AnnouncementClassification {
  const json = output
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('AI returned malformed JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI response must be a JSON object.');
  }
  const result = value as Record<string, unknown>;
  const expectedFields = [
    'is_relevant',
    'category',
    'affects_location',
    'effective_date',
    'scope',
    'summary',
    'confidence',
  ];
  const valid =
    Object.keys(result).length === expectedFields.length &&
    expectedFields.every((field) => Object.hasOwn(result, field)) &&
    typeof result.is_relevant === 'boolean' &&
    typeof result.category === 'string' &&
    ANNOUNCEMENT_CATEGORIES.includes(
      result.category as AnnouncementClassification['category'],
    ) &&
    (result.affects_location === null ||
      typeof result.affects_location === 'string') &&
    (result.effective_date === null ||
      (typeof result.effective_date === 'string' &&
        Number.isFinite(Date.parse(result.effective_date)))) &&
    typeof result.scope === 'string' &&
    ANNOUNCEMENT_SCOPES.includes(
      result.scope as AnnouncementClassification['scope'],
    ) &&
    typeof result.summary === 'string' &&
    result.summary.trim().length > 0 &&
    result.summary.length <= 500 &&
    result.summary
      .trim()
      .split(/[.!?]+/)
      .filter(Boolean).length <= 2 &&
    typeof result.confidence === 'number' &&
    Number.isFinite(result.confidence) &&
    result.confidence >= 0 &&
    result.confidence <= 1;
  if (!valid)
    throw new Error('AI response does not match the announcement schema.');
  return {
    is_relevant: result.is_relevant as boolean,
    category: result.category as AnnouncementClassification['category'],
    affects_location: result.affects_location as string | null,
    effective_date: result.effective_date as string | null,
    scope: result.scope as AnnouncementClassification['scope'],
    summary: (result.summary as string).trim(),
    confidence: result.confidence as number,
  };
}

export function parseAnnouncementAiDetails(
  output: string,
): AnnouncementAiDetails {
  const json = output
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('AI returned malformed announcement detail JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI announcement details must be a JSON object.');
  }
  const result = value as Record<string, unknown>;
  const expectedFields = [
    'scope',
    'is_class_suspension',
    'suspension_reason',
    'affected_levels',
    'effective_date',
    'short_summary',
    'key_points',
  ];
  const valid =
    Object.keys(result).length === expectedFields.length &&
    expectedFields.every((field) => Object.hasOwn(result, field)) &&
    typeof result.scope === 'string' &&
    ['institution', 'local', 'weather'].includes(result.scope) &&
    typeof result.is_class_suspension === 'boolean' &&
    (result.suspension_reason === null ||
      (typeof result.suspension_reason === 'string' &&
        ['weather', 'unhealthy_air', 'extreme_heat', 'flood', 'other'].includes(
          result.suspension_reason,
        ))) &&
    (result.affected_levels === null ||
      typeof result.affected_levels === 'string') &&
    (result.effective_date === null ||
      (typeof result.effective_date === 'string' &&
        Number.isFinite(Date.parse(result.effective_date)))) &&
    typeof result.short_summary === 'string' &&
    result.short_summary.trim().length > 0 &&
    result.short_summary.length <= 500 &&
    Array.isArray(result.key_points) &&
    result.key_points.length <= 8 &&
    result.key_points.every(
      (point) =>
        typeof point === 'string' &&
        point.trim().length > 0 &&
        point.trim().length <= 180,
    );
  if (!valid) {
    throw new Error(
      'AI announcement details do not match the required schema.',
    );
  }
  return {
    scope: result.scope as AnnouncementAiScope,
    is_class_suspension: result.is_class_suspension as boolean,
    suspension_reason: result.suspension_reason as SuspensionReason | null,
    affected_levels: result.affected_levels as string | null,
    effective_date: result.effective_date as string | null,
    short_summary: (result.short_summary as string).trim(),
    key_points: (result.key_points as string[]).map((point) => point.trim()),
  };
}

export function hasUnsupportedAnnouncementClaims(
  sourceText: string,
  classification: AnnouncementClassification,
  details: AnnouncementAiDetails,
) {
  const text = sourceText.toLocaleLowerCase();
  const dates = [classification.effective_date, details.effective_date].filter(
    (date): date is string => Boolean(date),
  );
  if (dates.some((date) => !sourceMentionsDate(text, date))) return true;

  if (
    details.affected_levels &&
    !sourceMentionsLevels(text, details.affected_levels)
  ) {
    return true;
  }
  if (
    details.is_class_suspension &&
    !/\b(no classes|class(?:es)? (?:are )?suspended|suspension of classes|suspend(?:ing)? classes)\b/i.test(
      sourceText,
    )
  ) {
    return true;
  }
  if (
    details.suspension_reason &&
    !sourceMentionsReason(text, details.suspension_reason)
  ) {
    return true;
  }
  return false;
}

function sourceMentionsDate(sourceText: string, value: string) {
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = isoDate
    ? new Date(
        Date.UTC(
          Number(isoDate[1]),
          Number(isoDate[2]) - 1,
          Number(isoDate[3]),
        ),
      )
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const year = String(date.getUTCFullYear());
  const monthNumber = String(date.getUTCMonth() + 1);
  const day = String(date.getUTCDate());
  const paddedMonth = monthNumber.padStart(2, '0');
  const paddedDay = day.padStart(2, '0');
  const monthLong = date
    .toLocaleString('en-US', {
      month: 'long',
      timeZone: 'UTC',
    })
    .toLocaleLowerCase();
  const monthShort = date
    .toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    .toLocaleLowerCase();
  return [
    `${year}-${paddedMonth}-${paddedDay}`,
    `${year}/${paddedMonth}/${paddedDay}`,
    `${paddedMonth}/${paddedDay}/${year}`,
    `${monthLong} ${day}, ${year}`,
    `${monthShort} ${day}, ${year}`,
    `${day} ${monthLong} ${year}`,
    `${day} ${monthShort} ${year}`,
    `${monthLong} ${day}`,
    `${monthShort} ${day}`,
    `${day} ${monthLong}`,
    `${day} ${monthShort}`,
  ].some((candidate) => sourceText.includes(candidate));
}

function sourceMentionsLevels(sourceText: string, levels: string) {
  const normalizedLevels = levels.toLocaleLowerCase().trim();
  if (/^(all|all grade|all year|all class|all levels)/.test(normalizedLevels)) {
    return /\b(all (?:grade |year |class )?levels|all classes)\b/i.test(
      sourceText,
    );
  }
  const claims =
    normalizedLevels.match(
      /\b(?:grade|year|level|kindergarten|kinder)\s*\d*(?:\s*(?:-|to|through)\s*(?:grade|year|level)?\s*\d+)?\b/g,
    ) ?? [];
  return (
    claims.length > 0 &&
    claims.every((claim) => sourceText.includes(claim.replace(/\s+/g, ' ')))
  );
}

function sourceMentionsReason(sourceText: string, reason: SuspensionReason) {
  const patterns: Record<SuspensionReason, RegExp> = {
    weather: /\b(weather|rain|storm|typhoon|wind)\b/i,
    unhealthy_air: /\b(air quality|aqi|smoke|haze|pollution)\b/i,
    extreme_heat: /\b(heat|heat index|high temperature|extreme temperature)\b/i,
    flood: /\b(flood|flooding|floodwater)\b/i,
    other: /\b(reason|due to|because of)\b/i,
  };
  return patterns[reason].test(sourceText);
}

export function announcementContentHash(text: string) {
  return createHash('sha256')
    .update(text.trim().replace(/\s+/g, ' ').toLowerCase())
    .digest('hex');
}

export function shouldSkipOldAnnouncement(
  postedAt: string,
  effectiveDate: string | null,
  now = Date.now(),
) {
  return (
    now - Date.parse(postedAt) > 24 * 60 * 60 * 1000 &&
    (!effectiveDate || Date.parse(effectiveDate) <= now)
  );
}

export function matchesAnnouncementAudience(
  source: AnnouncementSourceAudience,
  audience: AnnouncementAudience,
) {
  const specificPreference =
    source.type === 'institution'
      ? audience.notificationPrefs?.school
      : audience.notificationPrefs?.safety;
  if (
    specificPreference === false ||
    (specificPreference === undefined &&
      audience.notificationPrefs?.announcements === false)
  ) {
    return false;
  }
  if (source.type === 'institution') {
    return Boolean(
      source.institutionId && source.institutionId === audience.institutionId,
    );
  }
  if (source.type === 'barangay') {
    return Boolean(
      source.name &&
      audience.homeBarangay &&
      normalizePlace(source.name) === normalizePlace(audience.homeBarangay),
    );
  }
  return Boolean(
    source.city &&
    audience.homeCity &&
    normalizePlace(source.city) === normalizePlace(audience.homeCity),
  );
}

export function announcementsConflict(firstText: string, secondText: string) {
  const saysCancelled =
    /\b(no classes|classes are suspended|classes suspended|walay klase|suspendido ang klase)\b/i;
  const saysProceed =
    /\b(classes will proceed|classes resume|classes are not suspended|walay suspension|tuloy ang klase)\b/i;
  return (
    (saysCancelled.test(firstText) && saysProceed.test(secondText)) ||
    (saysProceed.test(firstText) && saysCancelled.test(secondText))
  );
}

function normalizePlace(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/^city\s+of\s+/, '')
    .replace(/\s+city$/, '')
    .replace(/\s+municipality$/, '')
    .replace(/^municipality\s+of\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
