import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from 'sequelize';

import { sequelize } from '../../src/database/sql';

export enum WalletLedgerEntryType {
  TRANSFER = 'TRANSFER',
  TOP_UP = 'TOP_UP'
}

export class WalletLedgerModel extends Model<
  InferAttributes<WalletLedgerModel>,
  InferCreationAttributes<WalletLedgerModel>
> {
  declare id: CreationOptional<string>;
  declare transaction_ref: string;
  declare wallet_id: string;
  declare user_id: number;
  declare entry_type: WalletLedgerEntryType;
  declare amount: number;
  declare balance_before: number;
  declare balance_after: number;
  declare note: CreationOptional<string | null>;
}

WalletLedgerModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    transaction_ref: {
      type: DataTypes.UUID,
      allowNull: false
    },
    wallet_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'wallets',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    entry_type: {
      type: DataTypes.ENUM(...Object.values(WalletLedgerEntryType)),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    balance_before: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    balance_after: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false
    },
    note: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'wallet_ledgers',
    modelName: 'WalletLedger',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeUpdate() {
        throw new Error('Wallet ledger is append-only and cannot be updated');
      },
      beforeDestroy() {
        throw new Error('Wallet ledger is append-only and cannot be deleted');
      },
      beforeBulkUpdate() {
        throw new Error('Wallet ledger is append-only and cannot be updated');
      },
      beforeBulkDestroy() {
        throw new Error('Wallet ledger is append-only and cannot be deleted');
      }
    }
  }
);
