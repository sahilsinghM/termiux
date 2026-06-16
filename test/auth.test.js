import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

// RED: auth gate behaviors — all verified through the HTTP interface

describe('auth middleware', () => {
  let app;

  beforeAll(() => {
    process.env.AUTH_TOKEN = 'correct-password';
    process.env.NODE_ENV = 'development';
    app = createApp();
  });

  it('GET / without a session redirects to /login', async () => {
    const res = await request(app).get('/');
    // In dev mode, no static files served, but the auth middleware still applies
    // We verify the redirect happens for the /login GET
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('GET /login returns 200 with a password form', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<input type="password"');
    expect(res.text).toContain('Termiux');
  });

  it('GET /login?error=1 shows error message', async () => {
    const res = await request(app).get('/login?error=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Incorrect password');
  });

  it('POST /login with correct password redirects to /', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ password: 'correct-password' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('POST /login with wrong password redirects to /login?error=1', async () => {
    // Express redirect() always emits 302 regardless of res.status().
    // The client follows to /login?error=1 which renders the error message.
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ password: 'wrong-password' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=1');
  });

  it('POST /login with empty password redirects to /login?error=1', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ password: '' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=1');
  });
});
