import { profileImageUrl } from './data.js';

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(value) {
  return String(value || 'tier-lista').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 55) || 'tier-lista';
}

export function exportProjectJson(project) {
  const payload = { format: 'krzywa-tier-list', version: 1, exportedAt: new Date().toISOString(), project };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), `${safeName(project.name)}.json`);
}

export function buildTextSummary(project, visibleProfiles) {
  const byId = new Map(visibleProfiles.map(profile => [profile.id, profile]));
  const lines = [project.name, '='.repeat(Math.min(72, project.name.length + 8)), ''];
  for (const tier of project.tiers) {
    const profiles = Object.entries(project.placements).filter(([id, tierId]) => tierId === tier.id).map(([id]) => byId.get(id)).filter(Boolean);
    lines.push(`${tier.name} (${profiles.length}):`);
    if (!profiles.length) lines.push('  —');
    else profiles.forEach(profile => lines.push(`  • ${profile.name}`));
    lines.push('');
  }
  const unassigned = visibleProfiles.filter(profile => !project.placements[profile.id]);
  lines.push(`Dolna pula (${unassigned.length}):`);
  unassigned.forEach(profile => lines.push(`  • ${profile.name}`));
  return lines.join('\n');
}

export function exportText(project, profiles) {
  downloadBlob(new Blob([buildTextSummary(project, profiles)], { type: 'text/plain;charset=utf-8' }), `${safeName(project.name)}.txt`);
}

export async function copyText(project, profiles) {
  const text = buildTextSummary(project, profiles);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Przeglądarka nie pozwoliła skopiować tekstu.');
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function imageData(url) {
  if (!url) return Promise.resolve('');
  return fetch(url).then(response => response.ok ? response.blob() : null).then(blob => {
    if (!blob) return '';
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }).catch(() => '');
}

export async function exportPng(project, visibleProfiles) {
  const width = 1600;
  const pad = 34;
  const labelWidth = 92;
  const cardWidth = 91;
  const cardImage = 75;
  const cardGap = 9;
  const rowPad = 12;
  const available = width - pad * 2 - labelWidth - 28;
  const columns = Math.max(1, Math.floor((available + cardGap) / (cardWidth + cardGap)));
  const byId = new Map(visibleProfiles.map(profile => [profile.id, profile]));
  const rows = project.tiers.map(tier => ({ tier, profiles: Object.entries(project.placements).filter(([, tierId]) => tierId === tier.id).map(([id]) => byId.get(id)).filter(Boolean) }));
  const header = 116;
  const rowHeights = rows.map(({ profiles }) => Math.max(102, Math.ceil(profiles.length / columns) * 111 + rowPad * 2));
  const height = header + rowHeights.reduce((a, b) => a + b, 0) + pad;
  if (height > 30000) throw new Error('Lista jest zbyt długa dla pojedynczego pliku PNG. Użyj eksportu JSON lub tekstowego.');
  const imageUrls = new Map();
  await Promise.all(rows.flatMap(row => row.profiles).map(async profile => {
    imageUrls.set(profile.id, await imageData(profileImageUrl(profile)));
  }));
  const theme = document.body.dataset.theme;
  const colors = theme === 'light' ? { bg: '#edf1f4', panel: '#fbfcfd', ink: '#17212a', muted: '#687781', border: '#d7dfe4' } : theme === 'night' ? { bg: '#090a0b', panel: '#101112', ink: '#d8dcde', muted: '#92989a', border: '#282b2c' } : { bg: '#11151a', panel: '#191f26', ink: '#e8edf1', muted: '#99a6b1', border: '#303a45' };
  const title = xmlEscape(project.name);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${colors.bg}"/><text x="${pad}" y="44" fill="${colors.ink}" font-family="Arial,sans-serif" font-size="28" font-weight="700">${title}</text><text x="${pad}" y="70" fill="${colors.muted}" font-family="Arial,sans-serif" font-size="13">Rozkład Gaussa · ${visibleProfiles.length} profili · ${project.tiers.length} poziomów</text>`;
  const count = visibleProfiles.length;
  let y = header;
  rows.forEach(({ tier, profiles }, rowIndex) => {
    const rowHeight = rowHeights[rowIndex];
    svg += `<rect x="${pad}" y="${y}" width="${width - pad * 2}" height="${rowHeight}" rx="10" fill="${colors.panel}" stroke="${colors.border}"/><rect x="${pad}" y="${y}" width="${labelWidth}" height="${rowHeight}" rx="10" fill="${xmlEscape(tier.color)}" fill-opacity=".16"/><path d="M ${pad + 3} ${y + 10} v ${rowHeight - 20}" stroke="${xmlEscape(tier.color)}" stroke-width="4" stroke-linecap="round"/><text x="${pad + labelWidth / 2}" y="${y + rowHeight / 2 - 2}" text-anchor="middle" fill="${xmlEscape(tier.color)}" font-family="Arial,sans-serif" font-size="24" font-weight="700">${xmlEscape(tier.name)}</text><text x="${pad + labelWidth / 2}" y="${y + rowHeight / 2 + 18}" text-anchor="middle" fill="${colors.muted}" font-family="monospace" font-size="11">${profiles.length}</text>`;
    const startX = pad + labelWidth + 15;
    profiles.forEach((profile, index) => {
      const col = index % columns;
      const line = Math.floor(index / columns);
      const x = startX + col * (cardWidth + cardGap);
      const top = y + rowPad + line * 111;
      svg += `<rect x="${x}" y="${top}" width="${cardWidth}" height="99" rx="7" fill="${colors.bg}" stroke="${colors.border}"/>`;
      const data = imageUrls.get(profile.id);
      if (data) svg += `<image href="${data}" x="${x + 8}" y="${top + 5}" width="${cardImage}" height="${cardImage}" preserveAspectRatio="xMidYMid slice"/>`;
      else svg += `<rect x="${x + 8}" y="${top + 5}" width="${cardImage}" height="${cardImage}" rx="4" fill="${colors.border}"/><text x="${x + cardWidth / 2}" y="${top + 49}" text-anchor="middle" fill="${colors.muted}" font-family="Arial,sans-serif" font-size="18">${xmlEscape((profile.name || '?').slice(0, 1))}</text>`;
      svg += `<text x="${x + cardWidth / 2}" y="${top + 91}" text-anchor="middle" fill="${colors.ink}" font-family="Arial,sans-serif" font-size="8.5">${xmlEscape(profile.name.slice(0, 24))}</text>`;
    });
    y += rowHeight + 7;
  });
  svg += `<text x="${pad}" y="${height - 14}" fill="${colors.muted}" font-family="Arial,sans-serif" font-size="10">Utworzono w Krzywa · ${new Date().toLocaleDateString('pl-PL')}</text></svg>`;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = svgUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Brak obsługi Canvas w tej przeglądarce.');
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Nie udało się utworzyć pliku PNG.');
    downloadBlob(blob, `${safeName(project.name)}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
