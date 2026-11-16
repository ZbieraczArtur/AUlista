export const DEFAULT_TIERS = [
  { id: 'tier-s', name: 'S', color: '#e6140a' },
  { id: 'tier-a', name: 'A', color: '#f07820' },
  { id: 'tier-b', name: 'B', color: '#f9d909' },
  { id: 'tier-c', name: 'C', color: '#0bb835' },
  { id: 'tier-d', name: 'D', color: '#0182ba' },
  { id: 'tier-e', name: 'E', color: '#526be8' },
  { id: 'tier-f', name: 'F', color: '#963fbc' }
];

export function sigmaForPreset(preset, tierCount) {
  const k = Math.max(3, tierCount);
  if (preset === 'narrow') return Math.max(0.45, k / 5.4);
  if (preset === 'wide') return Math.max(0.8, k / 1.9);
  return Math.max(0.65, k / 3.15);
}

export function gaussianWeights(tierCount, sigma) {
  const k = Math.max(0, Number(tierCount) || 0);
  if (!k) return [];
  const safeSigma = Math.max(0.05, Number(sigma) || 1);
  const mu = (k - 1) / 2;
  const values = Array.from({ length: k }, (_, index) => Math.exp(-0.5 * ((index - mu) / safeSigma) ** 2));
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map(value => value / total);
}

// Pair-aware largest-remainder apportionment. Mirrored tiers share a quota;
// an unmatched seat is placed on the centre (odd tier count) or split across
// the two central tiers (even tier count), keeping rounding centred.
export function hamilton(weights, total) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (!weights.length) return [];
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (!n || !sum) return weights.map(() => 0);
  const quotas = weights.map(value => (value / sum) * n);
  const limits = quotas.map(Math.floor);
  const fractions = quotas.map((value, index) => value - limits[index]);
  let remaining = n - limits.reduce((acc, value) => acc + value, 0);
  const center = (weights.length - 1) / 2;
  const pairs = [];
  for (let left = 0; left < Math.floor(weights.length / 2); left += 1) {
    const right = weights.length - 1 - left;
    pairs.push({ left, right, fraction: (fractions[left] + fractions[right]) / 2, distance: Math.abs((left + right) / 2 - center) });
  }
  pairs.sort((a, b) => b.fraction - a.fraction || a.distance - b.distance);
  if (weights.length % 2 === 1 && remaining % 2 === 1) {
    limits[Math.floor(center)] += 1;
    remaining -= 1;
  } else if (weights.length % 2 === 0 && remaining % 2 === 1) {
    // Exact mirror symmetry is impossible for an odd total over an even
    // number of tiers, so the single extra place sits on one central tier.
    limits[Math.floor(center)] += 1;
    remaining -= 1;
  }
  for (const pair of pairs) {
    if (remaining < 2) break;
    limits[pair.left] += 1;
    limits[pair.right] += 1;
    remaining -= 2;
  }
  if (weights.length % 2 === 1) {
    const middle = Math.floor(center);
    while (pairs.some(pair => limits[pair.left] > limits[middle])) {
      const outerPair = [...pairs].reverse().find(pair => limits[pair.left] > limits[middle]);
      if (!outerPair) break;
      limits[outerPair.left] -= 1;
      limits[outerPair.right] -= 1;
      limits[middle] += 2;
    }
  }
  // Floating point noise or an unexpectedly skewed weight vector should not
  // lose a profile; distribute any final seats from the centre outwards.
  let cursor = 0;
  while (remaining > 0) {
    const index = Math.min(weights.length - 1, Math.floor(center + (cursor % 2 ? -1 : 1) * Math.ceil(cursor / 2)));
    limits[index] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return limits;
}

export function calculateDistribution(profileCount, tiers, sigma, loose = false) {
  const count = Math.max(0, Math.floor(Number(profileCount) || 0));
  const weights = gaussianWeights(tiers.length, sigma);
  const base = hamilton(weights, count);
  const marginTotal = loose && count > 0 ? Math.ceil(count * 0.1) : 0;
  const margin = marginTotal ? hamilton(weights, marginTotal) : tiers.map(() => 0);
  const caps = tiers.map((_, index) => base[index] + (loose ? margin[index] : 0));
  return { base, margin, caps, weights, total: count, marginTotal };
}
