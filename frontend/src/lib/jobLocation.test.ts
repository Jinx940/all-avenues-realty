import { describe, expect, it } from 'vitest';
import {
  buildInternalSectionValue,
  formatAreaServiceLabel,
  formatJobLocationSummary,
  findMatchingStoryLabel,
  findMatchingUnitLabel,
  parseJobLocationValue,
} from './jobLocation';
import type { PropertySummary } from '../types';

const property: PropertySummary = {
  id: 'property-1',
  name: '1018 Starr Avenue',
  address: null,
  cityLine: null,
  notes: null,
  coverImageUrl: null,
  floors: 2,
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
  stories: [
    {
      id: 'story-1',
      label: 'Story 1',
      units: [{ id: 'unit-1', label: 'Unit 1', bedrooms: 1, bathrooms: 1, halfBathrooms: 0, livingRooms: 0, diningRooms: 0, kitchens: 1, sunroom: 0, garages: 0, attic: 0, frontPorch: 0, backPorch: 0 }],
    },
  ],
  totalJobs: 0,
  openJobs: 0,
  lateJobs: 0,
};

describe('jobLocation helpers', () => {
  it('matches canonical story and unit labels from numeric input', () => {
    expect(findMatchingStoryLabel('1', property)).toBe('Floor 1');
    expect(findMatchingStoryLabel('floor 1', property)).toBe('Floor 1');
    expect(findMatchingUnitLabel('1', '1', property)).toBe('Unit 1');
  });

  it('builds normalized internal section labels', () => {
    expect(buildInternalSectionValue('1', '2', 'Kitchen')).toBe('Floor 1 / Unit 2');
    expect(buildInternalSectionValue('', '', 'Kitchen')).toBe('Kitchen');
  });

  it('parses stored labels back into compact form fields', () => {
    expect(parseJobLocationValue('Floor 1 / Unit 1', property)).toEqual({
      story: '1',
      unit: '1',
    });
  });

  it('formats area and service labels in display order', () => {
    expect(formatAreaServiceLabel('Kitchen', 'Electrical')).toBe('Kitchen / Electrical');
    expect(formatAreaServiceLabel('', 'Electrical')).toBe('Electrical');
  });

  it('formats full job location summaries with area before service', () => {
    expect(formatJobLocationSummary('Story 1', 'Unit 1', 'Kitchen', 'Electrical')).toBe(
      'Floor 1 / Unit 1 / Kitchen / Electrical',
    );
  });
});
