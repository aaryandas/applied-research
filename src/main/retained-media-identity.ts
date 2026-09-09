const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function isRetainedMediaId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export const RETAINED_MEDIA_SCHEME = 'ar-media';
export const MAX_RETAINED_MEDIA_BYTES = 24 * 1024 * 1024;
