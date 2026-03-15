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