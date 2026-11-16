import { DEFAULT_TIERS } from './gaussian.js';

const STORAGE_KEY = 'krzywa-tier-list-projects-v1';
const THEME_KEY = 'krzywa-theme-v1';

export function makeProject(name = 'Moja tier lista') {
  return {
    id: `project-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`,
    name,
    category: 'figures',
    query: '',
    filters: {},
    tiers: DEFAULT_TIERS.map(tier => ({ ...tier })),
    placements: {},
    tierOrder: {},
    poolOrder: [],
    selectedIds: [],
    sort: 'default',
    onlyUnassigned: false,
    sigmaPreset: 'standard',
    sigmaCustom: null,
    loose: false,
    tileSize: 92,
    tileGap: 9,
    showNames: false,
    dashedSlots: true
  };
}

export function loadProjects() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const projects = Array.isArray(data?.projects) ? data.projects.filter(isProject) : [];
    if (projects.length) return { projects, activeId: projects.some(project => project.id === data.activeId) ? data.activeId : projects[0].id };
  } catch (error) {
    console.warn('Localny zapis projektów jest uszkodzony; tworzę nowy projekt.', error);
  }
  const initial = makeProject();
  return { projects: [initial], activeId: initial.id };
}

function isProject(value) {
  return value && typeof value === 'object' && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.tiers) && value.tiers.length >= 3 && value.tiers.length <= 13;
}

export function saveProjects(projects, activeId) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, activeId, projects }));
}

export function getSavedTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return ['light', 'dark', 'night'].includes(theme) ? theme : 'dark';
  } catch { return 'dark'; }
}

export function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* preference is optional */ }
}

export function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}
