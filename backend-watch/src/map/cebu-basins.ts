import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

export type ReturnPeriodKey = '5yr' | '25yr' | '100yr';
export type HazardSeverity = 'Advisory' | 'Warning' | 'Severe' | 'Extreme';

export interface CebuFloodBasin {
  id: string;
  name: string;
  city: string;
  barangays: string[];
  aliases: string[];
  center: LatLngPoint;
  sourceName: string;
  sourceUrl: string;
  returnPeriods: Record<ReturnPeriodKey, LatLngPoint[][]>;
}

const CORE_METRO_CEBU_IDS = [
  'mananga-river',
  'butuanon-river',
  'guadalupe-river',
  'mahiga-creek',
  'kinalumsan-river',
  'colon-downtown',
];

let cachedBasins: CebuFloodBasin[] | null = null;

export function loadCebuFloodBasins(): CebuFloodBasin[] {
  if (cachedBasins) return cachedBasins;
  const candidates = [
    join(__dirname, 'data', 'cebu-flood-basins.json'),
    join(process.cwd(), 'src', 'map', 'data', 'cebu-flood-basins.json'),
    join(process.cwd(), 'dist', 'map', 'data', 'cebu-flood-basins.json'),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error('Could not locate cebu-flood-basins.json spatial lookup.');
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as CebuFloodBasin[];
  cachedBasins = parsed;
  return parsed;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return false;
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegex(normalized)}(?:$|[^a-z0-9])`,
    'i',
  );
  return pattern.test(haystack);
}

/**
 * Matches an advisory/bulletin text against Cebu river basins and barangays
 * from the UP Project NOAH reference dataset. Falls back to core Metro Cebu
 * watersheds only when a broad Metro Cebu / Province of Cebu warning is issued
 * without naming specific rivers or barangays.
 */
export function matchCebuBasins(text: string): CebuFloodBasin[] {
  const basins = loadCebuFloodBasins();
  const normalized = text.toLowerCase();

  const directMatches = basins.filter((basin) => {
    const terms = [basin.name, ...basin.barangays, ...basin.aliases];
    return terms.some((term) => containsTerm(normalized, term));
  });

  if (directMatches.length > 0) {
    return directMatches;
  }

  if (
    /\b(metro cebu|cebu city|province of cebu|northern cebu|southern cebu|central cebu|cebu)\b/i.test(
      normalized,
    )
  ) {
    return basins.filter((basin) => CORE_METRO_CEBU_IDS.includes(basin.id));
  }

  return [];
}

/**
 * Selects the UP Project NOAH flood return-period polygon set matching severity.
 */
export function selectBasinPolygons(
  basin: CebuFloodBasin,
  severity: HazardSeverity,
): LatLngPoint[][] {
  if (severity === 'Extreme') {
    return basin.returnPeriods['100yr'];
  }
  if (severity === 'Severe') {
    return basin.returnPeriods['25yr'];
  }
  return basin.returnPeriods['5yr'];
}

