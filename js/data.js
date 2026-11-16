const PROFILE_FILES = {
  figures: files => files.figures,
  parties: ['parties.json'],
  ideologies: ['ideologies.json'],
  users: ['users.json']
};

const DETAIL_SKIP = new Set(['id', 'key', 'type', 'logo', 'exportCode', 'metadata', 'tags', 'tagGroups']);
const LONG_TEXT_KEYS = new Set(['description', 'intro', 'history', 'views', 'publicActivity', 'readings', 'legacy', 'quotes', 'program', 'elections', 'government', 'opposition', 'politicians', 'values', 'currents', 'impact', 'representatives', 'organizations', 'terms']);
const FILTER_GROUPS = {
  figures: ['Zawód / dziedzina', 'Rola / urząd', 'Narodowość', 'Status', 'Płeć', 'Okres życia', 'Ideologia', 'Kontynent działalności', 'Sposób dojścia do władzy / legitymizacja', 'Religia', 'Pozostałe'],
  parties: ['Status organizacyjny', 'Reprezentacja parlamentarna', 'Sposób uczestnictwa w wyborach', 'Organizacja i zasięg działania', 'Pozycja w systemie partyjnym', 'Ideologia'],
  ideologies: ['Rodzina ideologiczna', 'Sposób koordynacji gospodarki', 'Model gospodarczy i organizacja rynku', 'Organizacja własności i produkcji', 'Rola państwa', 'Podmiotowość społeczna', 'Metoda przemian politycznych', 'Pozostałe'],
  users: ['Pozostałe']
};
const FIGURE_ROLE_TAGS = new Set([
  'Prezydent', 'Premier', 'Monarcha', 'Papież', 'Dyktator', 'Parlamentarzysta', 'Myśliciel społeczny', 'Kanclerz',
  'Reformator', 'Założyciel partii/ruchu', 'Lider partii', 'Wiceprezydent / Zastępca szefa państwa', 'Minister',
  'Dyplomata', 'Arystokrata', 'Dysydent', 'Samorządowiec', 'Głowa państwa'
]);
const FIGURE_PROFESSION_TAGS = new Set([
  'Akademia / Akademik', 'Akademik', 'Artysta', 'Duchowny', 'Działacz związkowy', 'Dziennikarz', 'Ekolog',
  'Ekonomista', 'Farmer', 'Filozof', 'Historyk', 'Lekarz', 'Pisarz', 'Planista', 'Politolog', 'Polityk', 'Prawnik',
  'Przedsiębiorca', 'Publicysta', 'Rewolucjonista', 'Rolnik', 'Socjolog', 'Wojskowy', 'Wolnomularz'
]);
const FIGURE_STATUS_TAGS = new Set(['Martwy', 'Żyje', 'Żywy']);
const FIGURE_GENDER_TAGS = new Set(['Kobieta', 'Mężczyzna']);
const FIGURE_CONTINENT_TAGS = new Set(['Afryka', 'Ameryka Południowa', 'Ameryka Północna', 'Australia', 'Australia i Oceania', 'Azja', 'Europa']);
const FIGURE_LEGITIMACY_TAGS = new Set(['Dziedziczenie', 'Nominacja / Kooptacja', 'Okupacja / Interwencja zewnętrzna', 'Wybory demokratyczne', 'Zamach stanu / Coup', 'Rewolucja']);
const FIGURE_RELIGION_TAGS = new Set([
  'Agnostycyzm', 'Anglikanizm', 'Ateizm', 'Buddyzm', 'Chrześcijaństwo', 'Deizm', 'Hinduizm', 'Islam', 'Judaizm',
  'Judaizm ortodoksyjny', 'Kalwinizm', 'Katolicyzm', 'Muzułmanin', 'Prawosławie', 'Protestantyzm', 'Sunnizm', 'Szyizm', 'Taoizm'
]);
const FIGURE_NATIONALITY_PATTERN = /(?:ska|cka|dzka|zka|lska|wska)$/iu;
const FIGURE_CENTURY_PATTERN = /^[IVXLCDM]+ wiek$/iu;
const figureTagCache = new WeakMap();
const LABELS = {
  tags: 'Tagi', infobox: 'Informacje', country: 'Kraj', nationality: 'Narodowość', continent: 'Kontynent',
  mainActivity: 'Główna działalność', otherActivities: 'Pozostałe role', publicFunctions: 'Funkcje publiczne',
  activePeriod: 'Okres działalności', birthDate: 'Data urodzenia', deathDate: 'Data śmierci', parties: 'Partie',
  ideologies: 'Ideologie', importantValues: 'Wartości', family: 'Rodzina ideologiczna', type: 'Typ',
  founded: 'Rok założenia'
};

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function splitValues(value, splitText = false) {
  const values = [];
  for (const raw of toArray(value)) {
    if (raw === null || raw === undefined || typeof raw === 'object') continue;
    const text = String(raw).trim();
    if (!text) continue;
    const parts = splitText ? text.split(/[,;|\n]+/) : [text];
    for (const part of parts) {
      const clean = part.trim().replace(/^[-•\s]+|\s+$/g, '');
      if (clean && clean.length <= 90) values.push(clean);
    }
  }
  return [...new Set(values)];
}

function polishLabel(key) {
  if (LABELS[key]) return LABELS[key];
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, char => char.toLocaleUpperCase('pl'));
}

function normaliseRecord(record, category) {
  return {
    ...record,
    id: String(record.id),
    name: String(record.name),
    category,
    categoryLabel: ({ figures: 'Figura', parties: 'Partia', ideologies: 'Ideologia', users: 'Użytkownik' })[category],
    logo: typeof record.logo === 'string' ? record.logo.replace(/^\/+/, '') : '',
    tags: splitValues(record.tags)
  };
}

export async function loadCatalog() {
  const manifestResponse = await fetch('political_profiles/manifest.json', { cache: 'no-cache' });
  if (!manifestResponse.ok) throw new Error(`Nie udało się odczytać manifestu (${manifestResponse.status}).`);
  const manifest = await manifestResponse.json();
  const catalog = { figures: [], parties: [], ideologies: [], users: [] };
  for (const category of Object.keys(catalog)) {
    const fileSource = PROFILE_FILES[category];
    const paths = typeof fileSource === 'function' ? fileSource(manifest.files || {}) : fileSource;
    if (!Array.isArray(paths) || paths.length === 0) continue;
    const pieces = await Promise.all(paths.map(async path => {
      const response = await fetch(`political_profiles/${encodeURIComponent(path).replaceAll('%2F', '/')}`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Nie udało się wczytać ${path} (${response.status}).`);
      return response.json();
    }));
    for (const payload of pieces) {
      const rows = Array.isArray(payload) ? payload : (payload && typeof payload === 'object' && payload.id ? [payload] : []);
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || !row.id.trim() || typeof row.name !== 'string' || !row.name.trim()) continue;
        catalog[category].push(normaliseRecord(row, category));
      }
    }
  }
  const all = Object.values(catalog).flat();
  const ids = new Set();
  for (const profile of all) {
    if (ids.has(profile.id)) throw new Error(`Powtórzony identyfikator profilu: ${profile.id}`);
    ids.add(profile.id);
  }
  if (!all.length) throw new Error('Nie znaleziono profili w plikach projektu.');
  return { catalog, all, manifest };
}

function canonicalFigureTag(value) {
  const clean = String(value).trim();
  if (clean === 'Żywy') return 'Żyje';
  if (clean === 'XX1 wiek') return 'XXI wiek';
  return clean;
}

function figureTagGroups(profile) {
  if (figureTagCache.has(profile)) return figureTagCache.get(profile);
  const result = new Map(FILTER_GROUPS.figures.map(group => [group, new Set()]));
  for (const raw of profile.tags || []) {
    const value = canonicalFigureTag(raw);
    if (!value) continue;
    let group = '';
    if (FIGURE_PROFESSION_TAGS.has(value)) group = 'Zawód / dziedzina';
    else if (FIGURE_ROLE_TAGS.has(value)) group = 'Rola / urząd';
    else if (FIGURE_NATIONALITY_PATTERN.test(value)) group = 'Narodowość';
    else if (FIGURE_STATUS_TAGS.has(value)) group = 'Status';
    else if (FIGURE_GENDER_TAGS.has(value)) group = 'Płeć';
    else if (FIGURE_CENTURY_PATTERN.test(value)) group = 'Okres życia';
    else if (FIGURE_CONTINENT_TAGS.has(value)) group = 'Kontynent działalności';
    else if (FIGURE_LEGITIMACY_TAGS.has(value)) group = 'Sposób dojścia do władzy / legitymizacja';
    else if (FIGURE_RELIGION_TAGS.has(value)) group = 'Religia';
    else if (value === 'Inna' || value === 'Inne') group = 'Pozostałe';
    else group = 'Ideologia';
    result.get(group).add(value);
  }
  figureTagCache.set(profile, result);
  return result;
}

function profileGroupValues(profile, group) {
  if (profile.category === 'figures') return [...(figureTagGroups(profile).get(group) || [])];
  if (profile.category === 'parties') return splitValues(profile.tagGroups?.[group]);
  if (profile.category === 'ideologies') {
    if (group !== 'Pozostałe') return splitValues(profile.tagGroups?.[group]);
    const categorized = new Set(Object.values(profile.tagGroups || {}).flatMap(value => splitValues(value)));
    return splitValues(profile.tags).filter(value => !categorized.has(value));
  }
  if (profile.category === 'users' && group === 'Pozostałe') return splitValues(profile.tags);
  return [];
}

export function buildFilterCatalog(profiles, category = null) {
  const categories = category === 'all' ? ['figures', 'parties', 'ideologies', 'users'] : [category || profiles[0]?.category || 'figures'];
  const groups = new Map();
  for (const categoryName of categories) {
    for (const group of FILTER_GROUPS[categoryName] || []) groups.set(group, new Set());
  }
  for (const profile of profiles) {
    for (const group of FILTER_GROUPS[profile.category] || []) {
      const target = groups.get(group);
      if (!target) continue;
      for (const value of profileGroupValues(profile, group)) target.add(value);
    }
  }
  return new Map([...groups.entries()]
    .map(([label, values]) => [label, [...values].sort((a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }))])
    .filter(([, values]) => values.length > 0));
}

function addSearchable(search, key, value) {
  if (LONG_TEXT_KEYS.has(key) || DETAIL_SKIP.has(key) || value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number') search.push(String(value));
  else if (Array.isArray(value)) value.forEach(item => addSearchable(search, key, item));
  else if (typeof value === 'object') Object.entries(value).forEach(([childKey, childValue]) => addSearchable(search, childKey, childValue));
}

export function searchableText(profile) {
  const chunks = [profile.name, profile.description, profile.categoryLabel, ...(profile.tags || [])];
  for (const [key, value] of Object.entries(profile)) addSearchable(chunks, key, value);
  return chunks.join(' ').toLocaleLowerCase('pl');
}

export function profileImageUrl(profile) {
  if (!profile.logo) return '';
  return profile.logo.split('/').map(part => encodeURIComponent(part)).join('/');
}

export function profileDetailFields(profile) {
  const output = [];
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'tagGroups' && value && typeof value === 'object') {
      const groups = Object.entries(value).map(([name, values]) => `${polishLabel(name)}: ${toArray(values).join(' · ')}`).join('\n');
      if (groups) output.push(['Grupy tagów', groups]);
      continue;
    }
    if (DETAIL_SKIP.has(key) || key === 'category' || key === 'categoryLabel' || key === 'logo') continue;
    const clean = Array.isArray(value) ? value.join(' · ') : (typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : value);
    if (clean !== undefined && clean !== null && String(clean).trim()) output.push([polishLabel(key), String(clean)]);
  }
  return output;
}

export function profileMatchesFilters(profile, filters) {
  for (const [group, rule] of Object.entries(filters || {})) {
    const include = rule.include || [];
    const exclude = rule.exclude || [];
    const actual = new Set(profileGroupValues(profile, group));
    if (include.length && !include.some(value => actual.has(value))) return false;
    if (exclude.some(value => actual.has(value))) return false;
  }
  return true;
}

const YEAR_PATTERN = /(?:1[0-9]{3}|20[0-9]{2})/g;

export function parseYearPeriod(value) {
  const input = String(value || '').trim();
  if (!input) return { empty: true, start: null, end: null };
  const match = input.match(/^((?:1[0-9]{3}|20[0-9]{2}))(?:\s*[-–—/]\s*((?:1[0-9]{3}|20[0-9]{2})))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  return start <= end ? { empty: false, start, end } : null;
}

function yearsIn(value) {
  return String(value || '').match(YEAR_PATTERN)?.map(Number) || [];
}

function figureYears(profile) {
  const info = profile.infobox || {};
  let start = yearsIn(info.birthDate)[0];
  let end = yearsIn(info.deathDate)[0];
  if (start === undefined && end === undefined) {
    const periodYears = yearsIn(info.activePeriod);
    start = periodYears[0];
    end = periodYears.length > 1 ? periodYears.at(-1) : (start === undefined ? undefined : 2099);
  }
  return start === undefined && end === undefined ? null : { start: start ?? 1000, end: end ?? 2099 };
}

function partyYears(profile) {
  const info = profile.infobox || {};
  let start = yearsIn(info.dataPowstania || profile.founded)[0];
  let end = yearsIn(info.dataRozwiązania)[0];
  const status = splitValues(profile.tagGroups?.['Status organizacyjny']).join(' ').toLocaleLowerCase('pl');
  const taggedYears = [
    ...Object.values(profile.tagGroups || {}).flatMap(values => splitValues(values).flatMap(yearsIn)),
    ...(profile.tags || []).flatMap(yearsIn)
  ].sort((a, b) => a - b);
  if (start === undefined) start = taggedYears[0];
  if (end === undefined && !/aktywn/.test(status) && taggedYears.length) end = taggedYears.at(-1);
  if (start === undefined && end === undefined) return null;
  return { start: start ?? 1000, end: end ?? 2099 };
}

export function profileExistsDuring(profile, period) {
  if (!period || period.empty || (profile.category !== 'figures' && profile.category !== 'parties')) return true;
  const years = profile.category === 'figures' ? figureYears(profile) : partyYears(profile);
  if (!years) return false;
  return years.start <= period.end && years.end >= period.start;
}
