import { randomUUID } from 'crypto';

import { Transaction } from 'sequelize';

import { runIdempotent } from '../shared/idempotency/redis-idempotency';
import { SQLInstance } from '../database/sql';
import { UserRepository } from '../repositories/user.repository';
import { WalletLedgerRepository } from '../repositories/wallet-ledger.repository';
import { WalletsRepository } from '../repositories/wallets.repository';
import { transferFundsDTO } from '../types/wallets';
import { BadRequestError } from '../shared/errors/http-error';
import { ERROR_MESSAGE } from '../shared/constant/common';
import { WalletModel, WalletStatus } from '../../database/models/wallet.model';
export interface IWalletService {
    transferFunds(payload: transferFundsDTO, idempotencyKey: string): Promise<void>;
    addFundsToWallet(userId: number, walletId: string, amount: number, idempotencyKey: string): Promise<void>;
    create(userId: number, currency: string): Promise<void>;
    updateStatus(walletId: string, status: WalletStatus): Promise<void>;
    getById(walletId: string):Promise<WalletModel|null>;
    pay(userId: number, walletId: string, amount: number, idempotencyKey: string): Promise<void>;
}

export class WalletService implements IWalletService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly walletRepository: WalletsRepository,
        private readonly walletLedgerRepository: WalletLedgerRepository = new WalletLedgerRepository()
    ) {}

    async create(userId: number, currency: string): Promise<void> {
        const user = await this.userRepository.findOneWithItems({ id: userId });
        if (!user) {
            throw new BadRequestError('User not found');
        }
        
        if (user.wallets.some(w => w.currency === currency)) {
            throw new BadRequestError('User already has a wallet with this currency');
        }

        try {
            await this.walletRepository.create({
                user_id: userId,
                currency,
                balance: 0.00
            } as any);
        } catch (error) {
            console.error('Error creating wallet:', error);
            throw new BadRequestError('Failed to create wallet');
        }
    }

    async updateStatus(walletId: string, status: WalletStatus): Promise<void> {
        const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
        if (!wallet) {
            throw new BadRequestError('Wallet not found');
        }

        wallet.status = status;
        await wallet.save();
    }

    async pay(userId: number, walletId: string, amount: number, idempotencyKey: string): Promise<void> {
        if (amount <= 0) {
            throw new BadRequestError(ERROR_MESSAGE.INVALID_AMOUNT);
        }

        await runIdempotent(`wallet:pay:${walletId}`, idempotencyKey, async () => {
            await SQLInstance.getContext().transaction(async (transaction) => {
            const wallet = await this.walletRepository.findOneOrFail({
                where: { id: walletId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
                if (wallet.user_id !== userId) {
                    throw new BadRequestError('Unauthorized');
                }
            await this.checkLatestLedgerEntryIsInSync(wallet.id, Number(wallet.balance), transaction);

            const balanceBefore = Number(wallet.balance);
            if (balanceBefore < amount) {
                throw new BadRequestError(ERROR_MESSAGE.INSUFFICIENT_FUNDS);
            }
            const balanceAfter = balanceBefore - amount;

            wallet.balance = balanceAfter;
            await wallet.save({ transaction });

            await this.walletLedgerRepository.createTopUpEntry(
                {
                    transactionRef: randomUUID(),
                    walletId: wallet.id,
                    userId: wallet.user_id,
                    amount: -amount,
                    balanceBefore,
                    balanceAfter
                },
                transaction
            );
        })});
    }

    async addFundsToWallet(userId: number, walletId: string, amount: number, idempotencyKey: string): Promise<void> {
        if (amount <= 0) {
            throw new BadRequestError(ERROR_MESSAGE.INVALID_AMOUNT);
        }

        await runIdempotent(`wallet:add-funds:${walletId}`, idempotencyKey, async () => {
            // Managed transaction: auto-commits on success, auto-rolls back on any thrown error
            await SQLInstance.getContext().transaction(async (transaction) => {
                const wallet = await this.walletRepository.findOneOrFail({
                    where: { id: walletId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });

                if (wallet.user_id !== userId) {
                    throw new BadRequestError('Unauthorized');
                }

                await this.checkLatestLedgerEntryIsInSync(wallet.id, Number(wallet.balance), transaction);

                const balanceBefore = Number(wallet.balance);
                const balanceAfter = balanceBefore + amount;

                wallet.balance = balanceAfter;
                await wallet.save({ transaction });

                await this.walletLedgerRepository.createTopUpEntry(
                    {
                        transactionRef: randomUUID(),
                        walletId: wallet.id,
                        userId: wallet.user_id,
                        amount,
                        balanceBefore,
                        balanceAfter
                    },
                    transaction
                );
            });
        });
    }

    private checkLatestLedgerEntryIsInSync = async (walletId: string, currentBalance: number, transaction: Transaction): Promise<void> => {
        const latestLedger = await this.walletLedgerRepository.findOne({
            where: {
                wallet_id: walletId
            }, 
            order: [['created_at', 'DESC']],
            transaction
        })
        if (!latestLedger) {
            return;
        }
        if (Number(latestLedger.balance_after) !== currentBalance) {
            throw new BadRequestError(ERROR_MESSAGE.BALANCE_OUT_OF_SYNC);
        }
    }

    async transferFunds(payload: transferFundsDTO, idempotencyKey: string): Promise<void> {
        const { recipientWalletId, senderWalletId, amount } = payload;

        if (amount <= 0) {
            throw new BadRequestError(ERROR_MESSAGE.INVALID_AMOUNT);
        }

        if (senderWalletId === recipientWalletId) {
            throw new BadRequestError(ERROR_MESSAGE.SAME_WALLET_TRANSFER);
        }

        await runIdempotent(`wallet:transfer:${senderWalletId}:${recipientWalletId}`, idempotencyKey, async () => {
            // Managed transaction: auto-commits on success, auto-rolls back on any thrown error
            await SQLInstance.getContext().transaction(async (transaction) => {
                // Acquire FOR UPDATE locks in consistent lexicographic order to prevent
                // deadlocks when two concurrent transfers involve the same wallet pair
                // (e.g. A→B and B→A racing each other)
                const [firstId, secondId] = [senderWalletId, recipientWalletId].sort();

                const first = await this.walletRepository.findOneOrFail({
                    where: { id: firstId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const second = await this.walletRepository.findOneOrFail({
                    where: { id: secondId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });

                const senderWallet    = firstId === senderWalletId ? first : second;
                const recipientWallet = firstId === senderWalletId ? second : first;

                if (senderWallet.currency !== recipientWallet.currency) {
                    throw new BadRequestError(ERROR_MESSAGE.CURRENCY_MISMATCH);
                }

                // Verify both wallets are in sync with their ledger before any mutation
                await Promise.all([
                    this.checkLatestLedgerEntryIsInSync(senderWalletId, Number(senderWallet.balance), transaction),
                    this.checkLatestLedgerEntryIsInSync(recipientWalletId, Number(recipientWallet.balance), transaction)
                ]);

                const senderBalanceBefore    = Number(senderWallet.balance);
                const recipientBalanceBefore = Number(recipientWallet.balance);

                if (senderBalanceBefore < amount) {
                    throw new BadRequestError(ERROR_MESSAGE.INSUFFICIENT_FUNDS);
                }

                const senderBalanceAfter    = senderBalanceBefore - amount;
                const recipientBalanceAfter = recipientBalanceBefore + amount;

                senderWallet.balance    = senderBalanceAfter;
                recipientWallet.balance = recipientBalanceAfter;

                // Debit then credit sequentially — both writes share the same managed
                // transaction so either both land or neither does
                await senderWallet.save({ transaction });
                await recipientWallet.save({ transaction });

                await this.walletLedgerRepository.createTransferEntries(
                    {
                        transactionRef: randomUUID(),
                        senderWalletId: senderWallet.id,
                        senderUserId: senderWallet.user_id,
                        recipientWalletId: recipientWallet.id,
                        recipientUserId: recipientWallet.user_id,
                        amount,
                        senderBalanceBefore,
                        senderBalanceAfter,
                        recipientBalanceBefore,
                        recipientBalanceAfter
                    },
                    transaction
                );
            });
        });
    }

    async getById(walletId: string):Promise<WalletModel|null> {
        const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
        if (!wallet) {
            throw new BadRequestError('Wallet not found');
        }

        return wallet;
    }
}