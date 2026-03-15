import { RequestHandler, Router } from 'express';
import Joi from 'joi';

import { validateRequest } from '../middleware/validation';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

export class BaseController {
    private readonly basePath: string;
    private readonly router: Router;
    private readonly controllerMiddleware: RequestHandler[];

    constructor(basePath: string = '', middleware: RequestHandler[] = []) {
        this.basePath = basePath;
        this.router = Router();
        this.controllerMiddleware = middleware;
    }

    public getRouter(): Router {
        return this.router;
    }

    protected addRoute(
        method: HttpMethod,
        path: string,
        handler: RequestHandler,
        middleware: RequestHandler[] = [],
        schema?: Joi.ObjectSchema
    ): void {
        const validationMiddleware = schema ? [validateRequest(schema)] : [];

        this.router[method](
            `${this.basePath}${path}`,
            ...this.controllerMiddleware,
            ...validationMiddleware,
            ...middleware,
            handler
        );
    }
}