import { profileImageUrl, profileDetailFields } from './data.js';

const $ = selector => document.querySelector(selector);
const openFilterGroups = new Set();

function putText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = String(value ?? '');
}

function assignedIds(project, tierId, profileIds) {
  const keep = new Set(profileIds);
  const ordered = project.tierOrder?.[tierId] || [];
  const result = ordered.filter(id => keep.has(id) && project.placements[id] === tierId);
  const seen = new Set(result);
  for (const id of profileIds) if (project.placements[id] === tierId && !seen.has(id)) result.push(id);
  return result;
}

export function renderCategory(project) {
  $('#category-picker').querySelectorAll('[data-category]').forEach(button => {
    const active = button.dataset.category === project.category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

export function renderFilterControls(project, filterCatalog, onValueChange) {
  const root = $('#filters-list');
  root.querySelectorAll('details[open]').forEach(details => openFilterGroups.add(details.dataset.group));
  root.replaceChildren();
  if (!filterCatalog.size) {
    const note = document.createElement('div');
    note.className = 'filter-empty';
    note.textContent = 'Ta kategoria nie ma dodatkowych tagów do filtrowania.';
    root.append(note);
    return;
  }
  const selectedGroups = project.filters || {};
  let groupIndex = 0;
  for (const [group, values] of filterCatalog) {
    const details = document.createElement('details');
    details.className = 'filter-group';
    details.dataset.group = group;
    details.open = openFilterGroups.has(group) || (!openFilterGroups.size && groupIndex === 0);
    details.addEventListener('toggle', () => details.open ? openFilterGroups.add(group) : openFilterGroups.delete(group));
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = group;
    const rule = selectedGroups[group];
    const activeCount = (rule?.include?.length || 0) + (rule?.exclude?.length || 0);
    const count = document.createElement('span');
    count.textContent = activeCount ? `${activeCount} · ${values.length}` : String(values.length);
    count.style.color = activeCount ? 'var(--accent)' : 'var(--subtle)';
    summary.append(title, count);
    const choices = document.createElement('div');
    choices.className = 'filter-values';
    for (const value of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      const included = rule?.include?.includes(value);
      const excluded = rule?.exclude?.includes(value);
      if (included) button.classList.add('include');
      if (excluded) button.classList.add('exclude');
      button.setAttribute('aria-pressed', String(Boolean(included || excluded)));
      button.title = 'Klik: uwzględnij. Shift+klik: wyklucz.';
      button.textContent = `${included ? '✓ ' : excluded ? '⊖ ' : ''}${value}`;
      button.addEventListener('click', event => onValueChange(group, value, event.shiftKey));
      choices.append(button);
    }
    details.append(summary, choices);
    root.append(details);
    groupIndex += 1;
  }
  const groupCount = filterCatalog.size;
  $('#filter-hint').textContent = `${groupCount} grup · AND między grupami · OR w grupie`;
}

export function renderActiveFilters(project, onRemove, onClear) {
  const root = $('#active-filters');
  root.replaceChildren();
  for (const [group, rule] of Object.entries(project.filters || {})) {
    for (const [kind, values] of [['include', rule.include || []], ['exclude', rule.exclude || []]]) {
      for (const value of values) {
        const chip = document.createElement('span');
        chip.className = `active-filter${kind === 'exclude' ? ' excluded' : ''}`;
        chip.append(document.createTextNode(`${kind === 'exclude' ? '− ' : ''}${group}: ${value}`));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Usuń filtr ${group}: ${value}`);
        remove.addEventListener('click', () => onRemove(group, value, kind));
        chip.append(remove);
        root.append(chip);
      }
    }
  }
  $('#clear-filters').onclick = onClear;
  $('#clear-filters').disabled = !Object.keys(project.filters || {}).length;
}

function fallbackInitial(name) {
  const words = String(name || '?').trim().split(/\s+/);
  return words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}`.toLocaleUpperCase('pl') : (words[0]?.slice(0, 2) || '?').toLocaleUpperCase('pl');
}

export function makeProfileCard(profile, selected, tierColor = '') {
  const card = document.createElement('div');
  card.className = `profile-card${selected ? ' selected' : ''}`;
  card.dataset.profileId = profile.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${profile.name} — ${profile.categoryLabel}. Enter lub kliknij, aby zobaczyć szczegóły.`);
  card.draggable = true;
  if (profile.description) card.title = profile.description;
  if (tierColor) card.style.setProperty('--tier-card-color', tierColor);
  const imageUrl = profileImageUrl(profile);
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'avatar';
    image.src = imageUrl;
    image.alt = profile.name;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'avatar-fallback';
      fallback.textContent = fallbackInitial(profile.name);
      image.replaceWith(fallback);
    }, { once: true });
    card.append(image);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'avatar-fallback';
    fallback.textContent = fallbackInitial(profile.name);
    card.append(fallback);
  }
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'card-check';
  check.dataset.pickId = profile.id;
  check.setAttribute('aria-pressed', String(selected));
  check.setAttribute('aria-label', `${selected ? 'Odznacz' : 'Zaznacz'} ${profile.name}`);
  check.textContent = selected ? '✓' : '+';
  card.append(check);
  const name = document.createElement('span');
  name.className = 'profile-name';
  name.textContent = profile.name;
  card.append(name);
  return card;
}

export function renderSelection(project, eligible, allInCategory, picked, onPickAll, onShuffle) {
  putText('#eligible-count', eligible.length.toLocaleString('pl-PL'));
  putText('#category-count', allInCategory.toLocaleString('pl-PL'));
  putText('#picked-count', picked.size.toLocaleString('pl-PL'));
  $('#select-all-button').textContent = eligible.length && eligible.every(profile => picked.has(profile.id)) ? 'Odznacz wszystkie pasujące' : 'Zaznacz wszystkie pasujące';
  $('#select-all-button').onclick = onPickAll;
  $('#shuffle-pool-button').onclick = onShuffle;
  const preview = $('#selection-preview');
  preview.replaceChildren();
  const first = eligible.slice(0, 7);
  for (const profile of first) {
    const url = profileImageUrl(profile);
    if (!url) continue;
    const image = document.createElement('img');
    image.className = 'preview-avatar';
    image.src = url;
    image.alt = '';
    image.loading = 'lazy';
    image.title = profile.name;
    image.addEventListener('error', () => image.remove(), { once: true });
    preview.append(image);
  }
  if (eligible.length > 7) {
    const more = document.createElement('span');
    more.className = 'preview-more';
    more.textContent = `+${eligible.length - 7}`;
    preview.append(more);
  }
}

export function renderCurve(project, distribution, sigma, loose) {
  const root = $('#curve-bars');
  root.replaceChildren();
  const max = Math.max(1, ...distribution.caps);
  project.tiers.forEach((tier, index) => {
    const column = document.createElement('div');
    column.className = 'curve-bar';
    const bar = document.createElement('div');
    bar.className = 'curve-bar-fill';
    bar.style.height = `${Math.max(4, (distribution.base[index] / max) * 34)}px`;
    bar.style.background = `linear-gradient(0deg, color-mix(in srgb, ${tier.color} 60%, var(--surface)), ${tier.color})`;
    bar.title = `${tier.name}: ${distribution.base[index]} bazowe${distribution.margin[index] ? ` + ${distribution.margin[index]} marginesu` : ''}`;
    column.append(bar);
    if (loose && distribution.margin[index]) {
      const margin = document.createElement('i');
      margin.className = 'curve-bar-margin';
      margin.style.height = `${Math.max(3, (distribution.margin[index] / max) * 34)}px`;
      margin.style.background = 'var(--yellow)';
      bar.append(margin);
    }
    const label = document.createElement('span');
    label.textContent = tier.name;
    column.append(label);
    root.append(column);
  });
  const actualSigma = Number(sigma).toFixed(2).replace(/\.00$/, '');
  putText('#distribution-caption', `Dyskretna krzywa normalna · σ ${actualSigma}`);
  const sum = distribution.caps.reduce((a, b) => a + b, 0);
  putText('#curve-note', loose
    ? `Limit bazowy: ${distribution.total} · dodatkowy margines: ${distribution.marginTotal} · razem dostępnych miejsc: ${sum}. Żaden profil nie jest usuwany.`
    : `Suma limitów bazowych: ${sum} = ${distribution.total} profili. Zaokrąglenie metodą największych reszt.`);
  root.setAttribute('aria-label', project.tiers.map((tier, index) => `${tier.name}: ${distribution.base[index]}${distribution.margin[index] ? ` plus ${distribution.margin[index]} marginesu` : ''}`).join(', '));
}

export function renderTiers(project, eligible, distribution, sigma, picked, onRandom, onClear) {
  const root = $('#tier-list');
  root.replaceChildren();
  const ids = eligible.map(profile => profile.id);
  const byId = new Map(eligible.map(profile => [profile.id, profile]));
  project.tiers.forEach((tier, index) => {
    const row = document.createElement('section');
    row.className = 'tier-row';
    row.dataset.tierId = tier.id;
    row.style.setProperty('--tier', tier.color);
    row.setAttribute('aria-label', `Tier ${tier.name}`);
    const current = assignedIds(project, tier.id, ids);
    const cap = distribution.caps[index];
    const free = Math.max(0, cap - current.length);
    const label = document.createElement('div');
    label.className = 'tier-label';
    const name = document.createElement('span');
    name.className = 'tier-name';
    name.textContent = tier.name;
    name.title = tier.name;
    const occupancy = document.createElement('span');
    occupancy.className = 'tier-occupancy';
    occupancy.textContent = `${current.length} / ${cap}`;
    occupancy.title = `${current.length} zajętych · ${distribution.base[index]} limit bazowy${distribution.margin[index] ? ` · ${distribution.margin[index]} dodatkowego marginesu` : ''}`;
    const open = document.createElement('span');
    open.className = 'tier-open';
    open.textContent = `${free} wolne`;
    label.append(name, occupancy, open);
    const content = document.createElement('div');
    content.className = 'tier-content';
    content.dataset.tierContent = tier.id;
    for (const id of current) {
      const profile = byId.get(id);
      if (profile) content.append(makeProfileCard(profile, picked.has(id), tier.color));
    }
    if (!current.length && !cap) {
      const none = document.createElement('span');
      none.className = 'tier-empty-note';
      none.textContent = 'Brak miejsc dla tej puli';
      content.append(none);
    } else {
      const placeholders = Math.min(free, 7);
      for (let slot = 0; slot < placeholders; slot += 1) {
        const empty = document.createElement('span');
        empty.className = 'empty-slot';
        empty.setAttribute('aria-hidden', 'true');
        content.append(empty);
      }
      if (free > placeholders) {
        const more = document.createElement('span');
        more.className = 'empty-slot more-slots';
        more.textContent = `+${free - placeholders} wolnych`;
        more.title = `${free - placeholders} dodatkowych wolnych miejsc`;
        content.append(more);
      }
    }
    row.append(label, content);
    root.append(row);
  });
  $('#random-assign-button').onclick = onRandom;
  $('#clear-board-button').onclick = onClear;
  $('#sigma-custom-wrap').hidden = project.sigmaPreset !== 'custom';
  $('#sigma-preset').value = project.sigmaPreset;
  $('#sigma-value').value = project.sigmaCustom || sigma;
  $('#loose-mode').checked = Boolean(project.loose);
}

export function renderPool(project, eligible, picked, onSortChange) {
  const root = $('#pool-grid');
  root.replaceChildren();
  const assigned = new Set(Object.entries(project.placements || {}).filter(([, tier]) => Boolean(tier)).map(([id]) => id));
  let profiles = eligible.filter(profile => !assigned.has(profile.id));
  if (project.sort === 'name') profiles.sort((a, b) => a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }));
  else if (project.sort === 'random') {
    const saved = project.poolOrder || [];
    const position = new Map(saved.map((id, index) => [id, index]));
    profiles.sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  } else {
    const saved = project.poolOrder || [];
    const position = new Map(saved.map((id, index) => [id, index]));
    profiles.sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  for (const profile of profiles) root.append(makeProfileCard(profile, picked.has(profile.id)));
  putText('#pool-count-pill', profiles.length.toLocaleString('pl-PL'));
  putText('#board-pool-count', profiles.length.toLocaleString('pl-PL'));
  $('#pool-empty').hidden = profiles.length > 0;
  $('#sort-select').value = project.sort || 'default';
  $('#sort-select').onchange = () => onSortChange($('#sort-select').value);
}

export function renderStats(project, eligible, distribution) {
  const ids = eligible.map(profile => profile.id);
  const idSet = new Set(ids);
  const placed = eligible.filter(profile => project.placements[profile.id]).length;
  const pool = eligible.length - placed;
  const percent = eligible.length ? Math.round(placed * 100 / eligible.length) : 0;
  putText('#board-assigned', placed.toLocaleString('pl-PL'));
  putText('#stat-assigned', `${placed.toLocaleString('pl-PL')} / ${eligible.length.toLocaleString('pl-PL')}`);
  putText('#stat-placed', placed.toLocaleString('pl-PL'));
  putText('#stat-unassigned', pool.toLocaleString('pl-PL'));
  putText('#progress-percent', `${percent}%`);
  $('#progress-ring').style.setProperty('--progress', `${percent}%`);
  const stats = $('#tier-stats');
  stats.replaceChildren();
  let freeTotal = 0;
  project.tiers.forEach((tier, index) => {
    const count = ids.filter(id => project.placements[id] === tier.id).length;
    const cap = distribution.caps[index];
    const free = Math.max(0, cap - count);
    freeTotal += free;
    const row = document.createElement('div');
    row.className = 'tier-stat';
    row.style.setProperty('--tier', tier.color);
    const label = document.createElement('span');
    label.className = 'tier-stat-label';
    label.textContent = tier.name;
    label.title = tier.name;
    const bar = document.createElement('span');
    bar.className = 'tier-stat-bar';
    const fill = document.createElement('i');
    fill.style.setProperty('--fill', `${cap ? Math.min(100, count * 100 / cap) : 0}%`);
    bar.append(fill);
    const amount = document.createElement('span');
    amount.className = 'tier-stat-count';
    amount.textContent = `${count}/${cap} · ${cap ? Math.round(count * 100 / cap) : 0}%`;
    amount.title = `${free} wolnych miejsc`;
    row.append(label, bar, amount);
    stats.append(row);
  });
  putText('#free-slots-total', `${freeTotal.toLocaleString('pl-PL')} wolnych`);
  const tagCounts = new Map();
  for (const profile of eligible) for (const tag of profile.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  const top = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pl')).slice(0, 6);
  const tagRoot = $('#top-tags');
  tagRoot.replaceChildren();
  if (!top.length) {
    const empty = document.createElement('span');
    empty.className = 'top-tag';
    empty.textContent = 'Brak tagów';
    tagRoot.append(empty);
  } else for (const [tag, count] of top) {
    const item = document.createElement('span');
    item.className = 'top-tag';
    item.append(document.createTextNode(tag));
    const amount = document.createElement('b');
    amount.textContent = count.toLocaleString('pl-PL');
    item.append(amount);
    tagRoot.append(item);
  }
  putText('#save-status', 'Zapisano lokalnie');
}

export function renderBoardTitle(project) {
  putText('#board-title', project.name);
  putText('#list-name', project.name);
  document.title = `${project.name || 'Tier lista'} — Krzywa`;
}

export function renderProjects(projects, activeId) {
  const select = $('#project-select');
  const previous = select.value;
  select.replaceChildren();
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    select.append(option);
  });
  select.value = projects.some(project => project.id === activeId) ? activeId : (projects.some(project => project.id === previous) ? previous : projects[0]?.id || '');
}

export function renderTheme(theme) {
  document.body.dataset.theme = theme;
  $('#theme-select').value = theme;
}

export function renderTierEditor(project) {
  const root = $('#tier-editor');
  root.replaceChildren();
  project.tiers.forEach((tier, index) => {
    const row = document.createElement('div');
    row.className = 'tier-editor-row';
    row.dataset.tierId = tier.id;
    const number = document.createElement('span');
    number.className = 'tier-editor-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 18;
    name.value = tier.name;
    name.setAttribute('aria-label', `Nazwa poziomu ${index + 1}`);
    name.dataset.tierName = tier.id;
    const color = document.createElement('input');
    color.type = 'color';
    color.value = tier.color;
    color.setAttribute('aria-label', `Kolor poziomu ${tier.name}`);
    color.dataset.tierColor = tier.id;
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.title = 'Przesuń w górę';
    up.dataset.tierAction = 'up';
    up.disabled = index === 0;
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.title = 'Przesuń w dół';
    down.dataset.tierAction = 'down';
    down.disabled = index === project.tiers.length - 1;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-tier';
    remove.textContent = '×';
    remove.title = 'Usuń poziom';
    remove.dataset.tierAction = 'remove';
    remove.disabled = project.tiers.length <= 3;
    row.append(number, name, color, up, down, remove);
    root.append(row);
  });
  putText('#tier-count-label', `${project.tiers.length} / 13 poziomów`);
  $('#add-tier-button').disabled = project.tiers.length >= 13;
}

function setImageOrFallback(container, profile, className) {
  const url = profileImageUrl(profile);
  if (!url) {
    const fallback = document.createElement('div');
    fallback.className = 'avatar-fallback';
    fallback.textContent = fallbackInitial(profile.name);
    container.append(fallback);
    return;
  }
  const image = document.createElement('img');
  image.className = className;
  image.src = url;
  image.alt = profile.name;
  image.addEventListener('error', () => {
    const fallback = document.createElement('div');
    fallback.className = 'avatar-fallback';
    fallback.textContent = fallbackInitial(profile.name);
    image.replaceWith(fallback);
  }, { once: true });
  container.append(image);
}

export function renderProfileDetails(profile, tiers, project) {
  $('#profile-dialog-title').textContent = profile.name;
  const root = $('#profile-details');
  root.replaceChildren();
  const hero = document.createElement('div');
  hero.className = 'profile-hero';
  setImageOrFallback(hero, profile, 'profile-hero-image');
  const summary = document.createElement('div');
  const badge = document.createElement('span');
  badge.className = 'eyebrow';
  badge.textContent = profile.categoryLabel.toLocaleUpperCase('pl');
  const description = document.createElement('p');
  description.textContent = profile.description || profile.intro || 'Ten profil nie ma krótkiego opisu.';
  const tags = document.createElement('div');
  tags.className = 'profile-tags';
  for (const tag of profile.tags || []) {
    const item = document.createElement('span');
    item.textContent = tag;
    tags.append(item);
  }
  summary.append(badge, description, tags);
  hero.append(summary);
  root.append(hero);
  const fields = profileDetailFields(profile).filter(([label, value]) => value.length < 5000);
  const box = profile.infobox && typeof profile.infobox === 'object' ? Object.entries(profile.infobox).map(([key, value]) => [key, Array.isArray(value) ? value.join(' · ') : String(value)]) : [];
  const shown = new Set();
  const attributes = document.createElement('div');
  attributes.className = 'profile-attributes';
  for (const [label, value] of [...box, ...fields]) {
    if (!value || shown.has(label)) continue;
    shown.add(label);
    const item = document.createElement('div');
    item.className = 'profile-attribute';
    const key = document.createElement('b');
    key.textContent = label;
    const content = document.createElement('span');
    content.textContent = value;
    item.append(key, content);
    attributes.append(item);
  }
  root.append(attributes);
  const target = $('#move-target');
  target.replaceChildren();
  const pool = document.createElement('option');
  pool.value = 'pool';
  pool.textContent = 'Dolna pula';
  target.append(pool);
  for (const tier of tiers) {
    const option = document.createElement('option');
    option.value = tier.id;
    option.textContent = `Tier ${tier.name}`;
    target.append(option);
  }
  target.value = project.placements[profile.id] || 'pool';
}

export function renderEverything(project, projects, activeId, theme, eligible, categoryCount, filterCatalog, distribution, sigma, picked, handlers) {
  renderProjects(projects, activeId);
  renderTheme(theme);
  renderBoardTitle(project);
  renderCategory(project);
  renderFilterControls(project, filterCatalog, handlers.onFilterValue);
  renderActiveFilters(project, handlers.onRemoveFilter, handlers.onClearFilters);
  renderSelection(project, eligible, categoryCount, picked, handlers.onPickAll, handlers.onShufflePool);
  renderCurve(project, distribution, sigma, project.loose);
  renderTiers(project, eligible, distribution, sigma, picked, handlers.onRandomAssign, handlers.onClearAssignments);
  renderPool(project, eligible, picked, handlers.onSortChange);
  renderStats(project, eligible, distribution);
}
