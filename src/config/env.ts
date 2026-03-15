import 'dotenv/config';

const toNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  return Number.isNaN(parsedValue) ? fallback : parsedValue;
};

export const env = {
  port: toNumber(process.env.PORT, 3000),
  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: toNumber(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME ?? 'postgres',
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres'
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: toNumber(process.env.REDIS_PORT, 6379)
  }
};