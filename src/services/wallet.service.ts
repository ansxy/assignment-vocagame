import { randomUUID } from 'crypto';

import Decimal from 'decimal.js';
import { Transaction } from 'sequelize';

import { runIdempotent } from '../shared/idempotency/redis-idempotency';
import { SQLInstance } from '../database/sql';
import { UserRepository } from '../repositories/user.repository';
import { WalletLedgerRepository } from '../repositories/wallet-ledger.repository';
import { WalletsRepository } from '../repositories/wallets.repository';
import { transferFundsByUserDTO, transferFundsDTO } from '../types/wallets';
import { BadRequestError } from '../shared/errors/http-error';
import { ERROR_MESSAGE } from '../shared/constant/common';
import { WalletModel, WalletStatus } from '../../database/models/wallet.model';
export interface IWalletService {
    transferFunds(payload: transferFundsDTO, idempotencyKey: string): Promise<void>;
    transferFundsByUser(payload: transferFundsByUserDTO, idempotencyKey: string): Promise<void>;
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

    private toMoneyDecimal(value: number | string): Decimal {
        return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    async create(userId: number, currency: string): Promise<void> {
        const user = await this.userRepository.findOneWithItems({ id: userId });
        if (!user) {
            throw new BadRequestError('User not found');
        }

        const normalizedCurrency = currency.trim().toUpperCase();
        
        if (user.wallets.some((w) => w.currency.toUpperCase() === normalizedCurrency)) {
            throw new BadRequestError('User already has a wallet with this currency');
        }

        try {
            await this.walletRepository.create({
                user_id: userId,
                currency: normalizedCurrency,
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
        const amountDecimal = this.toMoneyDecimal(amount);

        if (amountDecimal.lte(0)) {
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

                if (wallet.status === WalletStatus.SUSPENDED) {
                    throw new BadRequestError(ERROR_MESSAGE.WALLET_SUSPENDED);
                }

            await this.checkLatestLedgerEntryIsInSync(wallet.id, wallet.balance as unknown as string | number, transaction);

            const balanceBefore = this.toMoneyDecimal(wallet.balance as unknown as string | number);
            if (balanceBefore.lt(amountDecimal)) {
                throw new BadRequestError(ERROR_MESSAGE.INSUFFICIENT_FUNDS);
            }
            const balanceAfter = balanceBefore.minus(amountDecimal);

            wallet.balance = Number(balanceAfter.toFixed(2));
            await wallet.save({ transaction });

            await this.walletLedgerRepository.createTopUpEntry(
                {
                    transactionRef: randomUUID(),
                    walletId: wallet.id,
                    userId: wallet.user_id,
                    amount: Number(amountDecimal.negated().toFixed(2)),
                    balanceBefore: Number(balanceBefore.toFixed(2)),
                    balanceAfter: Number(balanceAfter.toFixed(2))
                },
                transaction
            );
        })}, { onDuplicate: 'ignore' });
    }

    async addFundsToWallet(userId: number, walletId: string, amount: number, idempotencyKey: string): Promise<void> {
        const amountDecimal = this.toMoneyDecimal(amount);

        if (amountDecimal.lte(0)) {
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

                if (wallet.status === WalletStatus.SUSPENDED) {
                    throw new BadRequestError(ERROR_MESSAGE.WALLET_SUSPENDED);
                }

                await this.checkLatestLedgerEntryIsInSync(wallet.id, wallet.balance as unknown as string | number, transaction);

                const balanceBefore = this.toMoneyDecimal(wallet.balance as unknown as string | number);
                const balanceAfter = balanceBefore.plus(amountDecimal);

                wallet.balance = Number(balanceAfter.toFixed(2));
                await wallet.save({ transaction });

                await this.walletLedgerRepository.createTopUpEntry(
                    {
                        transactionRef: randomUUID(),
                        walletId: wallet.id,
                        userId: wallet.user_id,
                        amount: Number(amountDecimal.toFixed(2)),
                        balanceBefore: Number(balanceBefore.toFixed(2)),
                        balanceAfter: Number(balanceAfter.toFixed(2))
                    },
                    transaction
                );
            });
        }, { onDuplicate: 'ignore' });
    }

    private checkLatestLedgerEntryIsInSync = async (walletId: string, currentBalance: number | string, transaction: Transaction): Promise<void> => {
        const ledgerEntries = await this.walletLedgerRepository.findAll({
            where: {
                wallet_id: walletId
            }, 
            order: [['created_at', 'ASC'], ['id', 'ASC']],
            transaction
        });

        if (ledgerEntries.length === 0) {
            return;
        }

        let runningBalance = this.toMoneyDecimal(ledgerEntries[0].balance_before as unknown as string | number);

        for (const entry of ledgerEntries) {
            const entryBalanceBefore = this.toMoneyDecimal(entry.balance_before as unknown as string | number);
            const entryAmount = this.toMoneyDecimal(entry.amount as unknown as string | number);
            const entryBalanceAfter = this.toMoneyDecimal(entry.balance_after as unknown as string | number);

            if (!entryBalanceBefore.eq(runningBalance)) {
                throw new BadRequestError(ERROR_MESSAGE.BALANCE_OUT_OF_SYNC);
            }

            const computedBalanceAfter = runningBalance.plus(entryAmount);
            if (!computedBalanceAfter.eq(entryBalanceAfter)) {
                throw new BadRequestError(ERROR_MESSAGE.BALANCE_OUT_OF_SYNC);
            }

            runningBalance = entryBalanceAfter;
        }

        const currentWalletBalance = this.toMoneyDecimal(currentBalance);

        if (!runningBalance.eq(currentWalletBalance)) {
            throw new BadRequestError(ERROR_MESSAGE.BALANCE_OUT_OF_SYNC);
        }
    }

    async transferFunds(payload: transferFundsDTO, idempotencyKey: string): Promise<void> {
        const { recipientWalletId, senderWalletId, amount } = payload;

        const amountDecimal = this.toMoneyDecimal(amount);

        if (amountDecimal.lte(0)) {
            throw new BadRequestError(ERROR_MESSAGE.INVALID_AMOUNT);
        }

        if (senderWalletId === recipientWalletId) {
            throw new BadRequestError(ERROR_MESSAGE.SAME_WALLET_TRANSFER);
        }

        await runIdempotent(`wallet:transfer:${senderWalletId}:${recipientWalletId}`, idempotencyKey, async () => {
            // Managed transaction: auto-commits on success, auto-rolls back on any thrown error
            await SQLInstance.getContext().transaction(async (transaction) => {
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

                if (senderWallet.status === WalletStatus.SUSPENDED || recipientWallet.status === WalletStatus.SUSPENDED) {
                    throw new BadRequestError(ERROR_MESSAGE.WALLET_SUSPENDED);
                }

                if (senderWallet.currency !== recipientWallet.currency) {
                    throw new BadRequestError(ERROR_MESSAGE.CURRENCY_MISMATCH);
                }

                await Promise.all([
                    this.checkLatestLedgerEntryIsInSync(senderWalletId, senderWallet.balance as unknown as string | number, transaction),
                    this.checkLatestLedgerEntryIsInSync(recipientWalletId, recipientWallet.balance as unknown as string | number, transaction)
                ]);

                const senderBalanceBefore = this.toMoneyDecimal(senderWallet.balance as unknown as string | number);
                const recipientBalanceBefore = this.toMoneyDecimal(recipientWallet.balance as unknown as string | number);

                if (senderBalanceBefore.lt(amountDecimal)) {
                    throw new BadRequestError(ERROR_MESSAGE.INSUFFICIENT_FUNDS);
                }

                const senderBalanceAfter = senderBalanceBefore.minus(amountDecimal);
                const recipientBalanceAfter = recipientBalanceBefore.plus(amountDecimal);

                senderWallet.balance = Number(senderBalanceAfter.toFixed(2));
                recipientWallet.balance = Number(recipientBalanceAfter.toFixed(2));

                await senderWallet.save({ transaction });
                await recipientWallet.save({ transaction });

                await this.walletLedgerRepository.createTransferEntries(
                    {
                        transactionRef: randomUUID(),
                        senderWalletId: senderWallet.id,
                        senderUserId: senderWallet.user_id,
                        recipientWalletId: recipientWallet.id,
                        recipientUserId: recipientWallet.user_id,
                        amount: Number(amountDecimal.toFixed(2)),
                        senderBalanceBefore: Number(senderBalanceBefore.toFixed(2)),
                        senderBalanceAfter: Number(senderBalanceAfter.toFixed(2)),
                        recipientBalanceBefore: Number(recipientBalanceBefore.toFixed(2)),
                        recipientBalanceAfter: Number(recipientBalanceAfter.toFixed(2))
                    },
                    transaction
                );
            });
        });
    }

    async transferFundsByUser(payload: transferFundsByUserDTO, idempotencyKey: string): Promise<void> {
        const { senderUserId, recipientUserId, currency, amount } = payload;
        const normalizedCurrency = currency.trim().toUpperCase();

        const [senderWallet, recipientWallet] = await Promise.all([
            this.walletRepository.findOne({
                where: {
                    user_id: senderUserId,
                    currency: normalizedCurrency
                }
            }),
            this.walletRepository.findOne({
                where: {
                    user_id: recipientUserId,
                    currency: normalizedCurrency
                }
            })
        ]);

        if (!senderWallet || !recipientWallet) {
            throw new BadRequestError('Sender or recipient does not have wallet with requested currency');
        }

        await this.transferFunds(
            {
                senderWalletId: senderWallet.id,
                recipientWalletId: recipientWallet.id,
                amount
            },
            idempotencyKey
        );
    }

    async getById(walletId: string):Promise<WalletModel|null> {
        const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
        if (!wallet) {
            throw new BadRequestError('Wallet not found');
        }

        return wallet;
    }
}