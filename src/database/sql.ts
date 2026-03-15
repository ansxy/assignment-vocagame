import * as Sequelize from 'sequelize';
import fs from 'fs';
import path from 'path';

import { env } from '../config/env';

type RegisteredModel = Sequelize.ModelStatic<Sequelize.Model>;

interface SQLRuntimeInstance {
  model: Record<string, RegisteredModel>;
  context: Sequelize.Sequelize;
  ORMProvide: typeof Sequelize;
  Transaction: Sequelize.Transaction | null;
}

const opts: Sequelize.Options = {
  dialect: 'postgres',
  define: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
  }
};

export const sequelize = process.env.DATABASE_URL
  ? new Sequelize.Sequelize(process.env.DATABASE_URL, opts)
  : new Sequelize.Sequelize(env.database.name, env.database.username, env.database.password, {
      ...opts,
      host: env.database.host,
      port: env.database.port
    });

export class SQLInstance {
  private static instance: SQLRuntimeInstance | null = null;

  private static setupAssociations(): void {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    const userModel =
      this.instance.model.UserModel ??
      this.instance.model.User;

    const walletModel =
      this.instance.model.WalletModel ??
      this.instance.model.Wallet;

    const walletLedgerModel =
      this.instance.model.WalletLedgerModel ??
      this.instance.model.WalletLedger;

    if (userModel && walletModel) {
      userModel.hasMany(walletModel, { foreignKey: 'user_id', as: 'wallets' });
      walletModel.belongsTo(userModel, { foreignKey: 'user_id', as: 'user' });
    }

    if (walletModel && walletLedgerModel) {
      walletModel.hasMany(walletLedgerModel, { foreignKey: 'wallet_id', as: 'ledgers' });
      walletLedgerModel.belongsTo(walletModel, { foreignKey: 'wallet_id', as: 'wallet' });
    }

    if (userModel && walletLedgerModel) {
      userModel.hasMany(walletLedgerModel, { foreignKey: 'user_id', as: 'wallet_ledgers' });
      walletLedgerModel.belongsTo(userModel, { foreignKey: 'user_id', as: 'user' });
    }
  }

  private static registerAllModels(): void {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    const modelsDirectory = path.resolve(__dirname, '../../database/models');

    const modelFiles = fs.readdirSync(modelsDirectory).filter((fileName: string) => {
      if (fileName.endsWith('.d.ts')) {
        return false;
      }

      return fileName.endsWith('.model.ts') || fileName.endsWith('.model.js');
    });

    modelFiles.forEach((fileName: string) => {
      const modelModule = require(path.join(modelsDirectory, fileName)) as Record<string, unknown>;

      Object.entries(modelModule).forEach(([exportName, exportedValue]) => {
        if (
          typeof exportedValue === 'function' &&
          exportedValue.prototype instanceof Sequelize.Model
        ) {
          const model = exportedValue as unknown as RegisteredModel;

          this.instance!.model[exportName] = model;
          this.instance!.model[model.name] = model;
        }
      });
    });
  }

  public static async initialize(): Promise<void> {
    if (this.instance) {
      return;
    }

    await sequelize.authenticate();

    this.instance = {
      model: {},
      ORMProvide: Sequelize,
      context: sequelize,
      Transaction: null
    };

    this.registerAllModels();
    this.setupAssociations();
  }

  public static registerModel<T extends Sequelize.Model>(
    modelName: string,
    model: Sequelize.ModelStatic<T>
  ): void {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    this.instance.model[modelName] = model;
  }

  public static getModel<T extends Sequelize.Model>(modelName: string): Sequelize.ModelStatic<T> {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    const model = this.instance.model[modelName];

    if (!model) {
      throw new Error(`Model '${modelName}' is not registered.`);
    }

    return model as Sequelize.ModelStatic<T>;
  }

  public static getContext(): Sequelize.Sequelize {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    return this.instance.context;
  }

  public static getORMProvide(): typeof Sequelize {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    return this.instance.ORMProvide;
  }

  public static getTransaction(): Promise<Sequelize.Transaction> {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    return this.instance.context.transaction();
  }

  public static getInstance(): SQLRuntimeInstance {
    if (!this.instance) {
      throw new Error('SQLInstance is not initialized. Call SQLInstance.initialize() first.');
    }

    return this.instance;
  }
}

export const initializeDatabase = async (): Promise<void> => {
  await SQLInstance.initialize();
};