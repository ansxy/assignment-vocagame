'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION prevent_wallet_ledgers_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledgers is append-only: UPDATE/DELETE is not allowed';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_prevent_wallet_ledgers_mutation ON wallet_ledgers;
      CREATE TRIGGER trg_prevent_wallet_ledgers_mutation
      BEFORE UPDATE OR DELETE ON wallet_ledgers
      FOR EACH ROW
      EXECUTE FUNCTION prevent_wallet_ledgers_mutation();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_prevent_wallet_ledgers_mutation ON wallet_ledgers;
      DROP FUNCTION IF EXISTS prevent_wallet_ledgers_mutation();
    `);
  }
};
