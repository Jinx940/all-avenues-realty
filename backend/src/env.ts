import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const booleanFlag = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) {
    return undefined;
  }

  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false;
  }

  return value;
}, z.boolean().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default(''),
  TRUST_PROXY: booleanFlag.default(false),
  SESSION_COOKIE_NAME: z.string().min(1).default('all_avenues_session'),
  AUTH_SESSION_DAYS: z.coerce.number().int().positive().default(14),
  UPLOADS_DIR: z.string().min(1).default('uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
});

export const buildEnv = (source: NodeJS.ProcessEnv) => {
  const parsedEnv = envSchema.safeParse({
    ...source,
    API_PORT: source.API_PORT ?? source.PORT,
  });

  if (!parsedEnv.success) {
    console.error('Invalid environment variables', parsedEnv.error.flatten().fieldErrors);
    process.exit(1);
  }

  return {
    ...parsedEnv.data,
    uploadsDir: path.resolve(process.cwd(), parsedEnv.data.UPLOADS_DIR),
    maxUploadSizeBytes: parsedEnv.data.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    allowedCorsOrigins: parsedEnv.data.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
};

export const env = buildEnv(process.env);
