export type SystemAnnouncementFormat = {
  title: string;
  summary: string;
  body: string;
  key_points: string[];
  schedule_or_date: string | null;
  impact: string | null;
  action_needed: string | null;
  missing_info_note: string | null;
};

function textValue(value: unknown, fallback: string, maximum: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximum)
    : fallback.slice(0, maximum);
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 1000)
    : null;
}

export function parseSystemAnnouncement(
  output: string,
  rawText: string,
): SystemAnnouncementFormat {
  let value: unknown;
  let parseFailed = false;
  const trimmed = output.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  const candidate =
    jsonStart >= 0 && jsonEnd >= jsonStart
      ? trimmed.slice(jsonStart, jsonEnd + 1)
      : trimmed;

  try {
    value = JSON.parse(
      candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
    );
  } catch {
    parseFailed = true;
    value = {};
  }

  const result =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (!Object.keys(result).length) parseFailed = true;
  const body = textValue(result.body, rawText, 8000);
  const summary = textValue(result.summary, body, 500);
  const keyPoints = Array.isArray(result.key_points)
    ? result.key_points
        .filter((point): point is string => typeof point === 'string')
        .map((point) => point.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  if (!keyPoints.length) keyPoints.push(summary.slice(0, 300));

  const notes: string[] = [];
  const existingNote = optionalText(result.missing_info_note);
  if (existingNote) notes.push(existingNote);
  if (parseFailed) {
    notes.push(
      'AI formatting was incomplete; the original text has been preserved. Review this draft before publishing.',
    );
  }
  if (
    /\bno class(?:es)?\b|\bclass(?:es)? suspended\b|\bwalay klase\b/i.test(
      rawText,
    )
  ) {
    notes.push(
      'Confirm the issuing authority, affected school or area, and exact date before publishing.',
    );
  }

  return {
    title: textValue(result.title, rawText, 120),
    summary,
    body,
    key_points: keyPoints,
    schedule_or_date: optionalText(result.schedule_or_date),
    impact: optionalText(result.impact),
    action_needed: optionalText(result.action_needed),
    missing_info_note: notes.length ? [...new Set(notes)].join(' ') : null,
  };
}
