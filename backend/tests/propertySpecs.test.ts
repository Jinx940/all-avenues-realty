import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePropertyStories,
  propertySnapshotFromStories,
} from '../src/propertySpecs.js';

test('normalizePropertyStories keeps valid stories and units and generates missing ids', () => {
  const stories = normalizePropertyStories([
    {
      label: 'Story 1',
      units: [
        {
          label: 'Unit 1',
          bedrooms: 2,
          bathrooms: 1,
          halfBathrooms: 0,
          livingRooms: 1,
          diningRooms: 1,
          kitchens: 1,
          sunroom: 0,
          garages: 0,
          attic: 0,
          frontPorch: 0,
          backPorch: 0,
        },
      ],
    },
  ]);

  assert.equal(stories.length, 1);
  assert.equal(stories[0]?.label, 'Floor 1');
  assert.equal(stories[0]?.units[0]?.label, 'Unit 1');
  assert.equal(typeof stories[0]?.id, 'string');
  assert.equal(typeof stories[0]?.units[0]?.id, 'string');
});

test('normalizePropertyStories converts the legacy flat floor groups into stories', () => {
  const stories = normalizePropertyStories([
    {
      label: 'Tenant A / Unit 1',
      coveredFloors: 'Story 1',
      floors: 1,
      bedrooms: 2,
      bathrooms: 1,
      halfBathrooms: 0,
      livingRooms: 1,
      diningRooms: 0,
      kitchens: 1,
      sunroom: 0,
      garages: 0,
      attic: 0,
      frontPorch: 0,
      backPorch: 0,
    },
  ]);

  assert.equal(stories.length, 1);
  assert.equal(stories[0]?.label, 'Floor 1');
  assert.equal(stories[0]?.units[0]?.label, 'Tenant A / Unit 1');
});

test('propertySnapshotFromStories sums unit values and counts stories as floors', () => {
  const snapshot = propertySnapshotFromStories([
    {
      id: 'story-1',
      label: 'Story 1',
      units: [
        {
          id: 'unit-1',
          label: 'Unit 1',
          bedrooms: 2,
          bathrooms: 1,
          halfBathrooms: 0,
          livingRooms: 1,
          diningRooms: 0,
          kitchens: 1,
          sunroom: 0,
          garages: 0,
          attic: 0,
          frontPorch: 0,
          backPorch: 0,
        },
      ],
    },
    {
      id: 'story-2',
      label: 'Story 2',
      units: [
        {
          id: 'unit-2',
          label: 'Unit 1',
          bedrooms: 3,
          bathrooms: 2,
          halfBathrooms: 1,
          livingRooms: 1,
          diningRooms: 1,
          kitchens: 1,
          sunroom: 0,
          garages: 1,
          attic: 0,
          frontPorch: 0,
          backPorch: 1,
        },
      ],
    },
  ]);

  assert.deepEqual(snapshot, {
    floors: 2,
    bedrooms: 5,
    bathrooms: 3,
    halfBathrooms: 1,
    livingRooms: 2,
    diningRooms: 1,
    kitchens: 2,
    sunroom: 0,
    garages: 1,
    attic: 0,
    frontPorch: 0,
    backPorch: 1,
  });
});
