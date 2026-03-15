import { Router } from 'express';

import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';
import { WalletsRepository } from '../repositories/wallets.repository';
import { PATH } from '../shared/constant/common';

const basePath = `/api/${PATH.USER}`;

class UserRoutes {
    private static instance: UserRoutes | null = null;

    private readonly router: Router;

    private constructor() {
        const userRepository   = new UserRepository();
        const walletRepository = new WalletsRepository();
        const userService      = new UserService(userRepository, walletRepository);
        const userController   = new UserController(userService);

        this.router = Router();
        this.router.use(basePath, userController.getRouter());
    }

    public static getRouter(): Router {
        if (!this.instance) {
            this.instance = new UserRoutes();
        }

        return this.instance.router;
    }
}

export const registerUserRoutes = () => UserRoutes.getRouter();
