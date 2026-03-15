'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert('users', [
      {
        name: 'Arif Pratama',
        email: 'arif.id@example.com',
        created_at: now,
        updated_at: now,
        deleted_at: null
      },
      {
        name: 'John Miller',
        email: 'john.us@example.com',
        created_at: now,
        updated_at: now,
        deleted_at: null
      },
      {
        name: 'Tan Wei Ming',
        email: 'tan.sg@example.com',
        created_at: now,
        updated_at: now,
        deleted_at: null
      },
      {
        name: 'Sophie Laurent',
        email: 'sophie.eu@example.com',
        created_at: now,
        updated_at: now,
        deleted_at: null
      },
      {
        name: 'Maya Kartika',
        email: 'maya.id@example.com',
        created_at: now,
        updated_at: now,
        deleted_at: null
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: [
        'arif.id@example.com',
        'john.us@example.com',
        'tan.sg@example.com',
        'sophie.eu@example.com',
        'maya.id@example.com'
      ]
    });
  }
};