import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkWsAuth,
  getWsConnectionCount,
  incrementWsCount,
  decrementWsCount,
} from '../src/server/auth.js';

// RED: WS connection limit is enforced through checkWsAuth

describe('WS connection limit', () => {
  // Reset counter before each test by bringing it back to 0
  beforeEach(() => {
    // Drain the counter to 0
    const count = getWsConnectionCount();
    for (let i = 0; i < count; i++) decrementWsCount();
  });

  it('accepts connection when under the 5-connection limit', () => {
    return new Promise((resolve, reject) => {
      const req = { session: { authenticated: true }, socket: { remoteAddress: '127.0.0.1' } };
      checkWsAuth(req, (e) => {
        if (e) reject(e);
        else resolve();
      });
    });
  });

  it('rejects the 6th connection with "connection limit reached"', () => {
    return new Promise((resolve) => {
      // Simulate 5 open connections
      for (let i = 0; i < 5; i++) incrementWsCount();
      const req = { session: { authenticated: true }, socket: { remoteAddress: '127.0.0.1' } };
      checkWsAuth(req, (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe('connection limit reached');
        resolve();
      });
    });
  });

  it('rejects unauthenticated upgrade with "unauthorized"', () => {
    return new Promise((resolve) => {
      const req = { session: {}, socket: { remoteAddress: '127.0.0.1' } };
      checkWsAuth(req, (e) => {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe('unauthorized');
        resolve();
      });
    });
  });
});
