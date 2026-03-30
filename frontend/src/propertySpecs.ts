import type { UiIconName } from './components/UiIcon';
import { normalizeStoryInput } from './lib/jobLocation';
import type {
  PropertySpecificationSnapshot,
  PropertyStory,
  PropertyUnit,
  PropertyUnitSpecificationSnapshot,
} from './types';

export type PropertyUnitSpecFieldName = keyof PropertyUnitSpecificationSnapshot;
export type PropertyUnitSpecFormValues = Record<PropertyUnitSpecFieldName, string>;

export type PropertyUnitFormState = PropertyUnitSpecFormValues & {
  id: string;
  label: string;
};

export type PropertyStoryFormState = {
  id: string;
  label: string;
  units: PropertyUnitFormState[];
};

export const propertyUnitSpecFields: Array<{
  key: PropertyUnitSpecFieldName;
  label: string;
  icon: UiIconName;
}> = [
  { key: 'bedrooms', label: 'Bedrooms', icon: 'bed' },
  { key: 'bathrooms', label: 'Bathrooms', icon: 'bath' },
  { key: 'halfBathrooms', label: '1/2 Bathrooms', icon: 'bath' },
  { key: 'livingRooms', label: 'Living Rooms', icon: 'sofa' },
  { key: 'diningRooms', label: 'Dining Rooms', icon: 'sofa' },
  { key: 'kitchens', label: 'Kitchens', icon: 'utensils' },
  { key: 'sunroom', label: 'Sunroom', icon: 'home' },
  { key: 'garages', label: 'Garages', icon: 'car' },
  { key: 'attic', label: 'Attic', icon: 'building' },
  { key: 'frontPorch', label: 'Front Porch', icon: 'home' },
  { key: 'backPorch', label: 'Back Porch', icon: 'home' },
];

const createClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `property-node-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyPropertyUnitSpecFormValues = (): PropertyUnitSpecFormValues =>
  propertyUnitSpecFields.reduce<PropertyUnitSpecFormValues>(
    (result, field) => ({ ...result, [field.key]: '' }),
    {
      bedrooms: '',
      bathrooms: '',
      halfBathrooms: '',
      livingRooms: '',
      diningRooms: '',
      kitchens: '',
      sunroom: '',
      garages: '',
      attic: '',
      frontPorch: '',
      backPorch: '',
    },
  );

export const createPropertyUnitSpecFormValuesFromSummary = (
  snapshot: PropertyUnitSpecificationSnapshot,
): PropertyUnitSpecFormValues =>
  propertyUnitSpecFields.reduce<PropertyUnitSpecFormValues>(
    (result, field) => ({
      ...result,
      [field.key]: snapshot[field.key] != null ? String(snapshot[field.key]) : '',
    }),
    createEmptyPropertyUnitSpecFormValues(),
  );

export const createEmptyPropertyUnitForm = (label = ''): PropertyUnitFormState => ({
  id: createClientId(),
  label,
  ...createEmptyPropertyUnitSpecFormValues(),
});

export const createEmptyPropertyStoryForm = (label = ''): PropertyStoryFormState => ({
  id: createClientId(),
  label: normalizeStoryInput(label),
  units: [],
});

export const createPropertyUnitFormFromSummary = (unit: PropertyUnit): PropertyUnitFormState => ({
  id: unit.id,
  label: unit.label,
  ...createPropertyUnitSpecFormValuesFromSummary(unit),
});

export const createPropertyStoryFormFromSummary = (
  story: PropertyStory,
): PropertyStoryFormState => ({
  id: story.id,
  label: normalizeStoryInput(story.label),
  units: story.units.map(createPropertyUnitFormFromSummary),
});

export const unitHasAnyValue = (unit: PropertyUnitFormState) =>
  Boolean(unit.label.trim() || propertyUnitSpecFields.some((field) => unit[field.key].trim()));

export const storyHasAnyValue = (story: PropertyStoryFormState) =>
  Boolean(story.label.trim() || story.units.some(unitHasAnyValue));

const numericFrom = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
};

export const buildPropertySpecificationSnapshotFromStories = (
  stories: PropertyStoryFormState[],
): PropertySpecificationSnapshot => {
  const activeStories = stories.filter(storyHasAnyValue);

  if (!activeStories.length) {
    return {
      floors: null,
      bedrooms: null,
      bathrooms: null,
      halfBathrooms: null,
      livingRooms: null,
      diningRooms: null,
      kitchens: null,
      sunroom: null,
      garages: null,
      attic: null,
      frontPorch: null,
      backPorch: null,
    };
  }

  const totals = propertyUnitSpecFields.reduce<Record<PropertyUnitSpecFieldName, number>>(
    (result, field) => ({ ...result, [field.key]: 0 }),
    {
      bedrooms: 0,
      bathrooms: 0,
      halfBathrooms: 0,
      livingRooms: 0,
      diningRooms: 0,
      kitchens: 0,
      sunroom: 0,
      garages: 0,
      attic: 0,
      frontPorch: 0,
      backPorch: 0,
    },
  );

  activeStories.forEach((story) => {
    story.units.forEach((unit) => {
      propertyUnitSpecFields.forEach((field) => {
        totals[field.key] += numericFrom(unit[field.key]) ?? 0;
      });
    });
  });

  return {
    floors: activeStories.length,
    bedrooms: totals.bedrooms,
    bathrooms: totals.bathrooms,
    halfBathrooms: totals.halfBathrooms,
    livingRooms: totals.livingRooms,
    diningRooms: totals.diningRooms,
    kitchens: totals.kitchens,
    sunroom: totals.sunroom,
    garages: totals.garages,
    attic: totals.attic,
    frontPorch: totals.frontPorch,
    backPorch: totals.backPorch,
  };
};
