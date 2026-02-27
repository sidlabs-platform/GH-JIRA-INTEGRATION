import rateLimit from 'express-rate-limit';

/** Rate limiter for the webhook endpoint. */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // generous limit for webhooks
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

/** Rate limiter for the admin API. */
export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});
