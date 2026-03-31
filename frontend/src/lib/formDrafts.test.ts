import { describe, expect, it } from 'vitest';
import type { JobFileMap, JobRow, PropertySummary } from '../types';
import {
  createEditableJobFormState,
  serializeJobFormDraft,
  serializePropertyFormDraft,
  serializeUserDraft,
} from './formDrafts';

const emptyRemoteFiles = (): JobFileMap => ({
  before: [],
  progress: [],
  after: [],
  receipt: [],
  invoice: [],
  quote: [],
});

const makeProperty = (): PropertySummary => ({
  id: 'property-1',
  name: 'Saranac Rd',
  address: '1 Main St',
  cityLine: 'Syracuse, NY',
  notes: '',
  coverImageUrl: null,
  floors: 1,
  bedrooms: 2,
  bathrooms: 1,
  halfBathrooms: null,
  livingRooms: 1,
  diningRooms: 1,
  kitchens: 1,
  sunroom: null,
  garages: null,
  attic: null,
  frontPorch: null,
  backPorch: null,
  stories: [],
  totalJobs: 0,
  openJobs: 0,
  lateJobs: 0,
});

const makeJob = (): JobRow => ({
  id: 'job-1',
  propertyId: 'property-1',
  propertyName: 'Saranac Rd',
  story: 'Story 1',
  section: 'Kitchen',
  unit: 'Unit 1',
  area: 'Kitchen',
  service: 'Painting',
  description: 'Paint walls',
  materialCost: 125,
  laborCost: 200,
  totalCost: 325,
  status: 'PENDING',
  statusLabel: 'Pending',
  invoiceStatus: 'NO',
  invoiceStatusLabel: 'No',
  paymentStatus: 'UNPAID',
  paymentStatusLabel: 'Unpaid',
  advanceCashApp: 0,
  startDate: '2026-03-30T00:00:00.000Z',
  dueDate: '2026-04-02T00:00:00.000Z',
  completedAt: null,
  workerIds: ['worker-b', 'worker-a'],
  workers: [],
  files: emptyRemoteFiles(),
  timeline: {
    tone: 'neutral',
    label: 'Pending',
    isLate: false,
  },
  createdAt: '2026-03-30T00:00:00.000Z',
  updatedAt: '2026-03-30T00:00:00.000Z',
});

describe('formDrafts', () => {
  it('creates the editable job form state from a saved job', () => {
    const draft = createEditableJobFormState(makeJob(), [makeProperty()]);

    expect(draft.id).toBe('job-1');
    expect(draft.propertyId).toBe('property-1');
    expect(draft.story).toBe('Story 1');
    expect(draft.workerIds).toEqual(['worker-b', 'worker-a']);
    expect(draft.files.before).toEqual([]);
  });

  it('serializes job drafts including staged local files', () => {
    const baseDraft = createEditableJobFormState(makeJob(), [makeProperty()]);
    const changedDraft = {
      ...baseDraft,
      files: {
        ...baseDraft.files,
        before: [new File(['demo'], 'before.jpg', { type: 'image/jpeg', lastModified: 123 })],
      },
    };

    expect(serializeJobFormDraft(changedDraft)).not.toBe(serializeJobFormDraft(baseDraft));
  });

  it('serializes nested property draft changes', () => {
    const baseDraft = {
      name: 'Saranac Rd',
      address: '1 Main St',
      cityLine: 'Syracuse, NY',
      notes: '',
      coverImageUrl: '',
      stories: [],
    };
    const changedDraft = {
      ...baseDraft,
      stories: [
        {
          id: 'story-1',
          label: 'Story 1',
          units: [
            {
              id: 'unit-1',
              label: 'Unit 1',
              bedrooms: '2',
              bathrooms: '1',
              halfBathrooms: '',
              livingRooms: '1',
              diningRooms: '',
              kitchens: '1',
              sunroom: '',
              garages: '',
              attic: '',
              frontPorch: '',
              backPorch: '',
            },
          ],
        },
      ],
    };

    expect(serializePropertyFormDraft(changedDraft)).not.toBe(serializePropertyFormDraft(baseDraft));
  });

  it('normalizes user drafts before comparison', () => {
    expect(
      serializeUserDraft({
        username: ' admin ',
        displayName: ' System Admin ',
        password: 'secret',
        role: 'ADMIN',
        workerId: ' ',
      }),
    ).toContain('"username":"admin"');
  });
});
