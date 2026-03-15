import { NextFunction, Request, Response } from 'express';

import { HttpError } from '../errors/http-error';

export const errorHandler = (
  error: Error,
  _request: Request,
  response: Response,
  _next: NextFunction
) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      error: error.message
    });
    return;
  }

  response.status(500).json({
    error: 'Internal server error'
  });
};