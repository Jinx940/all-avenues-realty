import { HttpError } from './http.js';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const parseNullableLocalDate = (
  value: string | null | undefined,
  fieldName = 'date',
) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (!isoDatePattern.test(raw)) {
    throw new HttpError(400, `Invalid ${fieldName}. Use YYYY-MM-DD format.`);
  }

  const [yearText, monthText, dayText] = raw.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new HttpError(400, `Invalid ${fieldName}. Use a real calendar date.`);
  }

  return date;
};
