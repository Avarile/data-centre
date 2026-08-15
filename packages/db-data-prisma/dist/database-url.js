"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSharedMetaDataDatabase = exports.getDataDatabaseUrl = exports.getMetaDatabaseUrl = void 0;
const META_DATABASE_ENV_KEYS = ['PRISMA_META_DATABASE_URL', 'PRISMA_DATABASE_URL', 'DATABASE_URL'];
const DATA_DATABASE_ENV_KEYS = [
    'PRISMA_DATA_DATABASE_URL',
    'PRISMA_META_DATABASE_URL',
    'PRISMA_DATABASE_URL',
    'DATABASE_URL',
];
const getMetaDatabaseUrl = (env = process.env) => {
    for (const key of META_DATABASE_ENV_KEYS) {
        const value = env[key];
        if (value) {
            return value;
        }
    }
    throw new Error(`Missing meta database url (${META_DATABASE_ENV_KEYS.join(', ')})`);
};
exports.getMetaDatabaseUrl = getMetaDatabaseUrl;
const getDataDatabaseUrl = (env = process.env) => {
    for (const key of DATA_DATABASE_ENV_KEYS) {
        const value = env[key];
        if (value) {
            return value;
        }
    }
    throw new Error(`Missing data database url (${DATA_DATABASE_ENV_KEYS.join(', ')})`);
};
exports.getDataDatabaseUrl = getDataDatabaseUrl;
const isSharedMetaDataDatabase = (env = process.env) => (0, exports.getMetaDatabaseUrl)(env) === (0, exports.getDataDatabaseUrl)(env);
exports.isSharedMetaDataDatabase = isSharedMetaDataDatabase;
