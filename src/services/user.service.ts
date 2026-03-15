import { UserModel } from '../../database/models/user.model';
import { UserRepository } from '../repositories/user.repository';
import { WalletsRepository } from '../repositories/wallets.repository';
import { HttpError } from '../shared/errors/http-error';
import { User } from '../types/user';

export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly walletRepository: WalletsRepository
  ) {}

  async getUsers(): Promise<User[]> {
    const users = await this.userRepository.findAll();

    return users.map((user) => this.toUser(user));
  }

  async getUserById(id: number): Promise<UserModel> {
    const user = await this.userRepository.findOneWithItems({id});

    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    return user 
  }

  async getUserWallets(userId: number) {
    const user = await this.userRepository.findOneOrFail({
      where: { id: userId }
    })
  }


  private toUser(user: {
    id: number;
    name: string;
    email: string;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
  }): User {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.createdAt?.toISOString() ?? '',
      updated_at: user.updatedAt?.toISOString() ?? '',
      deleted_at: user.deletedAt?.toISOString() ?? null
    };
  }
}