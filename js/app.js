import { loadCatalog, buildFilterCatalog, searchableText, profileMatchesFilters, parseYearPeriod, profileExistsDuring } from './data.js';
import { DEFAULT_TIERS, calculateDistribution, sigmaForPreset } from './gaussian.js';
import { makeProject, loadProjects, saveProjects, getSavedTheme, saveTheme, cloneProject } from './persistence.js';
import { exportProjectJson, exportText, copyText, exportPng } from './export.js';
import { renderEverything, renderTierEditor, renderProfileDetails } from './view.js';

const $ = selector => document.querySelector(selector);
const VALID_CATEGORIES = new Set(['figures', 'parties', 'ideologies', 'users', 'all']);
const VALID_PRESETS = new Set(['narrow', 'standard', 'wide', 'custom']);
const VALID_THEMES = new Set(['light', 'dark', 'night']);
const HISTORY_LIMIT = 55;

let data = null;
let profileById = new Map();
let searchIndex = new Map();
let catalogCache = new Map();
let store = loadProjects();
store.projects = store.projects.map(normalizeProject);
if (!store.projects.some(project => project.id === store.activeId)) store.activeId = store.projects[0].id;
let theme = getSavedTheme();
let searchDraft = currentProject()?.query || '';
let periodDraft = currentProject()?.periodFilter || '';
let searchTimer = 0;
let periodTimer = 0;
let titleTimer = 0;
let draggedId = '';
let detailProfileId = '';
let lastToastTimer = 0;

function currentProject() { return store.projects.find(project => project.id === store.activeId) || store.projects[0]; }

function normalizeProject(project) {
  const base = makeProject();
  const raw = project && typeof project === 'object' ? project : {};
  const tiers = Array.isArray(raw.tiers) && raw.tiers.length >= 3 && raw.tiers.length <= 13
    ? raw.tiers.map((tier, index) => ({
      id: typeof tier?.id === 'string' && tier.id ? tier.id : `tier-${index}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(tier?.name || `Tier ${index + 1}`).slice(0, 18),
      color: /^#[0-9a-f]{6}$/i.test(tier?.color || '') ? tier.color : DEFAULT_TIERS[index % DEFAULT_TIERS.length].color
    })) : base.tiers;
  const placements = {};
  if (raw.placements && typeof raw.placements === 'object' && !Array.isArray(raw.placements)) {
    for (const [id, tierId] of Object.entries(raw.placements)) placements[id] = typeof tierId === 'string' && tiers.some(tier => tier.id === tierId) ? tierId : null;
  }
  const filters = {};
  if (raw.filters && typeof raw.filters === 'object' && !Array.isArray(raw.filters)) {
    for (const [group, rule] of Object.entries(raw.filters)) {
      if (!rule || typeof rule !== 'object') continue;
      const include = Array.isArray(rule.include) ? [...new Set(rule.include.filter(value => typeof value === 'string').slice(0, 500))] : [];
      const exclude = Array.isArray(rule.exclude) ? [...new Set(rule.exclude.filter(value => typeof value === 'string').slice(0, 500))] : [];
      if (include.length || exclude.length) filters[String(group).slice(0, 80)] = { include, exclude };
    }
  }
  const category = VALID_CATEGORIES.has(raw.category) ? raw.category : 'figures';
  const periodFilter = typeof raw.periodFilter === 'string' && parseYearPeriod(raw.periodFilter) && !parseYearPeriod(raw.periodFilter).empty
    ? raw.periodFilter.trim().slice(0, 11) : '';
  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : base.id,
    name: String(raw.name || 'Moja tier lista').slice(0, 80),
    category,
    query: typeof raw.query === 'string' ? raw.query.slice(0, 140) : '',
    periodFilter,
    filters,
    tiers,
    placements,
    tierOrder: raw.tierOrder && typeof raw.tierOrder === 'object' ? raw.tierOrder : {},
    poolOrder: Array.isArray(raw.poolOrder) ? raw.poolOrder.filter(id => typeof id === 'string') : [],
    selectedIds: Array.isArray(raw.selectedIds) ? [...new Set(raw.selectedIds.filter(id => typeof id === 'string'))] : [],
    sort: ['default', 'name', 'random'].includes(raw.sort) ? raw.sort : 'default',
    sigmaPreset: VALID_PRESETS.has(raw.sigmaPreset) ? raw.sigmaPreset : 'standard',
    sigmaCustom: Number.isFinite(Number(raw.sigmaCustom)) && Number(raw.sigmaCustom) > 0 ? Math.min(20, Math.max(0.2, Number(raw.sigmaCustom))) : null,
    loose: Boolean(raw.loose),
    tileSize: clampNumber(raw.tileSize, 68, 132, 92),
    tileGap: clampNumber(raw.tileGap, 4, 18, 9),
    showNames: Boolean(raw.showNames),
    dashedSlots: raw.dashedSlots !== false
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function activeProfiles(project = currentProject()) {
  if (!data) return [];
  return project.category === 'all' ? data.all : (data.catalog[project.category] || []);
}

function currentSigma(project = currentProject()) {
  return project.sigmaPreset === 'custom' && project.sigmaCustom
    ? project.sigmaCustom
    : sigmaForPreset(project.sigmaPreset, project.tiers.length);
}

function eligibleProfiles(project = currentProject(), query = project.query) {
  const lower = String(query || '').toLocaleLowerCase('pl').trim();
  const period = parseYearPeriod(project.id === store.activeId ? periodDraft : project.periodFilter);
  return activeProfiles(project).filter(profile => {
    if (!profileMatchesFilters(profile, project.filters)) return false;
    if (!profileExistsDuring(profile, period)) return false;
    return !lower || searchIndex.get(profile.id)?.includes(lower);
  });
}

function getFilterCatalog(project = currentProject()) {
  if (!catalogCache.has(project.category)) catalogCache.set(project.category, buildFilterCatalog(activeProfiles(project), project.category));
  return catalogCache.get(project.category);
}

function migrateProjectFilters(project) {
  const catalog = buildFilterCatalog(activeProfiles(project), project.category);
  const available = [...catalog.entries()];
  const migrated = {};
  const addValue = (group, value, kind) => {
    if (!migrated[group]) migrated[group] = { include: [], exclude: [] };
    if (!migrated[group][kind].includes(value)) migrated[group][kind].push(value);
  };
  for (const [oldGroup, rule] of Object.entries(project.filters || {})) {
    for (const kind of ['include', 'exclude']) {
      for (const value of rule[kind] || []) {
        const direct = available.find(([group, values]) => group === oldGroup && values.includes(value));
        const match = direct || available.find(([, values]) => values.includes(value));
        if (match) addValue(match[0], value, kind);
      }
    }
  }
  project.filters = migrated;
}

function showToast(message, kind = 'good', duration = 3000) {
  const region = $('#toast-region');
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), duration);
}

function persist() {
  try {
    saveProjects(store.projects, store.activeId);
    $('#save-status').textContent = 'Zapisano lokalnie';
    $('#save-status').title = `Autosave: ${new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    console.error(error);
    $('#save-status').textContent = 'Błąd lokalnego zapisu';
    $('#save-status').title = 'Pamięć przeglądarki jest niedostępna albo pełna.';
    showToast('Nie udało się zapisać projektu w pamięci przeglądarki.', 'error', 5000);
  }
}

function historyFor(id = store.activeId) {
  if (!historyMap.has(id)) historyMap.set(id, { past: [], future: [] });
  return historyMap.get(id);
}
const historyMap = new Map();

function reconcile(project) {
  if (!data) return 0;
  const profiles = eligibleProfiles(project, project.id === store.activeId ? searchDraft : project.query);
  const eligible = new Set(profiles.map(profile => profile.id));
  const distribution = calculateDistribution(profiles.length, project.tiers, currentSigma(project), project.loose);
  let moved = 0;
  project.tiers.forEach((tier, index) => {
    const ordered = project.tierOrder?.[tier.id] || [];
    const members = ordered.filter(id => eligible.has(id) && project.placements[id] === tier.id);
    const seen = new Set(members);
    for (const profile of profiles) if (project.placements[profile.id] === tier.id && !seen.has(profile.id)) members.push(profile.id);
    const overflow = members.slice(distribution.caps[index]);
    if (!overflow.length) return;
    for (const id of overflow) {
      project.placements[id] = null;
      project.tierOrder[tier.id] = (project.tierOrder[tier.id] || []).filter(item => item !== id);
      if (!project.poolOrder.includes(id)) project.poolOrder.push(id);
      moved += 1;
    }
  });
  return moved;
}

function renderAll() {
  if (!data) return;
  const project = currentProject();
  const eligible = eligibleProfiles(project, searchDraft);
  const categoryCount = activeProfiles(project).length;
  const distribution = calculateDistribution(eligible.length, project.tiers, currentSigma(project), project.loose);
  const picked = new Set(project.selectedIds);
  const handlers = {
    onFilterValue: toggleFilterValue,
    onRemoveFilter: removeFilter,
    onClearFilters: clearFilters,
    onPickAll: togglePickAll,
    onShufflePool: shufflePool,
    onRandomAssign: () => randomAssign(eligible.map(profile => profile.id), true),
    onClearAssignments: clearAssignments,
    onSortChange: setSort
  };
  renderEverything(project, store.projects, store.activeId, theme, eligible, categoryCount, getFilterCatalog(project), distribution, currentSigma(project), picked, handlers);
  const search = $('#profile-search');
  if (search && search.value !== searchDraft) search.value = searchDraft;
  const periodInput = $('#period-filter');
  if (periodInput && periodInput.value !== periodDraft) periodInput.value = periodDraft;
  const parsedPeriod = parseYearPeriod(periodDraft);
  const periodHint = $('#period-filter-hint');
  periodHint.classList.toggle('invalid', Boolean(periodDraft.trim()) && !parsedPeriod);
  if (periodDraft.trim() && !parsedPeriod) {
    periodHint.textContent = 'Wpisz pojedynczy rok albo zakres, np. 1939–1945.';
  } else if (parsedPeriod && !parsedPeriod.empty) {
    const selectedTime = parsedPeriod.start === parsedPeriod.end ? String(parsedPeriod.start) : `${parsedPeriod.start}–${parsedPeriod.end}`;
    if (project.category === 'all') periodHint.textContent = `Figury i partie: ${selectedTime}. Ideologie i użytkownicy pozostają widoczni.`;
    else if (project.category === 'figures') periodHint.textContent = `Figury istniejące w ${selectedTime}. Profile bez dat są pomijane.`;
    else if (project.category === 'parties') periodHint.textContent = `Partie istniejące w ${selectedTime}. Profile bez dat są pomijane.`;
    else periodHint.textContent = 'Filtr roku dotyczy figur i partii; w tej kategorii wyniki pozostają bez zmian.';
  } else {
    periodHint.textContent = 'Wpisz rok albo zakres. Puste pole pokazuje wszystkie profile.';
  }
  $('#clear-period-filter').disabled = !periodDraft;
  const settingsButton = $('#settings-button');
  settingsButton.disabled = false;
  document.body.classList.toggle('show-names', project.showNames);
  document.body.classList.toggle('slot-visualization-hidden', !project.dashedSlots);
  document.documentElement.style.setProperty('--tile-size', `${project.tileSize}px`);
  document.documentElement.style.setProperty('--tile-gap', `${project.tileGap}px`);
  syncHistoryButtons();
  if ($('#settings-dialog').open) renderTierEditor(project);
}

function syncHistoryButtons() {
  const history = historyFor();
  $('#undo-button').disabled = history.past.length === 0;
  $('#redo-button').disabled = history.future.length === 0;
}

function commit(label, mutate, options = {}) {
  const project = currentProject();
  const before = cloneProject(project);
  mutate(project);
  const moved = options.reconcile === false ? 0 : reconcile(project);
  if (JSON.stringify(before) === JSON.stringify(project)) return false;
  const history = historyFor();
  history.past.push(before);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  persist();
  renderAll();
  if (moved) showToast(`${moved} profili po zmianie limitów wróciło do dolnej puli.`, 'good', 4300);
  if (label && !moved) $('#save-status').title = label;
  return true;
}

function applySnapshot(snapshot) {
  const index = store.projects.findIndex(project => project.id === store.activeId);
  if (index < 0) return;
  store.projects[index] = normalizeProject(snapshot);
  searchDraft = store.projects[index].query;
  persist();
  renderAll();
}

function undo() {
  const history = historyFor();
  if (!history.past.length) return;
  history.future.push(cloneProject(currentProject()));
  applySnapshot(history.past.pop());
  showToast('Cofnięto ostatnią zmianę.', 'good', 1600);
}

function redo() {
  const history = historyFor();
  if (!history.future.length) return;
  history.past.push(cloneProject(currentProject()));
  applySnapshot(history.future.pop());
  showToast('Ponowiono zmianę.', 'good', 1600);
}

function toggleFilterValue(group, value, exclude) {
  commit('Zmiana filtra', project => {
    const existing = project.filters[group] || { include: [], exclude: [] };
    const include = new Set(existing.include);
    const excluding = new Set(existing.exclude);
    const target = exclude ? excluding : include;
    const other = exclude ? include : excluding;
    other.delete(value);
    target.has(value) ? target.delete(value) : target.add(value);
    if (!include.size && !excluding.size) delete project.filters[group];
    else project.filters[group] = { include: [...include], exclude: [...excluding] };
  });
}

function removeFilter(group, value, kind) {
  commit('Usunięcie filtra', project => {
    const rule = project.filters[group];
    if (!rule) return;
    rule[kind] = rule[kind].filter(item => item !== value);
    if (!rule.include.length && !rule.exclude.length) delete project.filters[group];
  });
}

function clearFilters() {
  if (!Object.keys(currentProject().filters).length) return;
  commit('Wyczyszczenie filtrów', project => { project.filters = {}; });
}

function togglePickAll() {
  const profiles = eligibleProfiles(currentProject(), searchDraft);
  const allPicked = profiles.length && profiles.every(profile => currentProject().selectedIds.includes(profile.id));
  commit('Zaznaczenie profili', project => {
    const selected = new Set(project.selectedIds);
    profiles.forEach(profile => allPicked ? selected.delete(profile.id) : selected.add(profile.id));
    project.selectedIds = [...selected];
  }, { reconcile: false });
}

function togglePicked(id) {
  commit('Zaznaczenie profilu', project => {
    const selected = new Set(project.selectedIds);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    project.selectedIds = [...selected];
  }, { reconcile: false });
}

function setSort(sort) {
  commit('Sortowanie puli', project => { project.sort = sort; }, { reconcile: false });
}

function shuffleArray(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [array[index], array[other]] = [array[other], array[index]];
  }
  return array;
}

function shufflePool() {
  const project = currentProject();
  const eligible = eligibleProfiles(project, searchDraft);
  const assigned = new Set(Object.entries(project.placements).filter(([, tier]) => Boolean(tier)).map(([id]) => id));
  const pool = shuffleArray(eligible.filter(profile => !assigned.has(profile.id)).map(profile => profile.id));
  commit('Pomieszanie puli', state => {
    const keep = (state.poolOrder || []).filter(id => !eligible.some(profile => profile.id === id));
    state.poolOrder = [...pool, ...keep];
    state.sort = 'random';
  }, { reconcile: false });
  showToast('Pula została pomieszana.');
}

function clearAssignments() {
  const profiles = eligibleProfiles(currentProject(), searchDraft);
  const activeIds = new Set(profiles.map(profile => profile.id));
  const count = profiles.filter(profile => currentProject().placements[profile.id]).length;
  if (!count) { showToast('Nie ma przydziałów do wyczyszczenia.', 'good', 1700); return; }
  commit('Wyczyszczenie tierów', project => {
    for (const id of activeIds) {
      project.placements[id] = null;
      for (const tier of project.tiers) project.tierOrder[tier.id] = (project.tierOrder[tier.id] || []).filter(item => item !== id);
      if (!project.poolOrder.includes(id)) project.poolOrder.push(id);
    }
  }, { reconcile: false });
  showToast(`${count} profili wróciło do dolnej puli.`);
}

function removeFromOrder(project, id) {
  project.poolOrder = project.poolOrder.filter(item => item !== id);
  for (const tier of project.tiers) project.tierOrder[tier.id] = (project.tierOrder[tier.id] || []).filter(item => item !== id);
}

function laneArray(project, targetTier) {
  if (!targetTier) return project.poolOrder;
  project.tierOrder[targetTier] ||= [];
  return project.tierOrder[targetTier];
}

function insertAt(project, targetTier, id, beforeId = '') {
  const lane = laneArray(project, targetTier);
  if (lane.includes(id)) return;
  const position = beforeId && lane.includes(beforeId) ? lane.indexOf(beforeId) : lane.length;
  lane.splice(position, 0, id);
}

function invalidDrop(row, message) {
  row?.classList.add('invalid-drop');
  setTimeout(() => row?.classList.remove('invalid-drop'), 600);
  showToast(message, 'error', 2500);
}

function moveItem(id, targetTier, beforeId = '', allowSwap = false) {
  const project = currentProject();
  const profile = profileById.get(id);
  if (!profile) return false;
  const destination = targetTier === 'pool' ? null : targetTier;
  if (destination && !project.tiers.some(tier => tier.id === destination)) return false;
  const currentTier = project.placements[id] || null;
  if (currentTier === destination && !beforeId) return false;
  if (currentTier === destination && beforeId === id) return false;
  const visibleIds = new Set(eligibleProfiles(project, searchDraft).map(item => item.id));
  const distribution = calculateDistribution(visibleIds.size, project.tiers, currentSigma(project), project.loose);
  const destIndex = destination ? project.tiers.findIndex(tier => tier.id === destination) : -1;
  const destinationCount = destination ? [...visibleIds].filter(profileId => project.placements[profileId] === destination).length : 0;
  const isFull = Boolean(destination && currentTier !== destination && destinationCount >= distribution.caps[destIndex]);
  const targetOccupant = beforeId && project.placements[beforeId] === destination ? beforeId : '';
  const shouldSwap = isFull && allowSwap && targetOccupant && targetOccupant !== id;
  if (isFull && !shouldSwap) {
    invalidDrop(destination ? document.querySelector(`[data-tier-id="${CSS.escape(destination)}"]`) : null, `Tier ${project.tiers[destIndex].name} osiągnął limit ${distribution.caps[destIndex]}.`);
    return false;
  }
  if (shouldSwap) {
    commit('Zamiana profili', state => {
      const firstTier = state.placements[id] || null;
      const secondTier = state.placements[targetOccupant] || null;
      const firstLane = laneArray(state, firstTier);
      const secondLane = laneArray(state, secondTier);
      const firstIndex = firstLane.indexOf(id);
      const secondIndex = secondLane.indexOf(targetOccupant);
      removeFromOrder(state, id);
      removeFromOrder(state, targetOccupant);
      state.placements[id] = destination;
      state.placements[targetOccupant] = firstTier;
      const destLane = laneArray(state, destination);
      const srcLane = laneArray(state, firstTier);
      destLane.splice(Math.max(0, Math.min(secondIndex < 0 ? destLane.length : secondIndex, destLane.length)), 0, id);
      srcLane.splice(Math.max(0, Math.min(firstIndex < 0 ? srcLane.length : firstIndex, srcLane.length)), 0, targetOccupant);
    });
    showToast('Profile zamieniły się miejscami.');
    return true;
  }
  commit(destination === null ? 'Powrót do puli' : currentTier === destination ? 'Zmiana kolejności' : 'Przeniesienie profilu', state => {
    removeFromOrder(state, id);
    state.placements[id] = destination;
    insertAt(state, destination, id, beforeId);
  });
  return true;
}

function randomAssign(ids, useBase) {
  const project = currentProject();
  const unique = [...new Set(ids)].filter(id => profileById.has(id));
  if (!unique.length) { showToast('Nie wybrano profili do losowania.', 'error'); return; }
  let assignedCount = 0;
  commit('Losowe rozmieszczenie', state => {
    for (const id of unique) {
      removeFromOrder(state, id);
      state.placements[id] = null;
      if (!state.poolOrder.includes(id)) state.poolOrder.push(id);
    }
    const eligible = eligibleProfiles(state, searchDraft);
    const eligibleSet = new Set(eligible.map(profile => profile.id));
    const distribution = calculateDistribution(eligible.length, state.tiers, currentSigma(state), state.loose);
    const remaining = state.tiers.map((tier, index) => {
      const current = [...eligibleSet].filter(id => state.placements[id] === tier.id).length;
      return Math.max(0, (useBase ? distribution.base[index] : distribution.caps[index]) - current);
    });
    const slots = [];
    remaining.forEach((amount, index) => { for (let slot = 0; slot < amount; slot += 1) slots.push(state.tiers[index].id); });
    const idsToPlace = shuffleArray([...unique]);
    shuffleArray(slots);
    for (let index = 0; index < Math.min(idsToPlace.length, slots.length); index += 1) {
      const id = idsToPlace[index];
      const tierId = slots[index];
      state.placements[id] = tierId;
      insertAt(state, tierId, id);
      assignedCount += 1;
    }
    state.selectedIds = state.selectedIds.filter(id => !unique.includes(id));
  });
  showToast(`Losowo przydzielono ${assignedCount} profili w ramach limitów.`);
}

function updateFilterSearch(value) {
  searchDraft = value.slice(0, 140);
  renderAll();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const query = searchDraft;
    commit('Wyszukiwanie profili', project => { project.query = query; });
  }, 420);
}

function updatePeriodFilter(value) {
  periodDraft = value.slice(0, 11);
  renderAll();
  clearTimeout(periodTimer);
  if (periodDraft.trim() && !parseYearPeriod(periodDraft)) return;
  const period = periodDraft.trim();
  periodTimer = setTimeout(() => {
    commit('Filtr roku / okresu', project => { project.periodFilter = period; });
  }, 360);
}

function changeCategory(category) {
  if (!VALID_CATEGORIES.has(category) || category === currentProject().category) return;
  commit('Zmiana kategorii', project => { project.category = category; project.filters = {}; });
  showToast(`Załadowano kategorię: ${$('#category-picker [data-category="' + CSS.escape(category) + '"]')?.textContent?.trim() || category}.`);
}

function randomId(prefix = 'item') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

function openProfile(profileId) {
  const profile = profileById.get(profileId);
  if (!profile) return;
  detailProfileId = profileId;
  renderProfileDetails(profile, currentProject().tiers, currentProject());
  $('#profile-dialog').showModal();
}

function handleCardClick(event) {
  const pickButton = event.target.closest('[data-pick-id]');
  if (pickButton) {
    event.stopPropagation();
    togglePicked(pickButton.dataset.pickId);
    return;
  }
  const card = event.target.closest('.profile-card');
  if (card) openProfile(card.dataset.profileId);
}

function handleCardKey(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.profile-card');
  if (!card) return;
  event.preventDefault();
  openProfile(card.dataset.profileId);
}

function handleDragStart(event) {
  const card = event.target.closest('.profile-card');
  if (!card) return;
  draggedId = card.dataset.profileId;
  card.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedId);
}

function handleDragEnd(event) {
  event.target.closest('.profile-card')?.classList.remove('dragging');
  draggedId = '';
  document.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
}

function handleTierDragOver(event) {
  const row = event.target.closest('.tier-row');
  if (!draggedId || !row) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  row.classList.add('drag-over');
}

function handleTierDrop(event) {
  const row = event.target.closest('.tier-row');
  const id = draggedId || event.dataTransfer.getData('text/plain');
  if (!row || !id) return;
  event.preventDefault();
  const targetCard = event.target.closest('.profile-card');
  moveItem(id, row.dataset.tierId, targetCard?.dataset.profileId || '', true);
  row.classList.remove('drag-over');
}

function handlePoolDragOver(event) {
  if (!draggedId || !event.target.closest('#pool-section')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  $('#pool-section').classList.add('drag-over');
}

function handlePoolDrop(event) {
  if (!event.target.closest('#pool-section')) return;
  const id = draggedId || event.dataTransfer.getData('text/plain');
  if (!id) return;
  event.preventDefault();
  const targetCard = event.target.closest('.profile-card');
  moveItem(id, null, targetCard?.dataset.profileId || '');
  $('#pool-section').classList.remove('drag-over');
}

function updateTierEditor(event) {
  const nameInput = event.target.closest('[data-tier-name]');
  const colorInput = event.target.closest('[data-tier-color]');
  if (nameInput) {
    const value = nameInput.value.trim().slice(0, 18);
    if (!value) { nameInput.value = currentProject().tiers.find(tier => tier.id === nameInput.dataset.tierName)?.name || ''; return; }
    commit('Zmiana nazwy poziomu', project => {
      const tier = project.tiers.find(item => item.id === nameInput.dataset.tierName);
      if (tier) tier.name = value;
    });
    return;
  }
  if (colorInput) {
    commit('Zmiana koloru poziomu', project => {
      const tier = project.tiers.find(item => item.id === colorInput.dataset.tierColor);
      if (tier) tier.color = colorInput.value;
    });
    return;
  }
  const actionButton = event.target.closest('[data-tier-action]');
  if (!actionButton) return;
  const row = actionButton.closest('.tier-editor-row');
  const tierId = row?.dataset.tierId;
  if (!tierId) return;
  if (actionButton.dataset.tierAction === 'up' || actionButton.dataset.tierAction === 'down') {
    commit('Zmiana kolejności poziomów', project => {
      const index = project.tiers.findIndex(tier => tier.id === tierId);
      const target = index + (actionButton.dataset.tierAction === 'up' ? -1 : 1);
      if (target < 0 || target >= project.tiers.length) return;
      [project.tiers[index], project.tiers[target]] = [project.tiers[target], project.tiers[index]];
    });
  } else if (actionButton.dataset.tierAction === 'remove' && currentProject().tiers.length > 3) {
    commit('Usunięcie poziomu', project => {
      project.tiers = project.tiers.filter(tier => tier.id !== tierId);
      delete project.tierOrder[tierId];
      for (const [id, assignedTier] of Object.entries(project.placements)) if (assignedTier === tierId) {
        project.placements[id] = null;
        if (!project.poolOrder.includes(id)) project.poolOrder.push(id);
      }
    });
    showToast('Poziom usunięto; jego profile wróciły do dolnej puli.');
  }
}

function addTier() {
  const project = currentProject();
  if (project.tiers.length >= 13) return;
  const palette = ['#0182ba', '#0bb835', '#e6140a', '#f9d909', '#8f55c7', '#f07820'];
  commit('Dodanie poziomu', state => {
    state.tiers.push({ id: randomId('tier'), name: `Poziom ${state.tiers.length + 1}`, color: palette[state.tiers.length % palette.length] });
  });
  renderTierEditor(currentProject());
}

function resetTiers() {
  commit('Przywrócenie domyślnych poziomów', project => {
    const retained = new Set(DEFAULT_TIERS.map(tier => tier.id));
    project.tiers = DEFAULT_TIERS.map(tier => ({ ...tier }));
    for (const [id, tierId] of Object.entries(project.placements)) if (tierId && !retained.has(tierId)) {
      project.placements[id] = null;
      if (!project.poolOrder.includes(id)) project.poolOrder.push(id);
    }
    project.tierOrder = Object.fromEntries(DEFAULT_TIERS.map(tier => [tier.id, (project.tierOrder[tier.id] || []).filter(id => project.placements[id] === tier.id)]));
  });
  showToast('Przywrócono siedem domyślnych poziomów.');
}

function openSettings() {
  renderTierEditor(currentProject());
  const project = currentProject();
  $('#tile-size').value = String(project.tileSize);
  $('#tile-size-value').value = `${project.tileSize}px`;
  $('#tile-gap').value = String(project.tileGap);
  $('#tile-gap-value').value = `${project.tileGap}px`;
  $('#show-names').checked = project.showNames;
  $('#dashed-slots').checked = project.dashedSlots;
  $('#settings-dialog').showModal();
}

function updateTileSetting(key, value) {
  commit(`Ustawienie: ${key}`, project => { project[key] = value; }, { reconcile: false });
}

function createProject() {
  const project = makeProject(`Tier lista ${store.projects.length + 1}`);
  store.projects.push(project);
  store.activeId = project.id;
  historyMap.set(project.id, { past: [], future: [] });
  searchDraft = project.query;
  periodDraft = project.periodFilter;
  persist();
  renderAll();
  showToast('Utworzono nowy projekt.');
}

function switchProject(id) {
  if (!store.projects.some(project => project.id === id) || id === store.activeId) return;
  store.activeId = id;
  searchDraft = currentProject().query;
  clearTimeout(periodTimer);
  periodDraft = currentProject().periodFilter;
  persist();
  renderAll();
}

function deleteProject() {
  const project = currentProject();
  if (!window.confirm(`Usunąć projekt „${project.name}” z tej przeglądarki?`)) return;
  store.projects = store.projects.filter(item => item.id !== project.id);
  if (!store.projects.length) store.projects.push(makeProject());
  store.activeId = store.projects[0].id;
  searchDraft = currentProject().query;
  persist();
  renderAll();
  showToast('Projekt usunięto.');
}

function updateTitleDraft(value) {
  const project = currentProject();
  const clean = value.trim().slice(0, 80);
  $('#board-title').textContent = clean || 'Bez nazwy';
  $('#board-subtitle').textContent = 'Ułóż profile w krzywej Gaussa. Miejsca są precyzyjnie policzone.';
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => {
    const name = clean || 'Moja tier lista';
    commit('Zmiana nazwy projektu', active => { active.name = name; }, { reconcile: false });
  }, 500);
}

function setTheme(value) {
  if (!VALID_THEMES.has(value)) return;
  theme = value;
  saveTheme(theme);
  document.body.dataset.theme = theme;
  renderAll();
}

function validateImport(payload) {
  if (!payload || payload.format !== 'krzywa-tier-list' || payload.version !== 1 || !payload.project || typeof payload.project !== 'object') {
    throw new Error('Plik nie jest projektem Krzywa w obsługiwanym formacie.');
  }
  const raw = payload.project;
  if (!Array.isArray(raw.tiers) || raw.tiers.length < 3 || raw.tiers.length > 13) throw new Error('Projekt musi mieć od 3 do 13 poziomów.');
  const project = normalizeProject({ ...raw, id: randomId('project') });
  const known = new Set(profileById.keys());
  let unknownCount = 0;
  const placements = {};
  for (const [id, tierId] of Object.entries(project.placements)) {
    if (!known.has(id)) { unknownCount += 1; continue; }
    placements[id] = tierId;
  }
  project.placements = placements;
  project.selectedIds = project.selectedIds.filter(id => known.has(id));
  project.poolOrder = project.poolOrder.filter(id => known.has(id));
  project.tierOrder = Object.fromEntries(Object.entries(project.tierOrder).filter(([tierId]) => project.tiers.some(tier => tier.id === tierId)).map(([tierId, ids]) => [tierId, Array.isArray(ids) ? ids.filter(id => known.has(id)) : []]));
  return { project, unknownCount };
}

async function importProject(file) {
  try {
    const payload = JSON.parse(await file.text());
    const { project, unknownCount } = validateImport(payload);
    migrateProjectFilters(project);
    store.projects.push(project);
    store.activeId = project.id;
    historyMap.set(project.id, { past: [], future: [] });
    searchDraft = project.query;
    periodDraft = project.periodFilter;
    const moved = reconcile(project);
    persist();
    renderAll();
    showToast(`Wczytano projekt „${project.name}”.${unknownCount ? ` Pominięto ${unknownCount} profili spoza tej bazy.` : ''}${moved ? ` ${moved} profili zwrócono do puli z powodu nowych limitów.` : ''}`, 'good', 5200);
  } catch (error) {
    showToast(`Nie udało się wczytać projektu: ${error.message}`, 'error', 5000);
  } finally {
    $('#import-file').value = '';
  }
}

async function exportAction(kind) {
  const project = currentProject();
  const visible = eligibleProfiles(project, searchDraft);
  $('#export-menu').hidden = true;
  $('#export-menu-button').setAttribute('aria-expanded', 'false');
  try {
    if (kind === 'import') { $('#import-file').click(); return; }
    if (kind === 'json') exportProjectJson(project);
    else if (kind === 'text') exportText(project, visible);
    else if (kind === 'copy') { await copyText(project, visible); showToast('Zestawienie skopiowano do schowka.'); }
    else if (kind === 'png') { showToast('Przygotowuję obraz tier listy…', 'good', 1800); await exportPng(project, visible); showToast('Gotowy obraz PNG został pobrany.'); }
  } catch (error) {
    console.error(error);
    showToast(`Eksport nie powiódł się: ${error.message}`, 'error', 5000);
  }
}

function bindEvents() {
  $('#category-picker').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (button) changeCategory(button.dataset.category);
  });
  $('#profile-search').addEventListener('input', event => updateFilterSearch(event.target.value));
  $('#profile-search').addEventListener('change', () => {
    clearTimeout(searchTimer);
    const query = searchDraft;
    commit('Wyszukiwanie profili', project => { project.query = query; });
  });
  $('#period-filter').addEventListener('input', event => updatePeriodFilter(event.target.value));
  $('#period-filter').addEventListener('change', event => {
    clearTimeout(periodTimer);
    const value = event.target.value.trim();
    if (value && !parseYearPeriod(value)) { renderAll(); return; }
    commit('Filtr roku / okresu', project => { project.periodFilter = value; });
  });
  $('#clear-period-filter').addEventListener('click', () => updatePeriodFilter(''));
  $('#list-name').addEventListener('input', event => updateTitleDraft(event.target.value));
  $('#list-name').addEventListener('change', event => {
    clearTimeout(titleTimer);
    const name = event.target.value.trim().slice(0, 80) || 'Moja tier lista';
    commit('Zmiana nazwy projektu', project => { project.name = name; }, { reconcile: false });
  });
  $('#project-select').addEventListener('change', event => switchProject(event.target.value));
  $('#new-project').addEventListener('click', createProject);
  $('#delete-project-button').addEventListener('click', deleteProject);
  $('#undo-button').addEventListener('click', undo);
  $('#redo-button').addEventListener('click', redo);
  $('#theme-select').addEventListener('change', event => setTheme(event.target.value));
  $('#settings-button').addEventListener('click', openSettings);
  $('#add-tier-button').addEventListener('click', addTier);
  $('#reset-tiers-button').addEventListener('click', resetTiers);
  $('#tier-editor').addEventListener('change', updateTierEditor);
  $('#tier-editor').addEventListener('click', updateTierEditor);
  $('#tile-size').addEventListener('input', event => {
    const value = Number(event.target.value);
    $('#tile-size-value').value = `${value}px`;
    document.documentElement.style.setProperty('--tile-size', `${value}px`);
  });
  $('#tile-size').addEventListener('change', event => updateTileSetting('tileSize', Number(event.target.value)));
  $('#tile-gap').addEventListener('input', event => {
    const value = Number(event.target.value);
    $('#tile-gap-value').value = `${value}px`;
    document.documentElement.style.setProperty('--tile-gap', `${value}px`);
  });
  $('#tile-gap').addEventListener('change', event => updateTileSetting('tileGap', Number(event.target.value)));
  $('#show-names').addEventListener('change', event => updateTileSetting('showNames', event.target.checked));
  $('#dashed-slots').addEventListener('change', event => updateTileSetting('dashedSlots', event.target.checked));
  $('#sigma-preset').addEventListener('change', event => commit('Zmiana rozkładu', project => { project.sigmaPreset = event.target.value; }));
  $('#sigma-value').addEventListener('change', event => commit('Zmiana parametru sigma', project => {
    project.sigmaPreset = 'custom';
    project.sigmaCustom = clampNumber(event.target.value, 0.2, 20, currentSigma(project));
  }));
  $('#loose-mode').addEventListener('change', event => commit('Zmiana luźnych limitów', project => { project.loose = event.target.checked; }));
  $('#random-selected-button').addEventListener('click', () => {
    const selected = new Set(currentProject().selectedIds);
    const ids = eligibleProfiles(currentProject(), searchDraft).filter(profile => selected.has(profile.id)).map(profile => profile.id);
    if (!ids.length) { showToast('Najpierw zaznacz kafelki przyciskiem +.', 'error'); return; }
    randomAssign(ids, false);
  });
  document.addEventListener('krzywa:random-selected', () => $('#random-selected-button').click());
  $('#tier-list').addEventListener('click', handleCardClick);
  $('#pool-grid').addEventListener('click', handleCardClick);
  $('#tier-list').addEventListener('keydown', handleCardKey);
  $('#pool-grid').addEventListener('keydown', handleCardKey);
  $('.workspace').addEventListener('dragstart', handleDragStart);
  $('.workspace').addEventListener('dragend', handleDragEnd);
  $('#tier-list').addEventListener('dragover', handleTierDragOver);
  $('#tier-list').addEventListener('dragleave', event => event.target.closest('.tier-row')?.classList.remove('drag-over'));
  $('#tier-list').addEventListener('drop', handleTierDrop);
  $('#pool-section').addEventListener('dragover', handlePoolDragOver);
  $('#pool-section').addEventListener('dragleave', event => {
    if (!event.relatedTarget || !$('#pool-section').contains(event.relatedTarget)) $('#pool-section').classList.remove('drag-over');
  });
  $('#pool-section').addEventListener('drop', handlePoolDrop);
  $('#move-profile-button').addEventListener('click', () => {
    if (!detailProfileId) return;
    const result = moveItem(detailProfileId, $('#move-target').value);
    if (result) $('#profile-dialog').close();
  });
  $('#close-profile-dialog').addEventListener('click', () => $('#profile-dialog').close());
  $('#profile-dialog').addEventListener('click', event => {
    if (event.target === $('#profile-dialog')) $('#profile-dialog').close();
  });
  $('#config-collapse').addEventListener('click', event => {
    const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
    event.currentTarget.setAttribute('aria-expanded', String(!expanded));
    $('.workspace').classList.toggle('collapsed-config', expanded);
    $('#config-panel .config-content').classList.toggle('mobile-collapsed', expanded);
  });
  $('#insights-collapse').addEventListener('click', event => {
    const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
    event.currentTarget.setAttribute('aria-expanded', String(!expanded));
    $('.workspace').classList.toggle('collapsed-insights', expanded);
  });
  $('#export-menu-button').addEventListener('click', () => {
    const menu = $('#export-menu');
    menu.hidden = !menu.hidden;
    $('#export-menu-button').setAttribute('aria-expanded', String(!menu.hidden));
  });
  $('#export-menu').addEventListener('click', event => {
    const button = event.target.closest('[data-export]');
    if (button) exportAction(button.dataset.export);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.menu-wrap')) {
      $('#export-menu').hidden = true;
      $('#export-menu-button').setAttribute('aria-expanded', 'false');
    }
  });
  $('#import-file').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importProject(file); });
  document.addEventListener('keydown', event => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('#profile-search').focus();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isTyping) {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !isTyping) {
      event.preventDefault();
      redo();
    } else if (event.key === '/' && !isTyping && !$('#settings-dialog').open && !$('#profile-dialog').open) {
      event.preventDefault();
      $('#profile-search').focus();
    }
  });
}

function showLoadError(error) {
  const box = document.createElement('div');
  box.className = 'loading-screen';
  const title = document.createElement('strong');
  title.textContent = 'Nie udało się wczytać danych profili';
  const text = document.createElement('p');
  text.textContent = `${error.message} Dane JSON muszą być otwarte przez lokalny serwer HTTP — przeglądarka nie udostępnia ich przez file://.`;
  const command = document.createElement('code');
  command.textContent = 'Uruchom run-local.bat albo w tym folderze: py -m http.server 8000';
  const reload = document.createElement('button');
  reload.className = 'button primary';
  reload.type = 'button';
  reload.textContent = 'Spróbuj ponownie';
  reload.addEventListener('click', start);
  box.append(title, text, command, document.createElement('br'), reload);
  $('#tier-list').replaceChildren(box);
  $('#filters-list').replaceChildren();
  $('#filter-hint').textContent = 'Sprawdź sposób uruchomienia';
}

async function start() {
  try {
    data = await loadCatalog();
    profileById = new Map(data.all.map(profile => [profile.id, profile]));
    searchIndex = new Map(data.all.map(profile => [profile.id, searchableText(profile)]));
    catalogCache.clear();
    const total = data.all.length;
    const counts = Object.entries(data.catalog).map(([key, profiles]) => `${key}: ${profiles.length}`).join(' · ');
    $('#board-subtitle').textContent = `${total} profili z oryginalnej bazy · ${counts}`;
    for (const project of store.projects) {
      project.selectedIds = project.selectedIds.filter(id => profileById.has(id));
      project.poolOrder = project.poolOrder.filter(id => profileById.has(id));
      for (const tier of project.tiers) project.tierOrder[tier.id] = (project.tierOrder[tier.id] || []).filter(id => profileById.has(id));
      migrateProjectFilters(project);
    }
    searchDraft = currentProject().query;
    periodDraft = currentProject().periodFilter;
    const overflow = reconcile(currentProject());
    renderAll();
    persist();
    if (overflow) showToast(`${overflow} profili wróciło do puli, aby zachować limity Gaussa.`);
  } catch (error) {
    console.error(error);
    showLoadError(error);
  }
}

bindEvents();
start();
