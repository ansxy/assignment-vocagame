import { NextFunction, Request, Response, RequestHandler } from 'express';
import Joi from "joi";


const schemeValidate = (schema: Joi.ObjectSchema, data: any): any => {
    return schema.validateAsync(data).catch((error) => {
        throw new Error(error.details[0].message);
    });
}

export const validateRequest = (schema: Joi.ObjectSchema): any => (req: Request, res: Response, next: NextFunction): RequestHandler => {
    const { query , params, body } = req;

    return schemeValidate(schema, { query, params, body }).then((
        validate: any
    ): void => {
        req.query = validate.query;
        req.params = validate.params;
        req.body = validate.body;

        next();
    }).catch((error: Error) => {
        res.status(400).json({
            error: error.message
        });
    });
}