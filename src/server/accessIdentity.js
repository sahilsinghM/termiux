const { createRemoteJWKSet, jwtVerify } = require('jose');

// Deep module: the Cloudflare Access identity gate.
//
// Interface: createAccessVerifier(config) -> async verify(token) -> claims|null
//
// It verifies the JWT signature, audience, and issuer, then enforces an
// allowed-identity list (authorization, not just authentication). Returns the
// verified claims on success, or null on any failure. The JWKS is injectable so
// the gate can be exercised offline in tests; in production it defaults to
// Cloudflare's remote key set derived from the team domain.
function createAccessVerifier({ aud, issuer, jwks, allowedEmails } = {}) {
  const keys = jwks || (issuer ? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) : null);

  return async function verify(token) {
    if (!keys || !aud || !token) return null;
    try {
      const { payload } = await jwtVerify(token, keys, { audience: aud, issuer });
      if (allowedEmails && allowedEmails.length) {
        // A human identity carries `email`; a service token carries
        // `common_name`. Fall back to `sub`. Reject anything not on the list.
        const identity = payload.email || payload.common_name || payload.sub;
        if (!allowedEmails.includes(identity)) return null;
      }
      return payload;
    } catch {
      return null;
    }
  };
}

module.exports = { createAccessVerifier };
