import { Request, Response, NextFunction, RequestHandler } from 'express';

import { BaseController } from './base.controller';
import { UserService } from '../services/user.service';
import { HttpError } from '../shared/errors/http-error';

type UserByIdRequest = Request<{ id: string }>;

export class UserController extends BaseController {
    constructor(private readonly userService: UserService) {
        super();

        this.addRoute('get', '/',    this.getUsers);
        this.addRoute('get', '/:id', this.getUserById as RequestHandler);
    }

    private getUsers = async (_request: Request, response: Response, next: NextFunction) => {
        try {
            const users = await this.userService.getUsers();
            response.status(200).json({ data: users });
        } catch (error) {
            next(error);
        }
    };

    private getUserById = async (request: UserByIdRequest, response: Response, next: NextFunction) => {
        try {
            const userId = Number(request.params.id);

            if (Number.isNaN(userId) || userId <= 0) {
                throw new HttpError(400, 'Invalid user id');
            }

            const user = await this.userService.getUserById(userId);
            response.status(200).json({ data: user });
        } catch (error) {
            next(error);
        }
    };
}