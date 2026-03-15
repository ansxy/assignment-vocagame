import { UserModel } from '../../database/models/user.model';
import { WalletModel } from '../../database/models/wallet.model';
import { UserWithDetails } from '../models/user';

import { BaseRepository } from './base.repository';

export interface IUserRepository {
  findByEmail(email: string): Promise<UserModel | null>;
  findOneWithItems(options: Record<any, any>): Promise<UserWithDetails | null>;
}


export class UserRepository extends BaseRepository<UserModel> implements IUserRepository {
  constructor() {
    super();
  }

  async findByEmail(email: string): Promise<UserModel | null> {
    return this.findOne({
      where: { email }
    });
  }

  async findOneWithItems(options: Record<any,any>): Promise<UserWithDetails | null> {
    return this.model.findOne({
      where: options,
      include: [
        {
          model: WalletModel,
          as: 'wallets',
          required: false
        }
      ]
    })
    .then((user: any) => {
      if (!user) return null;
      // Ensure wallets is always present (even if empty)
      const wallets = user.wallets ?? [];
      return { ...user.toJSON(), wallets } as UserWithDetails;
    })
    .catch((error) => {
      console.error('Error fetching user with items:', error);
      throw error;
    });
  }
}