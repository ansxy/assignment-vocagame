'use strict';

const LedgerEntryType = {
  DEBIT: 'debit',
  CREDIT: 'credit'
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallet_ledgers', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4
      },
      transaction_ref: {
        type: Sequelize.UUID,
        allowNull: false
      },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'wallets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      entry_type: {
        type: Sequelize.ENUM(...Object.values(LedgerEntryType)),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false
      },
      balance_before: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false
      },
      balance_after: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false
      },
      note: {
        type: Sequelize.STRING,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('wallet_ledgers', ['transaction_ref']);
    await queryInterface.addIndex('wallet_ledgers', ['wallet_id']);
    await queryInterface.addIndex('wallet_ledgers', ['user_id']);
    await queryInterface.addIndex('wallet_ledgers', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('wallet_ledgers');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_wallet_ledgers_entry_type";');
  }
};
