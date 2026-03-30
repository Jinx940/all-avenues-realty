import type { PropertySummary } from '../types';

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

const stripPrefixedValue = (value: string, prefix: 'story' | 'unit') => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  return removeKnownPrefix(trimmed, prefix) || trimmed;
};

export const normalizeStoryInput = (value: string) => normalizePrefixedValue(value, 'story');

export const normalizeUnitInput = (value: string) => normalizePrefixedValue(value, 'unit');

export const formatStoryDisplayLabel = (value: string) => normalizeStoryInput(value);

export const toStoryFieldValue = (value: string) => stripPrefixedValue(value, 'story');

export const toUnitFieldValue = (value: string) => stripPrefixedValue(value, 'unit');

const joinLocationParts = (parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ');

export const formatAreaServiceLabel = (area: string, service: string, fallback = 'General Service') =>
  joinLocationParts([area, service]) || fallback;

export const formatJobLocationSummary = (
  story: string,
  unit: string,
  area: string,
  service: string,
  fallback = 'Whole property',
) => joinLocationParts([formatStoryDisplayLabel(story), unit, area, service]) || fallback;

const findStoryByLabel = (story: string, property: PropertySummary | null) => {
  const normalizedInput = normalizeStoryInput(story).toLowerCase();
  if (!normalizedInput) return null;

  return (
    property?.stories.find((item) => normalizeStoryInput(item.label).toLowerCase() === normalizedInput) ?? null
  );
};

export const findMatchingStoryLabel = (story: string, property: PropertySummary | null) => {
  const matchedStory = findStoryByLabel(story, property);
  return matchedStory ? formatStoryDisplayLabel(matchedStory.label) : normalizeStoryInput(story);
};

export const findMatchingUnitLabel = (
  story: string,
  unit: string,
  property: PropertySummary | null,
) => {
  const normalizedUnit = normalizeUnitInput(unit).toLowerCase();
  if (!normalizedUnit) return '';

  const matchedStory = findStoryByLabel(story, property);
  if (matchedStory) {
    const storyUnit =
      matchedStory.units.find((item) => item.label.trim().toLowerCase() === normalizedUnit) ?? null;
    if (storyUnit) {
      return storyUnit.label;
    }
  }

  const matchedUnit =
    property?.stories
      .flatMap((item) => item.units)
      .find((item) => item.label.trim().toLowerCase() === normalizedUnit) ?? null;

  return matchedUnit?.label ?? normalizeUnitInput(unit);
};

export const buildInternalSectionValue = (story: string, unit: string, fallback = '') => {
  const parts = [normalizeStoryInput(story), normalizeUnitInput(unit)].filter(Boolean);
  if (parts.length) return parts.join(' / ');
  return fallback.trim();
};

export const parseJobLocationValue = (value: string, property: PropertySummary | null) => {
  const raw = value.trim();
  if (!raw) {
    return { story: '', unit: '' };
  }

  const exactStory =
    property?.stories.find(
      (story) => normalizeStoryInput(story.label).toLowerCase() === normalizeStoryInput(raw).toLowerCase(),
    ) ??
    null;
  if (exactStory) {
    return { story: toStoryFieldValue(exactStory.label), unit: '' };
  }

  const exactUnit =
    property?.stories
      .flatMap((story) =>
        story.units.map((unit) => ({
          story: story.label,
          unit: unit.label,
        })),
      )
      .find((item) => item.unit.trim().toLowerCase() === normalizeUnitInput(raw).toLowerCase()) ?? null;
  if (exactUnit) {
    return { story: toStoryFieldValue(exactUnit.story), unit: toUnitFieldValue(exactUnit.unit) };
  }

  const parts = raw
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      story: toStoryFieldValue(parts[0] ?? ''),
      unit: toUnitFieldValue(parts.slice(1).join(' / ')),
    };
  }

  return { story: '', unit: toUnitFieldValue(raw) };
};
