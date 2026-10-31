export interface WeatherSafetyTips {
  summary: string;
  do: string[];
  prepare: string[];
  avoid: string[];
}

export function parseWeatherSafetyTips(output: string): WeatherSafetyTips {
  const json = output
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('AI returned malformed safety tip JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI safety tip response must be an object.');
  }
  const result = value as Record<string, unknown>;
  const validItems = (items: unknown) =>
    Array.isArray(items) &&
    items.length >= 3 &&
    items.length <= 5 &&
    items.every(
      (item) =>
        typeof item === 'string' &&
        item.trim().length >= 5 &&
        item.trim().length <= 180,
    );
  if (
    Object.keys(result).length !== 4 ||
    typeof result.summary !== 'string' ||
    result.summary.trim().length < 8 ||
    result.summary.trim().length > 240 ||
    !validItems(result.do) ||
    !validItems(result.prepare) ||
    !validItems(result.avoid)
  ) {
    throw new Error(
      'AI safety tip response does not match the required schema.',
    );
  }
  return {
    summary: result.summary.trim(),
    do: (result.do as string[]).map((item) => item.trim()),
    prepare: (result.prepare as string[]).map((item) => item.trim()),
    avoid: (result.avoid as string[]).map((item) => item.trim()),
  };
}
