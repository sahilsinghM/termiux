import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

// Behavior spec: behind cloudflared (plain HTTP to localhost, X-Forwarded-Proto
// https), the app must honor the forwarded protocol so the `secure` session
// cookie is issued and login completes — and the login limiter must key on the
// real client IP, not the loopback address every request shares behind a proxy.

let app;
const prevEnv = {};

beforeAll(() => {
  prevEnv.NODE_ENV = process.env.NODE_ENV;
  prevEnv.AUTH_TOKEN = process.env.AUTH_TOKEN;
  process.env.NODE_ENV = 'production';
  process.env.AUTH_TOKEN = 'correct-password';
  app = createApp();
});

afterAll(() => {
  process.env.NODE_ENV = prevEnv.NODE_ENV;
  process.env.AUTH_TOKEN = prevEnv.AUTH_TOKEN;
});

describe('reverse-proxy behavior', () => {
  it('issues the secure session cookie on login when X-Forwarded-Proto is https', async () => {
    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-Proto', 'https')
      .type('form')
      .send({ password: 'correct-password' });
    expect(res.status).toBe(302);
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => c.startsWith('termiux.sid'))).toBe(true);
  });

  it('keys the login limiter on the real client IP, so a fresh IP is not pre-limited', async () => {
    // Exhaust the limit for one client IP.
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/login')
        .set('X-Forwarded-Proto', 'https')
        .set('CF-Connecting-IP', '9.9.9.9')
        .type('form')
        .send({ password: 'wrong' });
    }
    // A different client IP has its own bucket and is not rate-limited.
    const fresh = await request(app)
      .post('/login')
      .set('X-Forwarded-Proto', 'https')
      .set('CF-Connecting-IP', '8.8.8.8')
      .type('form')
      .send({ password: 'wrong' });
    expect(fresh.status).not.toBe(429);
  });
});
