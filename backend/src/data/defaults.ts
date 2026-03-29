import {
  FileCategory,
  InvoiceStatus,
  JobStatus,
  PaymentStatus,
  WorkerHistoryAction,
  WorkerStatus,
} from '@prisma/client';
import type { PropertySpecificationDefaults } from '../propertySpecs.js';

export const defaultWorkers = ['Juan', 'Marvin', 'Ryan', 'Renzo', 'Bryan', 'Jimmy', 'Todd'];

export const defaultProperties = [
  '10520 Helena Avenue',
  '10802 Morison Avenue',
  '11628 Imperial Avenue',
  '11714 Forest Avenue',
  '11 Meadowlawn Drive',
  '12608 Woodside Avenue',
  '15222 Saranac Rd',
  '1548 Mapledale Road',
  '11807 Honeydale Avenue',
  '1018 Starr Avenue',
  '1068 East 177th Street',
  '11214 Greenwich Ave',
  '11735 Jensen Court',
  '1265 East 80th Street',
  '1341 East 89th Street',
  '16124 Glynn Road',
  '20500 Priday Avenue',
  '2871 East 111th Street',
  '2943 East 126th Street',
  '30232 Robert Street',
  '3126 West 82nd Street',
  '3425 East 52nd Street',
  '3451 Hartwood Rd',
  '3673 East 144th Street',
  '3721 East 146th Street',
  '3800 Rosemont Road',
  '4015 East 143rd Street',
  '423 Oak Street',
  '4256 East 119th Street',
  '4310 Archwood Avenue',
  '4312 Archwood Avenue',
  '4331 Mozart Avenue',
  '4353 W. 61st Street',
  '448 East 149th Street',
  '470 East 147th Street',
  '5504 Linton Avenue',
  '5712 Hamlet Avenue',
  '711 1/2 High Street',
  '7112 Cronk Drive',
  '787 Thornhill Drive',
  '7935 Lorah Avenue',
  '8306 Maryland Avenue',
  '9227 Adams Ave',
  '9605 Wamelink Avenue',
  '977 Clark Road',
];

export const defaultPropertySpecifications: Record<string, PropertySpecificationDefaults> = {
  '15222 Saranac Rd': {
    floors: 2,
    bedrooms: 3,
    bathrooms: 2,
    halfBathrooms: 1,
    livingRooms: 1,
    diningRooms: 1,
    kitchens: 1,
    sunroom: 1,
    garages: 1,
    frontPorch: 1,
    backPorch: 1,
  },
  '10520 Helena Avenue': {
    floors: 2,
    bedrooms: 4,
    bathrooms: 2,
    halfBathrooms: 1,
    livingRooms: 1,
    diningRooms: 1,
    kitchens: 1,
    sunroom: 1,
    garages: 1,
    attic: 1,
    frontPorch: 1,
  },
  '1548 Mapledale Road': {
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    livingRooms: 1,
    diningRooms: 1,
    kitchens: 1,
    garages: 1,
    backPorch: 1,
  },
};

export const jobStatusLabels: Record<JobStatus, string> = {
  [JobStatus.DONE]: 'Done',
  [JobStatus.IN_PROGRESS]: 'In progress',
  [JobStatus.PENDING]: 'Pending',
  [JobStatus.PLANNING]: 'Planning',
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  [PaymentStatus.PAID]: 'Paid',
  [PaymentStatus.PARTIAL_PAYMENT]: 'Partial Payment',
  [PaymentStatus.UNPAID]: 'Unpaid',
  [PaymentStatus.NOT_INVOICED_YET]: 'Not invoiced yet',
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  [InvoiceStatus.YES]: 'Yes',
  [InvoiceStatus.NO]: 'No',
};

export const workerStatusLabels: Record<WorkerStatus, string> = {
  [WorkerStatus.ACTIVE]: 'Active',
  [WorkerStatus.INACTIVE]: 'Inactive',
};

export const workerHistoryActionLabels: Record<WorkerHistoryAction, string> = {
  [WorkerHistoryAction.ADDED]: 'Added',
  [WorkerHistoryAction.DISABLED]: 'Disabled',
  [WorkerHistoryAction.ENABLED]: 'Enabled',
  [WorkerHistoryAction.DELETED]: 'Deleted',
};

export const fileFieldToCategory = {
  before: FileCategory.BEFORE,
  progress: FileCategory.PROGRESS,
  after: FileCategory.AFTER,
  receipt: FileCategory.RECEIPT,
  invoice: FileCategory.INVOICE,
  quote: FileCategory.QUOTE,
} as const;

export const fileCategoryLabels: Record<FileCategory, string> = {
  [FileCategory.BEFORE]: 'Before',
  [FileCategory.PROGRESS]: 'Progress',
  [FileCategory.AFTER]: 'After',
  [FileCategory.RECEIPT]: 'Receipt',
  [FileCategory.INVOICE]: 'Invoice',
  [FileCategory.QUOTE]: 'Quote',
};

export const jobStatusOptions = Object.entries(jobStatusLabels).map(([value, label]) => ({
  value,
  label,
}));

export const paymentStatusOptions = Object.entries(paymentStatusLabels).map(([value, label]) => ({
  value,
  label,
}));

export const visiblePaymentStatusOptions = paymentStatusOptions.filter(
  (option) => option.value !== PaymentStatus.NOT_INVOICED_YET,
);

export const invoiceStatusOptions = Object.entries(invoiceStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
