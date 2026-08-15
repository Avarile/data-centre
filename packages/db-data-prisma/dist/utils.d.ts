import { HttpException } from '@nestjs/common';
export declare class TimeoutHttpException extends HttpException {
    code: string;
    data?: {
        localization?: {
            i18nKey: string;
            context?: Record<string, unknown>;
        };
    };
    constructor();
}
