import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import { Call } from './entities/Call';
import { ProviderCall } from './entities/ProviderCall';
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [Call, ProviderCall],
  migrations: ['dist/migrations/*.js'],
  synchronize: false, // use migrations only
  logging: false
});
