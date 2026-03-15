'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_wallet_ledgers_entry_type') THEN
          CREATE TYPE "enum_wallet_ledgers_entry_type" AS ENUM ('TRANSFER', 'TOP_UP');
        END IF;
      END $$;
    `);

    await queryInterface.addColumn('wallet_ledgers', 'entry_type', {
      type: Sequelize.ENUM('TRANSFER', 'TOP_UP'),
      allowNull: false,
      defaultValue: 'TRANSFER'
    });

    // Remove the default now that backfill is done
    await queryInterface.sequelize.query(`
      ALTER TABLE "wallet_ledgers" ALTER COLUMN "entry_type" DROP DEFAULT;
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('wallet_ledgers', 'entry_type');

    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_wallet_ledgers_entry_type";
    `);
  }
};
