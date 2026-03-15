import { Transaction } from 'sequelize';

import { WalletLedgerEntryType, WalletLedgerModel } from '../../database/models/wallet-ledger.model';
import { BaseRepository } from './base.repository';

export interface CreateTransferLedgerEntriesDTO {
  transactionRef: string;
  senderWalletId: string;
  senderUserId: number;
  recipientWalletId: string;
  recipientUserId: number;
  amount: number;
  senderBalanceBefore: number;
  senderBalanceAfter: number;
  recipientBalanceBefore: number;
  recipientBalanceAfter: number;
}

export interface IWalletLedgerRepository {
  createTransferEntries(
    payload: CreateTransferLedgerEntriesDTO,
    transaction: Transaction
  ): Promise<WalletLedgerModel[]>;

  createTopUpEntry(
    payload: {
      transactionRef: string;
      walletId: string;
      userId: number;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
    },
    transaction: Transaction
  ): Promise<WalletLedgerModel>;
}

export class WalletLedgerRepository
  extends BaseRepository<WalletLedgerModel>
  implements IWalletLedgerRepository
{
  constructor() {
    super(WalletLedgerModel);
  }

  async createTransferEntries(
    payload: CreateTransferLedgerEntriesDTO,
    transaction: Transaction
  ): Promise<WalletLedgerModel[]> {
    return this.model.bulkCreate(
      [
        {
          transaction_ref: payload.transactionRef,
          wallet_id: payload.senderWalletId,
          user_id: payload.senderUserId,
          entry_type: WalletLedgerEntryType.TRANSFER,
          amount: payload.amount,
          balance_before: payload.senderBalanceBefore,
          balance_after: payload.senderBalanceAfter,
          note: `Transfer to wallet ${payload.recipientWalletId}`
        },
        {
          transaction_ref: payload.transactionRef,
          wallet_id: payload.recipientWalletId,
          user_id: payload.recipientUserId,
          entry_type: WalletLedgerEntryType.TRANSFER,
          amount: payload.amount,
          balance_before: payload.recipientBalanceBefore,
          balance_after: payload.recipientBalanceAfter,
          note: `Transfer from wallet ${payload.senderWalletId}`
        }
      ],
      { transaction }
    );
  }

  async createTopUpEntry(
    payload: {
      transactionRef: string;
      walletId: string;
      userId: number;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
    },
    transaction: Transaction
  ): Promise<WalletLedgerModel> {
    return this.model.create(
      {
        transaction_ref: payload.transactionRef,
        wallet_id: payload.walletId,
        user_id: payload.userId,
        entry_type: WalletLedgerEntryType.TOP_UP,
        amount: payload.amount,
        balance_before: payload.balanceBefore,
        balance_after: payload.balanceAfter,
        note: 'Wallet top up'
      },
      { transaction }
    );
  }

  async updateById(): Promise<never> {
    throw new Error('Wallet ledger is append-only and cannot be updated');
  }

  async deleteById(): Promise<never> {
    throw new Error('Wallet ledger is append-only and cannot be deleted');
  }
}
