import { WalletModel } from "../../database/models/wallet.model";

export interface UserModel {
    id: number;
    name: string;
    email: string;
}

export interface UserWithDetails extends UserModel {
    wallets: WalletModel[];
}