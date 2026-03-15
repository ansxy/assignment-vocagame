export interface createWalletDTO {
    currency: string;   
}

export interface topUpWalletDTO {
    amount: number;
}

export interface transferFundsDTO {
    recipientWalletId: string;
    senderWalletId: string;
    amount: number;
}

export interface transferFundsByUserDTO {
    senderUserId: number;
    recipientUserId: number;
    currency: string;
    amount: number;
}