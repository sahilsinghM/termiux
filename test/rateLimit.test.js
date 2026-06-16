import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

// RED: rate limiter blocks the 6th login attempt within the window

describe('login rate limiter', () => {
  let app;

  beforeAll(() => {
    process.env.AUTH_TOKEN = 'secret';
    process.env.NODE_ENV = 'development';
    app = createApp();
  });

  it('blocks the 6th POST /login attempt with 429', async () => {
    // Each supertest request comes from a unique address per test run,
    // but rate-limit uses req.ip. We use a shared agent to reuse the connection.
    const agent = request.agent(app);

    // 5 attempts — all should result in redirect (not 429)
    for (let i = 0; i < 5; i++) {
      const res = await agent
        .post('/login')
        .type('form')
        .send({ password: 'wrong' });
      expect(res.status).not.toBe(429);
    }

    // 6th attempt — rate limited
    const res = await agent
      .post('/login')
      .type('form')
      .send({ password: 'wrong' });
    expect(res.status).toBe(429);
    expect(res.text).toContain('Too many login attempts');
  });
});
