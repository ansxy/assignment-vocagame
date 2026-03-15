require('dotenv/config');

const toNumber = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  return Number.isNaN(parsedValue) ? fallback : parsedValue;
};

const buildConfig = (databaseName) => {
  if (process.env.DATABASE_URL) {
    return {
      use_env_variable: 'DATABASE_URL',
      dialect: 'postgres',
      migrationStorageTableName: 'sequelize_meta'
    };
  }

  return {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: databaseName,
    host: process.env.DB_HOST || '127.0.0.1',
    port: toNumber(process.env.DB_PORT, 5432),
    dialect: 'postgres',
    migrationStorageTableName: 'sequelize_meta'
  };
};

module.exports = {
  development: buildConfig(process.env.DB_NAME),
  test: buildConfig(process.env.DB_TEST_NAME),
  production: buildConfig(process.env.DB_NAME)
};
