// Per-identity tmux session naming and a scrubbed shell environment.
// Kept pure and node-pty-free so both are unit-testable in isolation.

// Environment variables the interactive shell is allowed to inherit. Anything
// not on this list (AUTH_TOKEN, SESSION_SECRET, CF_*, TLS_*, PORT, ...) is
// withheld so a shell user cannot read the app's secrets. TERM is forced.
const ALLOWED_ENV = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'TZ'];

function sessionNameFor(identity) {
  if (!identity) return 'main';
  const safe = String(identity)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-') // tmux names must avoid . : and shell metachars
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return safe || 'main';
}

function shellEnv(env) {
  const out = { TERM: 'xterm-256color' };
  for (const key of ALLOWED_ENV) {
    if (env[key] !== undefined) out[key] = env[key];
  }
  // Preserve locale (LC_*) without whitelisting each one by name.
  for (const key of Object.keys(env)) {
    if (key.startsWith('LC_')) out[key] = env[key];
  }
  return out;
}

module.exports = { sessionNameFor, shellEnv };
