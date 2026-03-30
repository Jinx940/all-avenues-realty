import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildJobSectionValue,
  normalizeStoryInput,
  normalizeUnitInput,
} from '../src/lib/jobLocation.js';

test('normalizeStoryInput converts numeric values to canonical floor labels', () => {
  assert.equal(normalizeStoryInput('1'), 'Floor 1');
  assert.equal(normalizeStoryInput('story 02'), 'Floor 02');
  assert.equal(normalizeStoryInput('floor 03'), 'Floor 03');
  assert.equal(normalizeStoryInput('Basement'), 'Basement');
});

test('normalizeUnitInput converts numeric values to canonical unit labels', () => {
  assert.equal(normalizeUnitInput('3'), 'Unit 3');
  assert.equal(normalizeUnitInput('unit 4b'), 'Unit 4B');
  assert.equal(normalizeUnitInput('Tenant A'), 'Tenant A');
});

test('buildJobSectionValue joins normalized story and unit values', () => {
  assert.equal(buildJobSectionValue('1', '2', 'Kitchen'), 'Floor 1 / Unit 2');
  assert.equal(buildJobSectionValue('', '', 'Kitchen'), 'Kitchen');
});
