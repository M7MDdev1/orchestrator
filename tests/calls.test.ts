import request from 'supertest';
import { app } from '../src/app';

jest.mock('../src/repositories/call.repo', () => ({
  createCall: jest.fn(async (input: any) => ({ id: 'call-1', ...input, status: 'PENDING', attempts: 0, createdAt: new Date().toISOString(), nextRunAt: new Date().toISOString() })),
  getCall: jest.fn(async (id: string) => id === 'call-1' ? { id: 'call-1', to: '+1', scriptId: 'greeting', status: 'PENDING' } : null),
  updateIfPending: jest.fn(async (id: string, body: any) => id === 'call-1' ? { id: 'call-1', ...body, status: 'PENDING' } : null),
  listByStatus: jest.fn(async (status: string, page: number, pageSize: number) => [{ id: 'call-1', to: '+1', scriptId: 'greeting', status }])
}));

describe('Calls API', () => {
  test('POST /calls creates a call', async () => {
    const res = await request(app)
      .post('/calls')
      .send({ to: '+15550000001', scriptId: 'greeting_v1', metadata: { customerId: '5678' } });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('to', '+15550000001');
  });

  test('GET /calls/:id returns a call', async () => {
    const res = await request(app).get('/calls/call-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'call-1');
  });

  test('PATCH /calls/:id updates if pending', async () => {
    const res = await request(app)
      .patch('/calls/call-1')
      .send({ metadata: { attemptNote: 'retry attempt' } });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'PENDING');
  });

  test('GET /calls?status=PENDING lists calls', async () => {
    const res = await request(app).get('/calls?status=PENDING&page=1&pageSize=20');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
