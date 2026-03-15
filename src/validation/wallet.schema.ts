import Joi from 'joi';

import { WalletStatus } from '../../database/models/wallet.model';

export const transferFundsSchema = Joi.object({
    params: Joi.object(),
    query:  Joi.object(),
    body: Joi.object({
        sender_wallet_id:    Joi.string().uuid().required(),
        recipient_wallet_id: Joi.string().uuid().required(),
        amount:              Joi.number().positive().precision(2).required()
    }).required()
});

export const createWalletSchema = Joi.object({
    params: Joi.object({
        userId: Joi.number().integer().positive().required()
    }).required(),
    query: Joi.object(),
    body: Joi.object({
        currency: Joi.string().length(3).uppercase().required()
    }).required()
});

export const addFundsSchema = Joi.object({
    params: Joi.object({
        userId: Joi.number().integer().positive().required()
    }).required(),
    query: Joi.object(),
    body: Joi.object({
        wallet_id: Joi.string().uuid().required(),
        amount:    Joi.number().positive().precision(2).required()
    }).required()
});

export const paySchema = Joi.object({
    params: Joi.object({
        userId: Joi.number().integer().positive().required()
    }).required(),
    query: Joi.object(),
    body: Joi.object({
        wallet_id: Joi.string().uuid().required(),
        amount:    Joi.number().positive().precision(2).required()
    }).required()
});

export const updateStatusSchema = Joi.object({
    params: Joi.object({
        walletId: Joi.string().uuid().required()
    }).required(),
    query: Joi.object(),
    body: Joi.object({
        status: Joi.string().valid(...Object.values(WalletStatus)).required()
    }).required()
});
