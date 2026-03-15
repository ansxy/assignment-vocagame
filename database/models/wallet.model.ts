import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from '../../src/database/sql';

export enum WalletStatus {
    ACTIVE = 'active',
    SUSPENDED = 'suspended',
}

export class WalletModel extends Model<InferAttributes<WalletModel>,InferCreationAttributes<WalletModel>> {
    declare id: CreationOptional<string>;
    declare user_id: number;
    declare balance: number;
    declare status: WalletStatus;
    declare currency: string;
}

WalletModel.init({
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    balance: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    status: {
        type: DataTypes.ENUM(...Object.values(WalletStatus)),
        allowNull: false,
        defaultValue: WalletStatus.ACTIVE
    },
    currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
    }
}, {
    sequelize,
    tableName: 'wallets',
    modelName: 'Wallet',
    timestamps: true,
    underscored: true
})