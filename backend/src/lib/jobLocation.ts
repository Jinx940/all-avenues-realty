const normalizePrefixedValue = (value: string, prefix: 'story' | 'unit') => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withoutPrefix = trimmed.replace(new RegExp(`^${prefix}\\s+`, 'i'), '').trim();
  if (/^\d+[a-z]?$/i.test(withoutPrefix)) {
    return `${prefix[0]!.toUpperCase()}${prefix.slice(1)} ${withoutPrefix.toUpperCase()}`;
  }

  return trimmed;
};

export const normalizeStoryInput = (value: string) => normalizePrefixedValue(value, 'story');

export const normalizeUnitInput = (value: string) => normalizePrefixedValue(value, 'unit');

export const buildJobSectionValue = (story: string, unit: string, fallback = '') => {
  const parts = [normalizeStoryInput(story), normalizeUnitInput(unit)].filter(Boolean);
  if (parts.length) return parts.join(' / ');
  return fallback.trim();
};
