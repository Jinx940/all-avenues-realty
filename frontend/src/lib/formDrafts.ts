import type { JobFormState } from '../components/JobsView';
import type { PropertyFormState } from '../components/PropertiesView';
import { parseJobLocationValue } from './jobLocation';
import type { JobFileField, JobRow, PropertySummary, UserRole } from '../types';

export type UserDraftComparable = {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  workerId: string;
};

const jobFileFields: JobFileField[] = ['before', 'progress', 'after', 'receipt', 'invoice', 'quote'];

const localFileFingerprint = (file: File) =>
  [file.name, file.size, file.type, file.lastModified].join(':');

export const createEditableJobFormState = (
  job: JobRow,
  properties: PropertySummary[],
): JobFormState => {
  const property = properties.find((propertyItem) => propertyItem.id === job.propertyId) ?? null;
  const location =
    job.story || job.unit
      ? { story: job.story || parseJobLocationValue(job.unit, property).story, unit: job.unit }
      : parseJobLocationValue(job.unit, property);

  return {
    id: job.id,
    propertyId: job.propertyId,
    story: location.story,
    unit: location.unit,
    section: job.section,
    area: job.area,
    service: job.service,
    description: job.description,
    materialCost: String(job.materialCost),
    laborCost: String(job.laborCost),
    status: job.status,
    invoiceStatus: job.invoiceStatus,
    paymentStatus: job.paymentStatus,
    advanceCashApp: String(job.advanceCashApp),
    startDate: job.startDate ? job.startDate.slice(0, 10) : '',
    dueDate: job.dueDate ? job.dueDate.slice(0, 10) : '',
    workerIds: job.workerIds,
    files: {
      before: [],
      progress: [],
      after: [],
      receipt: [],
      invoice: [],
      quote: [],
    },
    currentFiles: job.files,
  };
};

export const serializeJobFormDraft = (form: JobFormState) =>
  JSON.stringify({
    id: form.id,
    propertyId: form.propertyId,
    story: form.story.trim(),
    unit: form.unit.trim(),
    section: form.section.trim(),
    area: form.area.trim(),
    service: form.service.trim(),
    description: form.description.trim(),
    materialCost: form.materialCost.trim(),
    laborCost: form.laborCost.trim(),
    status: form.status,
    invoiceStatus: form.invoiceStatus,
    paymentStatus: form.paymentStatus,
    advanceCashApp: form.advanceCashApp.trim(),
    startDate: form.startDate,
    dueDate: form.dueDate,
    workerIds: [...form.workerIds].sort(),
    files: Object.fromEntries(
      jobFileFields.map((field) => [field, form.files[field].map(localFileFingerprint)]),
    ),
  });

export const serializePropertyFormDraft = (form: PropertyFormState) =>
  JSON.stringify({
    name: form.name.trim(),
    address: form.address.trim(),
    cityLine: form.cityLine.trim(),
    notes: form.notes.trim(),
    coverImageUrl: form.coverImageUrl.trim(),
    stories: form.stories.map((story) => ({
      id: story.id,
      label: story.label.trim(),
      units: story.units.map((unit) => ({
        id: unit.id,
        label: unit.label.trim(),
        bedrooms: unit.bedrooms.trim(),
        bathrooms: unit.bathrooms.trim(),
        halfBathrooms: unit.halfBathrooms.trim(),
        livingRooms: unit.livingRooms.trim(),
        diningRooms: unit.diningRooms.trim(),
        kitchens: unit.kitchens.trim(),
        sunroom: unit.sunroom.trim(),
        garages: unit.garages.trim(),
        attic: unit.attic.trim(),
        frontPorch: unit.frontPorch.trim(),
        backPorch: unit.backPorch.trim(),
      })),
    })),
  });

export const serializeUserDraft = (draft: UserDraftComparable) =>
  JSON.stringify({
    username: draft.username.trim(),
    displayName: draft.displayName.trim(),
    password: draft.password,
    role: draft.role,
    workerId: draft.workerId.trim(),
  });
