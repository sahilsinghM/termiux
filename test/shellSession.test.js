import { describe, it, expect } from 'vitest';
import { sessionNameFor, shellEnv } from '../src/server/shellSession.js';

// Behavior spec: each authenticated identity gets its own tmux session name, and
// the shell environment carries none of the app's secrets.

describe('sessionNameFor', () => {
  it('derives a tmux-safe session name from an email (no @ or .)', () => {
    const name = sessionNameFor('me@example.com');
    expect(name).toBe('me-example-com');
    expect(name).not.toMatch(/[.@:]/);
  });

  it('derives a name from a service-token common_name', () => {
    expect(sessionNameFor('agent-1.access')).toBe('agent-1-access');
  });

  it('falls back to "main" when there is no identity', () => {
    expect(sessionNameFor(undefined)).toBe('main');
    expect(sessionNameFor('')).toBe('main');
  });

  it('does not let a crafted identity break out of the name', () => {
    expect(sessionNameFor('a; rm -rf /')).not.toMatch(/[;/ ]/);
  });
});

describe('shellEnv', () => {
  const dirty = {
    HOME: '/home/termiux',
    PATH: '/usr/bin',
    TERM: 'dumb',
    LANG: 'en_US.UTF-8',
    AUTH_TOKEN: 'super-secret',
    SESSION_SECRET: 'cookie-secret',
    CF_AUD: 'aud',
    CF_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
    TLS_KEY_FILE: '/etc/key.pem',
  };

  it('keeps benign shell vars', () => {
    const env = shellEnv(dirty);
    expect(env.HOME).toBe('/home/termiux');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  it('drops every app secret', () => {
    const env = shellEnv(dirty);
    for (const k of ['AUTH_TOKEN', 'SESSION_SECRET', 'CF_AUD', 'CF_TEAM_DOMAIN', 'TLS_KEY_FILE']) {
      expect(env[k]).toBeUndefined();
    }
  });

  it('forces a usable TERM', () => {
    expect(shellEnv(dirty).TERM).toBe('xterm-256color');
  });
});
