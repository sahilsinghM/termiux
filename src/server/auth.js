const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createAccessVerifier } = require('./accessIdentity.js');
const { sessionNameFor } = require('./shellSession.js');
const { log } = require('./logger.js');

const accessVerifier = createAccessVerifier({
  aud: process.env.CF_AUD,
  issuer: process.env.CF_TEAM_DOMAIN,
  allowedEmails: (process.env.CF_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

const MAX_WS_CONNECTIONS = 5;
let wsConnectionCount = 0;

function getWsConnectionCount() { return wsConnectionCount; }
function incrementWsCount() { wsConnectionCount++; }
function decrementWsCount() { wsConnectionCount--; }

function createSessionParser() {
  return session({
    store: new FileStore({
      path: path.join(process.cwd(), 'sessions'),
      retries: 1,
    }),
    name: 'termiux.sid',
    secret: process.env.SESSION_SECRET || process.env.AUTH_TOKEN,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV !== 'development',
      maxAge: 24 * 60 * 60 * 1000,
    },
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Key on req.ip, which `trust proxy: 'loopback'` resolves to the real client
  // from the forwarded chain when the hop is loopback (cloudflared), and to the
  // raw socket IP otherwise. Do NOT key on a raw header like CF-Connecting-IP:
  // if the origin is ever reachable directly, an attacker could rotate it to
  // mint a fresh bucket per request and bypass the limit entirely.
  message: 'Too many login attempts. Try again in 15 minutes.',
});

// Returns the verified Access claims (truthy) or null. Callers treat any
// truthy result as authenticated; the claims carry the identity used later to
// scope a per-client shell session.
async function isCloudflareAuthenticated(req) {
  return accessVerifier(req.headers?.['cf-access-jwt-assertion']);
}

async function requireAuth(req, res, next) {
  try {
    if (await isCloudflareAuthenticated(req)) return next();
    if (req.session && req.session.authenticated) return next();
    res.redirect('/login');
  } catch (e) {
    next(e);
  }
}

function createLoginRouter() {
  const router = express.Router();

  router.get('/login', async (req, res, next) => {
    try { if (await isCloudflareAuthenticated(req)) return res.redirect('/'); } catch (e) { return next(e); }
    const error = req.query.error === '1';
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Termiux — Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#e6edf3;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100dvh}
    form{display:flex;flex-direction:column;gap:12px;width:min(320px,90vw)}
    h1{font-size:1.2rem;letter-spacing:.05em}
    input[type=password]{background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:1rem;padding:10px 12px;width:100%}
    button{background:#238636;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:1rem;padding:10px;width:100%}
    button:active{background:#2ea043}
    .error{color:#f85149;font-size:.875rem}
  </style>
</head>
<body>
  <form method="POST" action="/login">
    <h1>Termiux</h1>
    ${error ? '<p class="error">Incorrect password — try again.</p>' : ''}
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password"/>
    <button type="submit">Connect</button>
  </form>
</body>
</html>`);
  });

  router.post('/login', loginLimiter, express.urlencoded({ extended: false }), (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(401).redirect('/login?error=1');
    const expected = Buffer.from(process.env.AUTH_TOKEN);
    const actual = Buffer.from(password.length === expected.length ? password : '\0'.repeat(expected.length));
    const match = crypto.timingSafeEqual(actual, expected) && password.length === process.env.AUTH_TOKEN.length;
    if (!match) {
      log(`Login attempt: fail from ${req.ip}`);
      return res.status(401).redirect('/login?error=1');
    }
    log(`Login attempt: success from ${req.ip}`);
    req.session.authenticated = true;
    req.session.save(() => res.redirect('/'));
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('termiux.sid');
      res.redirect('/login');
    });
  });

  return router;
}

async function checkWsAuth(req, cb) {
  try {
    if (wsConnectionCount >= MAX_WS_CONNECTIONS) {
      log(`WS connection rejected: limit reached (${wsConnectionCount}/${MAX_WS_CONNECTIONS})`);
      return cb(new Error('connection limit reached'));
    }
    const claims = await isCloudflareAuthenticated(req);
    if (!claims && (!req.session || !req.session.authenticated)) {
      return cb(new Error('unauthorized'));
    }
    // Access identities each get their own tmux session; password clients share
    // one ('main'), since the password path has no per-identity concept.
    const identity = claims && (claims.email || claims.common_name || claims.sub);
    cb(null, sessionNameFor(identity));
  } catch (e) {
    cb(e);
  }
}

module.exports = {
  createSessionParser,
  requireAuth,
  createLoginRouter,
  checkWsAuth,
  getWsConnectionCount,
  incrementWsCount,
  decrementWsCount,
};
