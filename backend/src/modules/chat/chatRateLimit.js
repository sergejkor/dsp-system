const buckets = new Map();

function getBucketKey(action, userId) {
  return `${action}:${userId}`;
}

export function enforceRateLimit({ action, userId, limit, windowMs }) {
  const now = Date.now();
  const key = getBucketKey(action, userId);
  const bucket = buckets.get(key) || [];
  const nextBucket = bucket.filter((timestamp) => now - timestamp < windowMs);

  if (nextBucket.length >= limit) {
    const retryAfterMs = windowMs - (now - nextBucket[0]);
    const error = new Error('Rate limit exceeded');
    error.status = 429;
    error.code = 'RATE_LIMITED';
    error.details = {
      action,
      retry_after_ms: Math.max(retryAfterMs, 1000),
    };
    throw error;
  }

  nextBucket.push(now);
  buckets.set(key, nextBucket);
}
