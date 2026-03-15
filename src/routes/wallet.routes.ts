import { Router } from 'express';

import { WalletController } from '../controllers/wallet.controller';
import { WalletService } from '../services/wallet.service';
import { UserRepository } from '../repositories/user.repository';
import { WalletsRepository } from '../repositories/wallets.repository';
import { PATH } from '../shared/constant/common';

const basePath = `/api/${PATH.WALLET}`;

class WalletRoutes {
    private static instance: WalletRoutes | null = null;

    private readonly router: Router;

    private constructor() {
        const userRepository   = new UserRepository();
        const walletRepository = new WalletsRepository();
        const walletService    = new WalletService(userRepository, walletRepository);
        const walletController = new WalletController(walletService);

        this.router = Router();
        this.router.use(basePath, walletController.getRouter());
    }

    public static getRouter(): Router {
        if (!this.instance) {
            this.instance = new WalletRoutes();
        }

        return this.instance.router;
    }
}

export const registerWalletRoutes = () => WalletRoutes.getRouter();
