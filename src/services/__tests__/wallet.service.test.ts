// ─── Module mocks (must be declared before any imports) ──────────────────────
//
// The Sequelize model files call Model.init(sequelize, ...) at module-load
// time. In a unit-test environment there is no live DB, so we mock every model
// file with a plain class so that init() is never invoked.

jest.mock('../../../database/models/wallet.model', () => ({
    WalletModel:  class WalletModel  {},
    WalletStatus: { ACTIVE: 'active', SUSPENDED: 'suspended' } as const
}));

jest.mock('../../../database/models/wallet-ledger.model', () => ({
    WalletLedgerModel:     class WalletLedgerModel {},
    WalletLedgerEntryType: { TRANSFER: 'TRANSFER', TOP_UP: 'TOP_UP' } as const
}));

jest.mock('../../../database/models/user.model', () => ({
    UserModel: class UserModel {}
}));

// Provide a stub sequelize export so that BaseRepository getters don't throw.
jest.mock('../../database/sql', () => ({
    sequelize:   {},
    SQLInstance: { getContext: jest.fn(), getORMProvide: jest.fn() }
}));

jest.mock('../../shared/idempotency/redis-idempotency');

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { WalletService } from '../wallet.service';
import { SQLInstance } from '../../database/sql';
import { runIdempotent } from '../../shared/idempotency/redis-idempotency';
import { BadRequestError } from '../../shared/errors/http-error';
import { ERROR_MESSAGE } from '../../shared/constant/common';
import { WalletStatus } from '../../../database/models/wallet.model';
import type { UserRepository } from '../../repositories/user.repository';
import type { WalletsRepository } from '../../repositories/wallets.repository';
import type { WalletLedgerRepository } from '../../repositories/wallet-ledger.repository';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOCK_TRANSACTION = { LOCK: { UPDATE: 'UPDATE' as any } } as any;

/** Make runIdempotent a transparent pass-through (invoke work immediately) */
const setupIdempotentPassthrough = () => {
    (runIdempotent as jest.Mock).mockImplementation(
        async (_scope: string, _key: string, work: () => Promise<void>) => work()
    );
};

/** Make SQLInstance.getContext().transaction() invoke its callback immediately */
const setupManagedTransaction = () => {
    (SQLInstance.getContext as jest.Mock).mockReturnValue({
        transaction: jest.fn().mockImplementation(
            async (fn: (t: typeof MOCK_TRANSACTION) => Promise<void>) => fn(MOCK_TRANSACTION)
        )
    });
};

interface MockWalletOpts {
    id?: string;
    userId?: number;
    currency?: string;
    balance?: number;
    status?: WalletStatus;
}

const makeMockWallet = (opts: MockWalletOpts = {}) => ({
    id:       opts.id       ?? 'aaaaaaaa-0000-0000-0000-000000000001',
    user_id:  opts.userId   ?? 1,
    currency: opts.currency ?? 'IDR',
    balance:  opts.balance  ?? 1000,
    status:   opts.status   ?? WalletStatus.ACTIVE,
    save:     jest.fn().mockResolvedValue(undefined)
});

// ─── Repository mocks ─────────────────────────────────────────────────────────

let mockUserRepository: jest.Mocked<Pick<UserRepository, 'findOne' | 'findOneWithItems'>>;
let mockWalletRepository: jest.Mocked<Pick<WalletsRepository, 'findOne' | 'findOneOrFail' | 'create'>>;
let mockWalletLedgerRepository: jest.Mocked<
    Pick<WalletLedgerRepository, 'findAll' | 'createTopUpEntry' | 'createTransferEntries'>
>;

let service: WalletService;

beforeEach(() => {
    jest.clearAllMocks();

    setupIdempotentPassthrough();
    setupManagedTransaction();

    mockUserRepository = { 
        findOne: jest.fn(),
        findOneWithItems: jest.fn()
    } as any;

    mockWalletRepository = {
        findOne:       jest.fn(),
        findOneOrFail: jest.fn(),
        create:        jest.fn()
    } as any;

    mockWalletLedgerRepository = {
        findAll:               jest.fn().mockResolvedValue([]), // no prior ledger by default
        createTopUpEntry:      jest.fn().mockResolvedValue({}),
        createTransferEntries: jest.fn().mockResolvedValue([{}, {}])
    } as any;

    service = new WalletService(
        mockUserRepository as any,
        mockWalletRepository as any,
        mockWalletLedgerRepository as any
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// addFundsToWallet
// ─────────────────────────────────────────────────────────────────────────────

describe('addFundsToWallet', () => {
    const WALLET_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
    const USER_ID    = 1;
    const IDEM_KEY   = 'idem-add-1';

    it('throws BadRequestError when amount is zero', async () => {
        await expect(
            service.addFundsToWallet(USER_ID, WALLET_ID, 0, IDEM_KEY)
        ).rejects.toThrow(BadRequestError);

        await expect(
            service.addFundsToWallet(USER_ID, WALLET_ID, 0, IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.INVALID_AMOUNT);
    });

    it('throws BadRequestError when amount is negative', async () => {
        await expect(
            service.addFundsToWallet(USER_ID, WALLET_ID, -50, IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.INVALID_AMOUNT);
    });

    it('throws BadRequestError when wallet does not belong to the user', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: 999 }); // different user
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await expect(
            service.addFundsToWallet(USER_ID, WALLET_ID, 100, IDEM_KEY)
        ).rejects.toThrow('Unauthorized');
    });

    it('throws BadRequestError when balance is out of sync with the ledger', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: USER_ID, balance: 1000 });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        // Ledger says balance_after is 500, but wallet.balance is 1000 → out of sync
        mockWalletLedgerRepository.findAll.mockResolvedValue([
            { balance_before: 0, amount: 500, balance_after: 500 }
        ] as any);

        await expect(
            service.addFundsToWallet(USER_ID, WALLET_ID, 100, IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.BALANCE_OUT_OF_SYNC);
    });

    it('credits the wallet balance and writes a ledger entry on success', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: USER_ID, balance: 1000 });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);
        // No prior ledger — sync check passes
        mockWalletLedgerRepository.findAll.mockResolvedValue([]);

        await service.addFundsToWallet(USER_ID, WALLET_ID, 200, IDEM_KEY);

        expect(wallet.balance).toBe(1200);
        expect(wallet.save).toHaveBeenCalledWith({ transaction: MOCK_TRANSACTION });
        expect(mockWalletLedgerRepository.createTopUpEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                walletId:      WALLET_ID,
                userId:        USER_ID,
                amount:        200,
                balanceBefore: 1000,
                balanceAfter:  1200
            }),
            MOCK_TRANSACTION
        );
    });

    it('rounds top-up amount to two decimals (12.345 -> 12.35)', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: USER_ID, balance: 1000 });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await service.addFundsToWallet(USER_ID, WALLET_ID, 12.345, IDEM_KEY);

        expect(wallet.balance).toBe(1012.35);
        expect(mockWalletLedgerRepository.createTopUpEntry).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 12.35, balanceAfter: 1012.35 }),
            MOCK_TRANSACTION
        );
    });

    it('throws when wallet is suspended', async () => {
        const wallet = makeMockWallet({
            id: WALLET_ID,
            userId: USER_ID,
            balance: 1000,
            status: WalletStatus.SUSPENDED
        });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await expect(service.addFundsToWallet(USER_ID, WALLET_ID, 100, IDEM_KEY))
            .rejects.toThrow(ERROR_MESSAGE.WALLET_SUSPENDED);
    });

    it('wraps the work inside runIdempotent with the correct scope', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: USER_ID, balance: 0 });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await service.addFundsToWallet(USER_ID, WALLET_ID, 50, IDEM_KEY);

        expect(runIdempotent).toHaveBeenCalledWith(
            `wallet:add-funds:${WALLET_ID}`,
            IDEM_KEY,
            expect.any(Function),
            { onDuplicate: 'ignore' }
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// transferFunds
// ─────────────────────────────────────────────────────────────────────────────

describe('transferFunds', () => {
    // Use UUIDs where aaa < bbb so sort order is predictable in tests
    const SENDER_ID    = 'aaaaaaaa-0000-0000-0000-000000000001';
    const RECIPIENT_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
    const IDEM_KEY     = 'idem-tx-1';

    const basePayload = () => ({
        senderWalletId:    SENDER_ID,
        recipientWalletId: RECIPIENT_ID,
        amount:            100
    });

    it('throws BadRequestError when amount is zero', async () => {
        await expect(
            service.transferFunds({ ...basePayload(), amount: 0 }, IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.INVALID_AMOUNT);
    });

    it('throws BadRequestError when amount is negative', async () => {
        await expect(
            service.transferFunds({ ...basePayload(), amount: -1 }, IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.INVALID_AMOUNT);
    });

    it('throws BadRequestError when sender and recipient are the same wallet', async () => {
        await expect(
            service.transferFunds(
                { senderWalletId: SENDER_ID, recipientWalletId: SENDER_ID, amount: 100 },
                IDEM_KEY
            )
        ).rejects.toThrow(ERROR_MESSAGE.SAME_WALLET_TRANSFER);
    });

    it('throws BadRequestError on currency mismatch', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 500 });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'USD', balance: 200 });

        // sorted order: SENDER_ID < RECIPIENT_ID, so first=sender, second=recipient
        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        await expect(
            service.transferFunds(basePayload(), IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.CURRENCY_MISMATCH);
    });

    it('throws when either sender or recipient wallet is suspended', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 500, status: WalletStatus.SUSPENDED });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'IDR', balance: 200 });

        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        await expect(service.transferFunds(basePayload(), IDEM_KEY))
            .rejects.toThrow(ERROR_MESSAGE.WALLET_SUSPENDED);
    });

    it('throws BadRequestError when sender has insufficient funds', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 50 });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'IDR', balance: 200 });

        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        await expect(
            service.transferFunds(basePayload(), IDEM_KEY) // amount = 100, sender has 50
        ).rejects.toThrow(ERROR_MESSAGE.INSUFFICIENT_FUNDS);
    });

    it('throws BadRequestError when sender balance is out of sync with ledger', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 1000 });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'IDR', balance: 200 });

        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        // Sender ledger says 999 ≠ 1000 → out of sync
        mockWalletLedgerRepository.findAll
            .mockResolvedValueOnce([{ balance_before: 0, amount: 999, balance_after: 999 }] as any) // sender check
            .mockResolvedValueOnce([] as any);                                                          // recipient check

        await expect(
            service.transferFunds(basePayload(), IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.BALANCE_OUT_OF_SYNC);
    });

    it('throws BadRequestError when recipient balance is out of sync with ledger', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 1000 });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'IDR', balance: 200 });

        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        // Sender in sync, recipient not
        mockWalletLedgerRepository.findAll
            .mockResolvedValueOnce([{ balance_before: 0, amount: 1000, balance_after: 1000 }] as any) // sender check — in sync
            .mockResolvedValueOnce([{ balance_before: 0, amount: 999, balance_after: 999 }] as any);   // recipient check — out of sync

        await expect(
            service.transferFunds(basePayload(), IDEM_KEY)
        ).rejects.toThrow(ERROR_MESSAGE.BALANCE_OUT_OF_SYNC);
    });

    it('debits sender and credits recipient with correct amounts', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 1000 });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'IDR', balance: 200 });

        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        await service.transferFunds(basePayload(), IDEM_KEY); // amount = 100

        expect(sender.balance).toBe(900);
        expect(recipient.balance).toBe(300);
        expect(sender.save).toHaveBeenCalledWith({ transaction: MOCK_TRANSACTION });
        expect(recipient.save).toHaveBeenCalledWith({ transaction: MOCK_TRANSACTION });
    });

    it('creates a ledger entry with correct balances for both wallets', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 1000 });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'IDR', balance: 200 });

        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        await service.transferFunds(basePayload(), IDEM_KEY);

        expect(mockWalletLedgerRepository.createTransferEntries).toHaveBeenCalledWith(
            expect.objectContaining({
                senderWalletId:       SENDER_ID,
                recipientWalletId:    RECIPIENT_ID,
                amount:               100,
                senderBalanceBefore:  1000,
                senderBalanceAfter:   900,
                recipientBalanceBefore: 200,
                recipientBalanceAfter:  300
            }),
            MOCK_TRANSACTION
        );
    });

    it('locks wallets in consistent lexicographic UUID order to prevent deadlocks', async () => {
        // Reverse IDs so we can verify order is normalised regardless of which is sender/recipient
        const FIRST_ID  = 'aaaaaaaa-0000-0000-0000-000000000001'; // lexicographically first
        const SECOND_ID = 'zzzzzzzz-0000-0000-0000-000000000099'; // lexicographically second

        const walletFirst  = makeMockWallet({ id: FIRST_ID,  currency: 'IDR', balance: 500 });
        const walletSecond = makeMockWallet({ id: SECOND_ID, currency: 'IDR', balance: 100 });

        // Pass SECOND as sender, FIRST as recipient — service must still lock FIRST first
        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(walletFirst  as any) // should be fetched first (sorted)
            .mockResolvedValueOnce(walletSecond as any);

        await service.transferFunds(
            { senderWalletId: SECOND_ID, recipientWalletId: FIRST_ID, amount: 50 },
            IDEM_KEY
        );

        const calls = mockWalletRepository.findOneOrFail.mock.calls;
        expect(calls[0][0]).toMatchObject({ where: { id: FIRST_ID  } });
        expect(calls[1][0]).toMatchObject({ where: { id: SECOND_ID } });
    });

    it('wraps work inside runIdempotent with the correct scope', async () => {
        const sender    = makeMockWallet({ id: SENDER_ID,    currency: 'IDR', balance: 500 });
        const recipient = makeMockWallet({ id: RECIPIENT_ID, currency: 'IDR', balance: 100 });

        mockWalletRepository.findOneOrFail
            .mockResolvedValueOnce(sender    as any)
            .mockResolvedValueOnce(recipient as any);

        await service.transferFunds(basePayload(), IDEM_KEY);

        expect(runIdempotent).toHaveBeenCalledWith(
            `wallet:transfer:${SENDER_ID}:${RECIPIENT_ID}`,
            IDEM_KEY,
            expect.any(Function)
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// transferFundsByUser
// ─────────────────────────────────────────────────────────────────────────────

describe('transferFundsByUser', () => {
    const SENDER_USER_ID = 1;
    const RECIPIENT_USER_ID = 2;
    const IDEM_KEY = 'idem-user-transfer-1';

    it('resolves both wallets by user and currency then delegates to transferFunds', async () => {
        mockWalletRepository.findOne
            .mockResolvedValueOnce({ id: 'sender-wallet-id' } as any)
            .mockResolvedValueOnce({ id: 'recipient-wallet-id' } as any);

        const transferFundsSpy = jest.spyOn(service, 'transferFunds').mockResolvedValue(undefined);

        await service.transferFundsByUser(
            {
                senderUserId: SENDER_USER_ID,
                recipientUserId: RECIPIENT_USER_ID,
                currency: 'idr',
                amount: 100
            },
            IDEM_KEY
        );

        expect(mockWalletRepository.findOne).toHaveBeenNthCalledWith(1, {
            where: {
                user_id: SENDER_USER_ID,
                currency: 'IDR'
            }
        });

        expect(mockWalletRepository.findOne).toHaveBeenNthCalledWith(2, {
            where: {
                user_id: RECIPIENT_USER_ID,
                currency: 'IDR'
            }
        });

        expect(transferFundsSpy).toHaveBeenCalledWith(
            {
                senderWalletId: 'sender-wallet-id',
                recipientWalletId: 'recipient-wallet-id',
                amount: 100
            },
            IDEM_KEY
        );
    });

    it('throws when sender or recipient has no wallet in requested currency', async () => {
        mockWalletRepository.findOne
            .mockResolvedValueOnce({ id: 'sender-wallet-id' } as any)
            .mockResolvedValueOnce(null);

        await expect(
            service.transferFundsByUser(
                {
                    senderUserId: SENDER_USER_ID,
                    recipientUserId: RECIPIENT_USER_ID,
                    currency: 'USD',
                    amount: 50
                },
                IDEM_KEY
            )
        ).rejects.toThrow('Sender or recipient does not have wallet with requested currency');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// pay
// ─────────────────────────────────────────────────────────────────────────────

describe('pay', () => {
    const WALLET_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
    const USER_ID   = 1;
    const IDEM_KEY  = 'idem-pay-1';

    it('throws BadRequestError when amount is zero', async () => {
        await expect(service.pay(USER_ID, WALLET_ID, 0, IDEM_KEY))
            .rejects.toThrow(ERROR_MESSAGE.INVALID_AMOUNT);
    });

    it('throws BadRequestError when amount is negative', async () => {
        await expect(service.pay(USER_ID, WALLET_ID, -10, IDEM_KEY))
            .rejects.toThrow(ERROR_MESSAGE.INVALID_AMOUNT);
    });

    it('rejects payment smaller than smallest currency unit (0.001)', async () => {
        await expect(service.pay(USER_ID, WALLET_ID, 0.001, IDEM_KEY))
            .rejects.toThrow(ERROR_MESSAGE.INVALID_AMOUNT);
    });

    it('throws BadRequestError when wallet does not belong to the user', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: 999 });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await expect(service.pay(USER_ID, WALLET_ID, 100, IDEM_KEY))
            .rejects.toThrow('Unauthorized');
    });

    it('throws BadRequestError on insufficient funds', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: USER_ID, balance: 50 });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await expect(service.pay(USER_ID, WALLET_ID, 100, IDEM_KEY))
            .rejects.toThrow(ERROR_MESSAGE.INSUFFICIENT_FUNDS);
    });

    it('throws when wallet is suspended', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: USER_ID, balance: 500, status: WalletStatus.SUSPENDED });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await expect(service.pay(USER_ID, WALLET_ID, 100, IDEM_KEY))
            .rejects.toThrow(ERROR_MESSAGE.WALLET_SUSPENDED);
    });

    it('deducts the balance and records a negative ledger entry on success', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, userId: USER_ID, balance: 500 });
        mockWalletRepository.findOneOrFail.mockResolvedValue(wallet as any);

        await service.pay(USER_ID, WALLET_ID, 150, IDEM_KEY);

        expect(wallet.balance).toBe(350);
        expect(wallet.save).toHaveBeenCalledWith({ transaction: MOCK_TRANSACTION });
        expect(mockWalletLedgerRepository.createTopUpEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                walletId:      WALLET_ID,
                amount:        -150,          // negative for debit
                balanceBefore: 500,
                balanceAfter:  350
            }),
            MOCK_TRANSACTION
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────────────────────

describe('create', () => {
    it('throws BadRequestError when user does not exist', async () => {
        mockUserRepository.findOneWithItems.mockResolvedValue(null);

        await expect(service.create(99, 'IDR')).rejects.toThrow('User not found');
    });

    it('creates a wallet with zero balance for the given user and currency', async () => {
        // Return an object with all properties expected by the service implementation
        mockUserRepository.findOneWithItems.mockResolvedValue({ id: 1, wallets: [] } as any);
        mockWalletRepository.create.mockResolvedValue({} as any);

        await service.create(1, 'usd');

        expect(mockWalletRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ user_id: 1, currency: 'USD', balance: 0 })
        );
    });

    it('rejects duplicate wallet currency per user (case-insensitive)', async () => {
        mockUserRepository.findOneWithItems.mockResolvedValue({
            id: 1,
            wallets: [{ currency: 'IDR' }]
        } as any);

        await expect(service.create(1, 'idr'))
            .rejects.toThrow('User already has a wallet with this currency');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('updateStatus', () => {
    const WALLET_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

    it('throws BadRequestError when wallet is not found', async () => {
        mockWalletRepository.findOne.mockResolvedValue(null);

        await expect(service.updateStatus(WALLET_ID, WalletStatus.SUSPENDED))
            .rejects.toThrow('Wallet not found');
    });

    it('sets the new status and persists it', async () => {
        const wallet = makeMockWallet({ id: WALLET_ID, status: WalletStatus.ACTIVE });
        mockWalletRepository.findOne.mockResolvedValue(wallet as any);

        await service.updateStatus(WALLET_ID, WalletStatus.SUSPENDED);

        expect(wallet.status).toBe(WalletStatus.SUSPENDED);
        expect(wallet.save).toHaveBeenCalled();
    });
});
