import type { PropertySummary } from '../types';

const normalizePrefixedValue = (value: string, prefix: 'story' | 'unit') => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withoutPrefix = trimmed.replace(new RegExp(`^${prefix}\\s+`, 'i'), '').trim();
  if (/^\d+[a-z]?$/i.test(withoutPrefix)) {
    return `${prefix[0]!.toUpperCase()}${prefix.slice(1)} ${withoutPrefix.toUpperCase()}`;
  }

  return trimmed;
};

const stripPrefixedValue = (value: string, prefix: 'story' | 'unit') => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const matched = trimmed.match(new RegExp(`^${prefix}\\s+(.+)$`, 'i'));
  return matched?.[1]?.trim() || trimmed;
};

export const normalizeStoryInput = (value: string) => normalizePrefixedValue(value, 'story');

export const normalizeUnitInput = (value: string) => normalizePrefixedValue(value, 'unit');

export const toStoryFieldValue = (value: string) => stripPrefixedValue(value, 'story');

export const toUnitFieldValue = (value: string) => stripPrefixedValue(value, 'unit');

const findStoryByLabel = (story: string, property: PropertySummary | null) => {
  const normalizedInput = normalizeStoryInput(story).toLowerCase();
  if (!normalizedInput) return null;

  return (
    property?.stories.find((item) => item.label.trim().toLowerCase() === normalizedInput) ?? null
  );
};

export const findMatchingStoryLabel = (story: string, property: PropertySummary | null) => {
  const matchedStory = findStoryByLabel(story, property);
  return matchedStory?.label ?? normalizeStoryInput(story);
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
    property?.stories.find((story) => story.label.trim().toLowerCase() === normalizeStoryInput(raw).toLowerCase()) ??
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
