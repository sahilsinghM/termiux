import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { createAccessVerifier } from '../src/server/accessIdentity.js';

// Behavior spec for the Cloudflare Access identity gate. We sign real JWTs with
// a local key pair and inject the matching JWKS, so the whole gate is exercised
// offline through its public interface — no network, no mocking of internals.

const ISSUER = 'https://team.cloudflareaccess.com';
const AUD = 'test-aud';

let privateKey;
let jwks;

async function token(claims = {}, { aud = AUD, issuer = ISSUER, exp = '5m' } = {}) {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(aud)
    .setExpirationTime(exp)
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const pubJwk = await exportJWK(pair.publicKey);
  pubJwk.kid = 'test-kid';
  pubJwk.alg = 'RS256';
  jwks = createLocalJWKSet({ keys: [pubJwk] });
});

describe('access identity gate', () => {
  it('returns the verified claims for a valid Access JWT', async () => {
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks });
    const claims = await verify(await token({ email: 'me@example.com' }));
    expect(claims).toBeTruthy();
    expect(claims.email).toBe('me@example.com');
  });

  it('returns null for a forged token signed by a different key', async () => {
    const other = await generateKeyPair('RS256');
    const forged = await new SignJWT({ email: 'attacker@evil.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuedAt().setIssuer(ISSUER).setAudience(AUD).setExpirationTime('5m')
      .sign(other.privateKey);
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks });
    expect(await verify(forged)).toBeNull();
  });

  it('rejects a validly-signed token whose identity is not allowed', async () => {
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks, allowedEmails: ['me@example.com'] });
    expect(await verify(await token({ email: 'stranger@example.com' }))).toBeNull();
  });

  it('admits a validly-signed token whose identity is allowed', async () => {
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks, allowedEmails: ['me@example.com'] });
    const claims = await verify(await token({ email: 'me@example.com' }));
    expect(claims?.email).toBe('me@example.com');
  });

  it('admits a service-token identity by common_name when allowed', async () => {
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks, allowedEmails: ['agent-1.access'] });
    const claims = await verify(await token({ common_name: 'agent-1.access' }));
    expect(claims).toBeTruthy();
  });

  it('rejects an expired token', async () => {
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks });
    expect(await verify(await token({ email: 'me@example.com' }, { exp: Math.floor(Date.now() / 1000) - 60 }))).toBeNull();
  });

  it('rejects a token with the wrong audience', async () => {
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks });
    expect(await verify(await token({ email: 'me@example.com' }, { aud: 'other-aud' }))).toBeNull();
  });

  it('returns null when no token is supplied', async () => {
    const verify = createAccessVerifier({ aud: AUD, issuer: ISSUER, jwks });
    expect(await verify(undefined)).toBeNull();
  });
});
