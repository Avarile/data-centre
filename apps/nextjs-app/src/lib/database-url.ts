const APP_DATABASE_ENV_KEYS = [
  'PRISMA_META_DATABASE_URL',
  'PRISMA_DATABASE_URL',
  'DATABASE_URL',
  'PRISMA_DATA_DATABASE_URL',
] as const;

/**
 * Takes a plain string dictionary rather than NodeJS.ProcessEnv: Next augments
 * ProcessEnv so that NODE_ENV is required, which would force every caller to
 * supply it even though this function only reads the keys above.
 */
export const getAppDatabaseUrl = (
  env: Record<string, string | undefined> = process.env
): string => {
  for (const key of APP_DATABASE_ENV_KEYS) {
    const value = env[key];
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing database url (${APP_DATABASE_ENV_KEYS.join(', ')})`);
};
