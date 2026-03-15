import { Request, Response, NextFunction, RequestHandler } from 'express';

import { BaseController } from './base.controller';
import { WalletService } from '../services/wallet.service';
import { WalletStatus } from '../../database/models/wallet.model';
import { HttpError } from '../shared/errors/http-error';
import {
    transferFundsSchema,
    transferFundsByUserSchema,
    createWalletSchema,
    addFundsSchema,
    paySchema,
    updateStatusSchema
} from '../validation/wallet.schema';

type WalletByIdRequest      = Request<{ walletId: string }>;
type AddFundsRequest        = Request<{ userId: string }, any, { wallet_id: string; amount: number }>;
type TransferFundsRequest   = Request<any, any, {
    sender_wallet_id:    string;
    recipient_wallet_id: string;
    amount:              number;
}>;
type TransferFundsByUserRequest = Request<any, any, {
    sender_user_id: number;
    recipient_user_id: number;
    currency: string;
    amount: number;
}>;
type CreateWalletRequest    = Request<{ userId: string }, any, { currency: string }>;
type UpdateStatusRequest    = Request<{ walletId: string }, any, { status: WalletStatus }>;
type PayRequest             = Request<{ userId: string }, any, { wallet_id: string; amount: number }>;

export class WalletController extends BaseController {
    constructor(private readonly walletService: WalletService) {
        super();

        this.addRoute('post',   '/transfer',              this.transferFunds    as RequestHandler, [], transferFundsSchema);
        this.addRoute('post',   '/transfer/by-user',      this.transferFundsByUser as RequestHandler, [], transferFundsByUserSchema);
        this.addRoute('post',   '/users/:userId/wallets', this.createWallet     as RequestHandler, [], createWalletSchema);
        this.addRoute('post',   '/users/:userId/topup',   this.addFundsToWallet as RequestHandler, [], addFundsSchema);
        this.addRoute('post',   '/users/:userId/pay',     this.pay              as RequestHandler, [], paySchema);
        this.addRoute('get',    '/:walletId',             this.getWalletById    as RequestHandler);
        this.addRoute('patch',  '/:walletId/status',      this.updateStatus     as RequestHandler, [], updateStatusSchema);
    }

    private transferFunds = async (request: TransferFundsRequest, response: Response, next: NextFunction) => {
        try {
            const { sender_wallet_id, recipient_wallet_id, amount } = request.body;
            const idempotencyKey = request.header('Idempotency-Key') ?? '';

            await this.walletService.transferFunds(
                { senderWalletId: sender_wallet_id, recipientWalletId: recipient_wallet_id, amount },
                idempotencyKey
            );

            response.status(200).json({ message: 'Funds transferred successfully' });
        } catch (error) {
            next(error);
        }
    };

    private transferFundsByUser = async (request: TransferFundsByUserRequest, response: Response, next: NextFunction) => {
        try {
            const { sender_user_id, recipient_user_id, currency, amount } = request.body;
            const idempotencyKey = request.header('Idempotency-Key') ?? '';

            await this.walletService.transferFundsByUser(
                {
                    senderUserId: sender_user_id,
                    recipientUserId: recipient_user_id,
                    currency,
                    amount
                },
                idempotencyKey
            );

            response.status(200).json({ message: 'Funds transferred successfully' });
        } catch (error) {
            next(error);
        }
    };

    private createWallet = async (request: CreateWalletRequest, response: Response, next: NextFunction) => {
        try {
            const userId = Number(request.params.userId);

            if (Number.isNaN(userId) || userId <= 0) {
                throw new HttpError(400, 'Invalid user id');
            }

            const { currency } = request.body;
            await this.walletService.create(userId, currency);

            response.status(201).json({ message: 'Wallet created successfully' });
        } catch (error) {
            next(error);
        }
    };

    private addFundsToWallet = async (request: AddFundsRequest, response: Response, next: NextFunction) => {
        try {
            const userId = Number(request.params.userId);

            if (Number.isNaN(userId) || userId <= 0) {
                throw new HttpError(400, 'Invalid user id');
            }

            const { wallet_id, amount } = request.body;
            const idempotencyKey = request.header('Idempotency-Key') ?? '';

            await this.walletService.addFundsToWallet(userId, wallet_id, amount, idempotencyKey);

            response.status(200).json({ message: 'Funds added successfully' });
        } catch (error) {
            next(error);
        }
    };

    private pay = async (request: PayRequest, response: Response, next: NextFunction) => {
        try {
            const userId = Number(request.params.userId);

            if (Number.isNaN(userId) || userId <= 0) {
                throw new HttpError(400, 'Invalid user id');
            }

            const { wallet_id, amount } = request.body;
            const idempotencyKey = request.header('Idempotency-Key') ?? '';

            await this.walletService.pay(userId, wallet_id, amount, idempotencyKey);

            response.status(200).json({ message: 'Payment processed successfully' });
        } catch (error) {
            next(error);
        }
    };

    private getWalletById = async (request: WalletByIdRequest, response: Response, next: NextFunction) => {
        try {
            const { walletId } = request.params;
            const wallet = await this.walletService.getById(walletId);

            if (!wallet) {
                throw new HttpError(404, 'Wallet not found');
            }

            response.status(200).json({ data: wallet });
        } catch (error) {
            next(error);
        }
    };

    private updateStatus = async (request: UpdateStatusRequest, response: Response, next: NextFunction) => {
        try {
            const { walletId } = request.params;
            const { status } = request.body;

            await this.walletService.updateStatus(walletId, status);

            response.status(200).json({ message: 'Wallet status updated successfully' });
        } catch (error) {
            next(error);
        }
    };
}
