const apiBaseUrl = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const readIssueDetails = (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || !('issues' in payload)) {
    return [];
  }

  const issues = (payload as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues
    .slice(0, 4)
    .map((issue) => {
      if (!issue || typeof issue !== 'object') {
        return '';
      }

      const path = Array.isArray((issue as { path?: unknown }).path)
        ? ((issue as { path: unknown[] }).path
            .map((segment) => String(segment))
            .join('.')
            .replace(/\.(\d+)(?=\.|$)/g, '[$1]'))
        : '';
      const message =
        'message' in issue && (issue as { message?: unknown }).message
          ? String((issue as { message: unknown }).message)
          : '';

      if (!path && !message) {
        return '';
      }

      return path ? `${path}: ${message}` : message;
    })
    .filter(Boolean);
};

const readErrorMessage = async (response: Response) => {
  const clonedResponse = response.clone();
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'message' in payload && payload.message) {
    const issueDetails = readIssueDetails(payload);
    return issueDetails.length
      ? `${String(payload.message)}. ${issueDetails.join(' | ')}`
      : String(payload.message);
  }

  const textFallback = await clonedResponse.text().catch(() => '');
  const normalizedText = textFallback.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalizedText) {
    return normalizedText.length > 220 ? `${normalizedText.slice(0, 217)}...` : normalizedText;
  }

  return `${response.status} ${response.statusText}`;
};

export const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: init?.headers ?? {},
    });
  } catch {
    const target = apiBaseUrl || 'the current origin';
    throw new Error(`Could not connect to the backend. Start the API on ${target} and try again.`);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  return (await response.json()) as T;
};

export const requestBlob = async (path: string, init?: RequestInit) => {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: init?.headers ?? {},
    });
  } catch {
    const target = apiBaseUrl || 'the current origin';
    throw new Error(`Could not connect to the backend. Start the API on ${target} and try again.`);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  return response.blob();
};

export const fetchAssetBlob = async (url: string) => {
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: 'include',
    });
  } catch {
    throw new Error('Could not load the protected file.');
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  return response.blob();
};

export const buildAssetUrl = (path: string) =>
  apiBaseUrl ? new URL(path, `${apiBaseUrl}/`).toString() : path;

export const assetImageCrossOrigin = apiBaseUrl ? ('use-credentials' as const) : undefined;

export { apiBaseUrl };
