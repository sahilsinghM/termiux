const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const rateLimit = require('express-rate-limit');
const path = require('path');
const { log } = require('./logger.js');

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
    secret: process.env.AUTH_TOKEN,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV !== 'development',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Try again in 15 minutes.',
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

function createLoginRouter() {
  const router = express.Router();

  router.get('/login', (req, res) => {
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
    if (password !== process.env.AUTH_TOKEN) {
      log(`Login attempt: fail from ${req.ip}`);
      return res.status(401).redirect('/login?error=1');
    }
    log(`Login attempt: success from ${req.ip}`);
    req.session.authenticated = true;
    req.session.save(() => res.redirect('/'));
  });

  return router;
}

function checkWsAuth(req, cb) {
  if (wsConnectionCount >= MAX_WS_CONNECTIONS) {
    log(`WS connection rejected: limit reached (${wsConnectionCount}/${MAX_WS_CONNECTIONS})`);
    return cb(new Error('connection limit reached'));
  }
  if (!req.session || !req.session.authenticated) {
    return cb(new Error('unauthorized'));
  }
  cb(null);
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
