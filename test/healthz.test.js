import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

// RED: /healthz returns 200 with expected JSON shape
describe('GET /healthz', () => {
  let app;

  beforeAll(() => {
    process.env.AUTH_TOKEN = 'test-secret';
    app = createApp();
  });

  it('returns 200 with status ok and tmux field', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.tmux).toBe('boolean');
  });
});
