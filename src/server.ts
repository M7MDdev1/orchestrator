import { app } from './app';
import { AppDataSource } from './data-source';
import dotenv from 'dotenv';
dotenv.config();

const PORT = Number(process.env.PORT || 3000);

AppDataSource.initialize().then(() => {
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}).catch(err => {
  console.error('Data source init failed', err);
  process.exit(1);
});
