type WorkerKeyInput =
  | string
  | {
      id?: string | null;
      name?: string | null;
    };

const WORKER_ACCENT_COUNT = 10;

const normalizeWorkerKey = (value: WorkerKeyInput) => {
  if (typeof value === 'string') return value.trim().toLowerCase();
  return `${value.id ?? ''}::${value.name ?? ''}`.trim().toLowerCase();
};

const hashWorkerKey = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const getWorkerAccentClass = (value: WorkerKeyInput) => {
  const normalized = normalizeWorkerKey(value) || 'worker';
  const paletteIndex = hashWorkerKey(normalized) % WORKER_ACCENT_COUNT;
  return `worker-accent-${paletteIndex}`;
};
