const storyPrefixExpression = /^(?:story|floor)\s+/i;
const unitPrefixExpression = /^unit\s+/i;

const prefixLabel = {
  story: 'Floor',
  unit: 'Unit',
} as const;

const removeKnownPrefix = (value: string, prefix: 'story' | 'unit') =>
  value.replace(prefix === 'story' ? storyPrefixExpression : unitPrefixExpression, '').trim();

const normalizePrefixedValue = (value: string, prefix: 'story' | 'unit') => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withoutPrefix = removeKnownPrefix(trimmed, prefix);
  const hadKnownPrefix = withoutPrefix !== trimmed;
  if (/^\d+[a-z]?$/i.test(withoutPrefix)) {
    return `${prefixLabel[prefix]} ${withoutPrefix.toUpperCase()}`;
  }

  if (hadKnownPrefix && withoutPrefix) {
    return `${prefixLabel[prefix]} ${withoutPrefix}`;
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
