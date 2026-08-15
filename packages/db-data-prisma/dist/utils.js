"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeoutHttpException = void 0;
const common_1 = require("@nestjs/common");
class TimeoutHttpException extends common_1.HttpException {
    code;
    data;
    constructor() {
        super('Request timeout', common_1.HttpStatus.REQUEST_TIMEOUT);
        this.code = 'request_timeout';
        this.data = {
            localization: {
                i18nKey: 'httpErrors.custom.requestTimeout',
                context: {},
            },
        };
    }
}
exports.TimeoutHttpException = TimeoutHttpException;
