"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DataPrismaService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataPrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const nanoid_1 = require("nanoid");
const database_url_1 = require("./database-url");
const utils_1 = require("./utils");
function proxyClient(tx) {
    return new Proxy(tx, {
        get(target, p) {
            if (p === '$queryRawUnsafe' || p === '$executeRawUnsafe') {
                return async function (query, ...args) {
                    try {
                        return await target[p](query, ...args);
                    }
                    catch (e) {
                        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2028') {
                            throw new utils_1.TimeoutHttpException();
                        }
                        throw e;
                    }
                };
            }
            return target[p];
        },
    });
}
let DataPrismaService = DataPrismaService_1 = class DataPrismaService extends client_1.PrismaClient {
    cls;
    logger = new common_1.Logger(DataPrismaService_1.name);
    sharedMetaDataDatabase = (0, database_url_1.isSharedMetaDataDatabase)();
    afterTxCb;
    defaultTxTimeout = Number(process.env.PRISMA_TRANSACTION_TIMEOUT ?? 5000);
    defaultTxMaxWait = Number(process.env.PRISMA_TRANSACTION_MAX_WAIT ?? 2000);
    constructor(cls) {
        const logConfig = {
            log: [
                {
                    level: 'error',
                    emit: 'stdout',
                },
            ],
        };
        const initialConfig = process.env.NODE_ENV === 'production' ? {} : { ...logConfig };
        super({
            ...initialConfig,
            datasources: {
                db: {
                    url: (0, database_url_1.getDataDatabaseUrl)(),
                },
            },
        });
        this.cls = cls;
        console.log(`[data PrismaService] Transaction defaults: timeout=${this.defaultTxTimeout}ms, maxWait=${this.defaultTxMaxWait}ms (from env: PRISMA_TRANSACTION_TIMEOUT=${process.env.PRISMA_TRANSACTION_TIMEOUT}, PRISMA_TRANSACTION_MAX_WAIT=${process.env.PRISMA_TRANSACTION_MAX_WAIT})`);
    }
    bindAfterTransaction(fn) {
        this.afterTxCb = fn;
    }
    getMetaTxClient() {
        if (!this.sharedMetaDataDatabase) {
            return;
        }
        return this.cls.get('tx.client');
    }
    async $tx(fn, options) {
        let result = undefined;
        const txClient = this.cls.get('dataTx.client');
        if (txClient) {
            return await fn(txClient);
        }
        const metaTxClient = this.getMetaTxClient();
        if (metaTxClient) {
            return await fn(metaTxClient);
        }
        const txOptions = {
            timeout: options?.timeout ?? this.defaultTxTimeout,
            maxWait: options?.maxWait ?? this.defaultTxMaxWait,
            ...(options?.isolationLevel && { isolationLevel: options.isolationLevel }),
        };
        await this.cls.runWith(this.cls.get(), async () => {
            result = await super.$transaction(async (prisma) => {
                prisma = proxyClient(prisma);
                this.cls.set('dataTx.client', prisma);
                this.cls.set('dataTx.id', (0, nanoid_1.nanoid)());
                this.cls.set('dataTx.timeStr', new Date().toISOString());
                try {
                    return await fn(prisma);
                }
                finally {
                    this.cls.set('dataTx.client', undefined);
                    this.cls.set('dataTx.id', undefined);
                    this.cls.set('dataTx.timeStr', undefined);
                }
            }, txOptions);
            this.afterTxCb?.();
        });
        return result;
    }
    txClient() {
        const txClient = this.cls.get('dataTx.client');
        if (txClient) {
            return txClient;
        }
        const metaTxClient = this.getMetaTxClient();
        if (metaTxClient) {
            return metaTxClient;
        }
        return this;
    }
    async onModuleInit() {
        await this.$connect();
        if (process.env.NODE_ENV === 'production')
            return;
        this.$on('query', async (e) => {
            this.logger.debug({
                Query: e.query,
                Params: e.params,
                Duration: `${e.duration} ms`,
            });
        });
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
};
exports.DataPrismaService = DataPrismaService;
exports.DataPrismaService = DataPrismaService = DataPrismaService_1 = __decorate([
    (0, common_1.Injectable)()
], DataPrismaService);
