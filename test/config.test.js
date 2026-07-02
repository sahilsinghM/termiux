import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/server/config.js';

// Behavior spec: fail-closed startup validation. Pure function over an env-like
// object so every failure mode is checked without spawning a process.

const base = { AUTH_TOKEN: 'pw', NODE_ENV: 'development' };

describe('validateConfig', () => {
  it('accepts a minimal valid dev config', () => {
    expect(validateConfig(base).ok).toBe(true);
  });

  it('rejects a missing AUTH_TOKEN', () => {
    const r = validateConfig({ ...base, AUTH_TOKEN: '' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('AUTH_TOKEN not set');
  });

  it('rejects REQUIRE_CF_ACCESS without CF_TEAM_DOMAIN/CF_AUD', () => {
    const r = validateConfig({ ...base, REQUIRE_CF_ACCESS: 'true', CF_AUD: '' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/CF_TEAM_DOMAIN|CF_AUD/);
  });

  it('accepts REQUIRE_CF_ACCESS when CF env is present', () => {
    const r = validateConfig({
      ...base,
      REQUIRE_CF_ACCESS: 'true',
      CF_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
      CF_AUD: 'aud',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects SESSION_SECRET equal to AUTH_TOKEN in production', () => {
    const r = validateConfig({ AUTH_TOKEN: 'pw', NODE_ENV: 'production', SESSION_SECRET: 'pw' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('SESSION_SECRET');
  });

  it('rejects a missing SESSION_SECRET in production', () => {
    const r = validateConfig({ AUTH_TOKEN: 'pw', NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('SESSION_SECRET');
  });

  it('accepts a distinct SESSION_SECRET in production', () => {
    const r = validateConfig({ AUTH_TOKEN: 'pw', NODE_ENV: 'production', SESSION_SECRET: 'different-secret' });
    expect(r.ok).toBe(true);
  });
});
