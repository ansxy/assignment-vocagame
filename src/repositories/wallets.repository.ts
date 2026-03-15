import { WalletModel } from "../../database/models/wallet.model";
import { BaseRepository } from "./base.repository";

export interface IWalletsRepository {
    findAllWalletsByUserID(userId: number): Promise<WalletModel[]>;
}

export class WalletsRepository extends BaseRepository<WalletModel> implements IWalletsRepository {
    constructor() {
        super(WalletModel);
    }

    async findAllWalletsByUserID(userId: number): Promise<WalletModel[]> {
        const { Op } = this.ormProvider;

        return this.findAll({
            where: {
                user_id: {
                    [Op.eq]: userId,
                }
            }
        });
    }
}