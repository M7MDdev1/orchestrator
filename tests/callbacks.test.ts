import request from 'supertest';
import { app } from '../src/app';

jest.mock('../src/services/worker.service', () => ({
  settleFromProvider: jest.fn(async () => undefined)
}));

describe('Callbacks API', () => {
  test('POST /callbacks/call-status accepts providerCallId', async () => {
    const res = await request(app)
      .post('/callbacks/call-status')
      .send({ providerCallId: 'provider-1', status: 'COMPLETED', completedAt: new Date().toISOString() });
    expect(res.status).toBe(200);
  });

  test('POST /callbacks/call-status requires id', async () => {
    const res = await request(app).post('/callbacks/call-status').send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });
});
