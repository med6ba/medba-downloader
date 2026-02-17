const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const tmpDir = path.resolve(__dirname, 'tmp');
const RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000);
const RATE_LIMIT_MAX = parsePositiveInt(process.env.RATE_LIMIT_MAX, 120);
const rateBuckets = new Map();

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(
  cors({
    origin: clientOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 60 * 60 * 24
  })
);
app.use(express.json({ limit: '10kb' }));
app.use('/api', apiRateLimitMiddleware);

app.use('/api/formats', require('./routes/formats'));
app.use('/api/download', require('./routes/download'));

app.use((req, res) => {
  res.status(404).json({ error: 'This page is not available.' });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(err.status || 500).json({
    error: err.message || 'Something went wrong on the server. Please try again.'
  });
});

app.listen(port, () => {
  console.log(`Medba Downloader server is running on port ${port}`);
});

setInterval(() => {
  const now = Date.now();
  const cutoff = RATE_LIMIT_WINDOW_MS * 2;

  for (const [key, value] of rateBuckets.entries()) {
    if (now - value.windowStart > cutoff) {
      rateBuckets.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function apiRateLimitMiddleware(req, res, next) {
  const now = Date.now();
  const key = getClientKey(req);
  const existing = rateBuckets.get(key);

  if (!existing || now - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return next();
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil(
      Math.max(0, RATE_LIMIT_WINDOW_MS - (now - existing.windowStart)) / 1000
    );

    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many requests right now. Please try again in a few minutes.'
    });
  }

  existing.count += 1;
  rateBuckets.set(key, existing);
  return next();
}

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}
