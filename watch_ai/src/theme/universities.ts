export type University = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  primary: string;
  accent: string;
  aliases: string[];
};

export const UNIVERSITIES: University[] = [
  {
    id: "cit-u",
    name: "Cebu Institute of Technology – University",
    shortName: "CIT-U",
    city: "Cebu City",
    primary: "#0C2340",
    accent: "#C5A35A",
    aliases: ["cit", "cit-u", "cebu institute of technology"],
  },
  {
    id: "usc",
    name: "University of San Carlos",
    shortName: "USC",
    city: "Cebu City",
    primary: "#006747",
    accent: "#C4A35A",
    aliases: ["usc", "san carlos"],
  },
  {
    id: "up-cebu",
    name: "University of the Philippines Cebu",
    shortName: "UP Cebu",
    city: "Cebu City",
    primary: "#7A0019",
    accent: "#0B3D2E",
    aliases: ["up cebu", "upcebu", "university of the philippines"],
  },
  {
    id: "uc",
    name: "University of Cebu",
    shortName: "UC",
    city: "Cebu City",
    primary: "#0047BB",
    accent: "#F0B429",
    aliases: ["uc", "university of cebu"],
  },
  {
    id: "cnu",
    name: "Cebu Normal University",
    shortName: "CNU",
    city: "Cebu City",
    primary: "#1D4E89",
    accent: "#E1B000",
    aliases: ["cnu", "cebu normal"],
  },
  {
    id: "usjr",
    name: "University of San Jose-Recoletos",
    shortName: "USJ-R",
    city: "Cebu City",
    primary: "#0A2F6B",
    accent: "#C6A15B",
    aliases: ["usj-r", "usjr", "san jose-recoletos", "san jose recoletos"],
  },
  {
    id: "ctu",
    name: "Cebu Technological University",
    shortName: "CTU",
    city: "Cebu City",
    primary: "#0057B8",
    accent: "#F5C518",
    aliases: ["ctu", "cebu technological"],
  },
  {
    id: "swu",
    name: "Southwestern University PHINMA",
    shortName: "SWU",
    city: "Cebu City",
    primary: "#0A2540",
    accent: "#B11226",
    aliases: ["swu", "southwestern", "phinma"],
  },
  {
    id: "uv",
    name: "University of the Visayas",
    shortName: "UV",
    city: "Cebu City",
    primary: "#0E7A45",
    accent: "#D4A017",
    aliases: ["uv", "university of the visayas"],
  },
  {
    id: "cdu",
    name: "Cebu Doctors' University",
    shortName: "CDU",
    city: "Mandaue",
    primary: "#0E7490",
    accent: "#D4A24C",
    aliases: ["cdu", "cebu doctors"],
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[–—]/g, "-");
}

export function matchUniversity(query: string) {
  const normalized = normalize(query);
  if (normalized.length < 2) return null;

  let best: { university: University; score: number } | null = null;
  for (const university of UNIVERSITIES) {
    const names = [university.name, university.shortName, ...university.aliases].map(normalize);
    let score = 0;
    if (names.some((name) => name === normalized)) score = 100;
    else if (names.some((name) => name.startsWith(normalized) && normalized.length >= 3)) score = 80;
    else if (names.some((name) => normalized.startsWith(name) && name.length >= 3)) score = 70;
    if (!best || score > best.score) best = { university, score };
  }

  return best && best.score > 0 ? best.university : null;
}

export function filterUniversities(query: string) {
  const normalized = normalize(query);
  if (!normalized) return UNIVERSITIES;
  return UNIVERSITIES.filter((university) => {
    const names = [university.name, university.shortName, university.city, ...university.aliases];
    return names.some((name) => normalize(name).includes(normalized));
  });
}