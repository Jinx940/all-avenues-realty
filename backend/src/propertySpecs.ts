import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizeStoryInput } from './lib/jobLocation.js';

export const propertySpecFieldNames = [
  'floors',
  'bedrooms',
  'bathrooms',
  'halfBathrooms',
  'livingRooms',
  'diningRooms',
  'kitchens',
  'sunroom',
  'garages',
  'attic',
  'frontPorch',
  'backPorch',
] as const;

export const propertyUnitSpecFieldNames = propertySpecFieldNames.filter(
  (field) => field !== 'floors',
) as Array<Exclude<(typeof propertySpecFieldNames)[number], 'floors'>>;

export type PropertySpecFieldName = (typeof propertySpecFieldNames)[number];
export type PropertyUnitSpecFieldName = (typeof propertyUnitSpecFieldNames)[number];

export type PropertySpecificationSnapshot = Record<PropertySpecFieldName, number | null>;
export type PropertyUnitSpecificationSnapshot = Record<PropertyUnitSpecFieldName, number | null>;

export type PropertyUnit = PropertyUnitSpecificationSnapshot & {
  id: string;
  label: string;
};

export type PropertyStory = {
  id: string;
  label: string;
  units: PropertyUnit[];
};

export type PropertyUnitSeed = Omit<PropertyUnit, 'id'> & {
  id?: string;
};

export type PropertyStorySeed = Omit<PropertyStory, 'id' | 'units'> & {
  id?: string;
  units: PropertyUnitSeed[];
};

type LegacyPropertyFloorGroup = PropertySpecificationSnapshot & {
  id: string;
  label: string;
  coveredFloors: string;
};

type LegacyPropertyFloorGroupSeed = Omit<LegacyPropertyFloorGroup, 'id'> & {
  id?: string;
};

export type PropertySpecificationDefaults = Partial<Record<PropertySpecFieldName, number>> & {
  stories?: PropertyStorySeed[];
  floorGroups?: LegacyPropertyFloorGroupSeed[];
};

const nullableIntegerValue = z.preprocess((value) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  return Number(raw);
}, z.number().int().min(0).nullable());

const propertyUnitJsonSchema = z
  .object({
    id: z.string().trim().max(120).optional().or(z.literal('')),
    label: z.string().trim().min(1).max(80),
    bedrooms: nullableIntegerValue,
    bathrooms: nullableIntegerValue,
    halfBathrooms: nullableIntegerValue,
    livingRooms: nullableIntegerValue,
    diningRooms: nullableIntegerValue,
    kitchens: nullableIntegerValue,
    sunroom: nullableIntegerValue,
    garages: nullableIntegerValue,
    attic: nullableIntegerValue,
    frontPorch: nullableIntegerValue,
    backPorch: nullableIntegerValue,
  })
  .transform((unit) => ({
    ...unit,
    id: unit.id || randomUUID(),
  }));

const propertyStoryJsonSchema = z
  .object({
    id: z.string().trim().max(120).optional().or(z.literal('')),
    label: z.string().trim().min(1).max(80),
    units: z.array(propertyUnitJsonSchema).max(20),
  })
  .transform((story) => ({
    ...story,
    label: normalizeStoryInput(story.label),
    id: story.id || randomUUID(),
  }));

export const propertyStoriesInputSchema = z.array(propertyStoryJsonSchema).max(40);

const legacyPropertyFloorGroupJsonSchema = z
  .object({
    id: z.string().trim().max(120).optional().or(z.literal('')),
    label: z.string().trim().min(1).max(80),
    coveredFloors: z.string().trim().min(1).max(120),
    floors: nullableIntegerValue,
    bedrooms: nullableIntegerValue,
    bathrooms: nullableIntegerValue,
    halfBathrooms: nullableIntegerValue,
    livingRooms: nullableIntegerValue,
    diningRooms: nullableIntegerValue,
    kitchens: nullableIntegerValue,
    sunroom: nullableIntegerValue,
    garages: nullableIntegerValue,
    attic: nullableIntegerValue,
    frontPorch: nullableIntegerValue,
    backPorch: nullableIntegerValue,
  })
  .transform((group) => ({
    ...group,
    id: group.id || randomUUID(),
  }));

const legacyPropertyFloorGroupsJsonSchema = z.array(legacyPropertyFloorGroupJsonSchema).max(40);

export const normalizePropertyStories = (
  value: Prisma.JsonValue | null | undefined,
): PropertyStory[] => {
  const parsedStories = propertyStoriesInputSchema.safeParse(value ?? []);
  if (parsedStories.success) {
    return parsedStories.data;
  }

  const parsedLegacyGroups = legacyPropertyFloorGroupsJsonSchema.safeParse(value ?? []);
  if (!parsedLegacyGroups.success) {
    return [];
  }

  return parsedLegacyGroups.data.map((group, index) => ({
    id: randomUUID(),
    label: normalizeStoryInput(group.coveredFloors.trim() || `Floor ${index + 1}`),
    units: [
      {
        id: group.id || randomUUID(),
        label: group.label,
        bedrooms: group.bedrooms,
        bathrooms: group.bathrooms,
        halfBathrooms: group.halfBathrooms,
        livingRooms: group.livingRooms,
        diningRooms: group.diningRooms,
        kitchens: group.kitchens,
        sunroom: group.sunroom,
        garages: group.garages,
        attic: group.attic,
        frontPorch: group.frontPorch,
        backPorch: group.backPorch,
      },
    ],
  }));
};

export const propertyStoriesToJson = (
  stories: PropertyStory[],
): Prisma.InputJsonValue => stories as unknown as Prisma.InputJsonValue;

export const propertySnapshotFromStories = (
  stories: PropertyStory[],
): PropertySpecificationSnapshot => {
  if (!stories.length) {
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

  const totals = {
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
  };

  stories.forEach((story) => {
    story.units.forEach((unit) => {
      propertyUnitSpecFieldNames.forEach((field) => {
        totals[field] += unit[field] ?? 0;
      });
    });
  });

  return {
    floors: stories.length,
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
