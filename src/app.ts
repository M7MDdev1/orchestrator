import express from 'express';
import callsRouter from './routes/calls';
import metricsRouter from './routes/metrics';
import callbacksRouter from './routes/callbacks';

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/calls', callsRouter);
app.use('/metrics', metricsRouter);
app.use('/callbacks', callbacksRouter);
