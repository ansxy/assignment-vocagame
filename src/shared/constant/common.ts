export const SUPPORTED_REGIONS = {
    'ID': {
        code: 'ID',
        name: 'Indonesia',
        currencey: 'IDR',
        timezone: 'Asia/Jakarta',
    },
    'US': {
        code: 'US',
        name: 'United States',
        currencey: 'USD',
        timezone: 'America/New_York',
    },
    'SG': {
        code: 'SG',
        name: 'Singapore',
        currencey: 'SGD',
        timezone: 'Asia/Singapore',
    },
    'EU': {
        code: 'EU',
        name: 'European Union',
        currencey: 'EUR',
        timezone: 'Europe/Brussels',
     }
}

export const PATH = {
    USER: 'users',
    WALLET: 'wallets',
}

export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500
}

export const ERROR_MESSAGE = {
    BALANCE_OUT_OF_SYNC: 'Wallet balance is out of sync with latest ledger entry',
    INSUFFICIENT_FUNDS: 'Insufficient funds',
    CURRENCY_MISMATCH: 'Currency mismatch between sender and recipient wallets',
    WALLET_SUSPENDED: 'Wallet is suspended and cannot process this operation',
    INVALID_AMOUNT: 'Amount must be greater than zero',
    SAME_WALLET_TRANSFER: 'Sender and recipient wallets must be different',
    IDEMPOTENCY_KEY_REQUIRED: 'Idempotency-Key header is required',
    DUPLICATE_REQUEST: 'Duplicate request detected',
    REQUEST_IN_PROGRESS: 'Request with this idempotency key is still in progress'
}