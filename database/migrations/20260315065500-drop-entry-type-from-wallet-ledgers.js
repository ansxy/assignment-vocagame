'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('wallet_ledgers', 'entry_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_wallet_ledgers_entry_type";');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'CREATE TYPE "enum_wallet_ledgers_entry_type" AS ENUM (\'debit\', \'credit\');'
    );

    await queryInterface.addColumn('wallet_ledgers', 'entry_type', {
      type: Sequelize.ENUM('debit', 'credit'),
      allowNull: false,
      defaultValue: 'credit'
    });

    await queryInterface.sequelize.query(
      'ALTER TABLE "wallet_ledgers" ALTER COLUMN "entry_type" DROP DEFAULT;'
    );
  }
};
