'use strict';

const { randomUUID } = require('crypto');

/**
 * Supported currencies from src/shared/constant/common.ts (SUPPORTED_REGIONS)
 * IDR, USD, SGD, EUR
 */
const SUPPORTED_CURRENCIES = ['IDR', 'USD', 'SGD', 'EUR'];
const BASE_BALANCE_BY_CURRENCY = {
  IDR: 100000.0,
  USD: 12.5,
  SGD: 25.75,
  EUR: 40.25
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.sequelize.query(
      `
        SELECT id, email
        FROM users
        WHERE email IN (
          'arif.id@example.com',
          'john.us@example.com',
          'tan.sg@example.com',
          'sophie.eu@example.com',
          'maya.id@example.com'
        )
        ORDER BY id ASC
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (!users.length) {
      return;
    }

    const now = new Date();

    const userIds = users.map((user) => user.id);

    await queryInterface.bulkDelete('wallets', {
      user_id: userIds,
      currency: SUPPORTED_CURRENCIES
    });

    const wallets = users.flatMap((user, userIndex) => {
      const step = userIndex + 1;

      return SUPPORTED_CURRENCIES.map((currency) => {
        const baseBalance = BASE_BALANCE_BY_CURRENCY[currency];

        // Ensure decimal-style balances and one very large balance sample.
        let variedBalance = baseBalance + step * (baseBalance * 0.15);

        if (userIndex === 0 && currency === 'IDR') {
          variedBalance = 1000000000.0;
        }

        return {
          id: randomUUID(),
          user_id: user.id,
          balance: variedBalance.toFixed(2),
          status: 'active',
          currency,
          created_at: now,
          updated_at: now,
          deleted_at: null
        };
      });
    });

    await queryInterface.bulkInsert('wallets', wallets);
  },

  async down(queryInterface, Sequelize) {
    const users = await queryInterface.sequelize.query(
      `
        SELECT id
        FROM users
        WHERE email IN (
          'arif.id@example.com',
          'john.us@example.com',
          'tan.sg@example.com',
          'sophie.eu@example.com',
          'maya.id@example.com'
        )
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const userIds = users.map((user) => user.id);

    if (!userIds.length) {
      return;
    }

    await queryInterface.bulkDelete('wallets', {
      user_id: userIds,
      currency: SUPPORTED_CURRENCIES
    });
  }
};
