// Fail-closed startup validation. Pure function over an env-like object so a
// misconfiguration stops the process instead of silently degrading security.
// Returns { ok: true } or { ok: false, message }.
function isTruthy(v) {
  return v != null && !['', '0', 'false', 'no'].includes(String(v).toLowerCase());
}

function validateConfig(env) {
  if (!env.AUTH_TOKEN) {
    return { ok: false, message: 'AUTH_TOKEN not set. Copy .env.example to .env and set a strong password.' };
  }

  if (isTruthy(env.REQUIRE_CF_ACCESS) && (!env.CF_TEAM_DOMAIN || !env.CF_AUD)) {
    return { ok: false, message: 'REQUIRE_CF_ACCESS is set but CF_TEAM_DOMAIN and CF_AUD are not both configured.' };
  }

  // The session-signing secret must exist and differ from the login token, so a
  // leak of one does not compromise the other. Relaxed only in local dev.
  if (env.NODE_ENV !== 'development') {
    if (!env.SESSION_SECRET || env.SESSION_SECRET === env.AUTH_TOKEN) {
      return { ok: false, message: 'SESSION_SECRET must be set and distinct from AUTH_TOKEN.' };
    }
  }

  return { ok: true };
}

module.exports = { validateConfig };
