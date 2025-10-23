import express from 'express';
import callsRouter from './routes/calls';
import metricsRouter from './routes/metrics';
import callbacksRouter from './routes/callbacks';

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/calls', callsRouter);
app.use('/metrics', metricsRouter);
app.use('/callbacks', callbacksRouter);

// centralized error handler — always return JSON
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error('[error-handler]', err && err.stack ? err.stack : err);
	const status = err && err.statusCode ? err.statusCode : 500;
	const message = err && err.message ? err.message : 'internal_error';
	res.status(status).json({ error: 'internal', message });
});
