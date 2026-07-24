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

  it('keys the login limiter on the trusted forwarded client IP, not a spoofable header', async () => {
    // The client IP must come from the trust-proxy-resolved forwarded chain,
    // NOT a raw header an attacker could rotate to dodge the limit. Exhaust one
    // client IP via X-Forwarded-For (honored only because trust proxy=loopback).
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/login')
        .set('X-Forwarded-Proto', 'https')
        .set('X-Forwarded-For', '9.9.9.9')
        .type('form')
        .send({ password: 'wrong' });
    }
    // A different forwarded client has its own bucket.
    const fresh = await request(app)
      .post('/login')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '8.8.8.8')
      .type('form')
      .send({ password: 'wrong' });
    expect(fresh.status).not.toBe(429);

    // A spoofed CF-Connecting-IP must NOT mint a fresh bucket for the
    // already-limited forwarded client — the header is not the key.
    const spoofed = await request(app)
      .post('/login')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '9.9.9.9')
      .set('CF-Connecting-IP', 'whatever-attacker-wants')
      .type('form')
      .send({ password: 'wrong' });
    expect(spoofed.status).toBe(429);
  });
});
