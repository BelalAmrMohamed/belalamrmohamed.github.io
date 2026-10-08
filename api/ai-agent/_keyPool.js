// =============================================================================
// api/ai-agent/_keyPool.js
// Round-robin selection over platform-provided free-tier API keys.
//
// Keys are configured via comma-separated env vars, one pool per provider:
//   AI_AGENT_GOOGLE_KEYS  = "key1,key2,key3"
//   AI_AGENT_DEEPSEEK_KEYS = "key1,key2"
//   AI_AGENT_CLAUDE_KEYS   = "key1"
//
// Rotation strategy: Vercel serverless functions are stateless between
// invocations (no shared memory), so a simple in-process counter would
// reset constantly and not actually round-robin across requests. Instead
// we time-slice: bucket "now" into N-second windows and pick
// `windowIndex % pool.length`. This spreads load roughly evenly across
// concurrent/rapid requests without needing a database round-trip.
//
// NOTE: If precise fairness matters more than latency later, swap this for
// a `ai_key_rotation(provider text primary key, cursor int)` table bumped
// via a Postgres `UPDATE ... RETURNING` (atomic increment) in Supabase.
// The call site (chat.js) only depends on getNextKey()'s return shape, so
// that swap is contained entirely to this file.
// =============================================================================

const ROTATION_WINDOW_MS = 3000; // new "slot" every 3s

function getPool(provider) {
  const envKey = {
    google: "AI_AGENT_GOOGLE_KEYS",
    deepseek: "AI_AGENT_DEEPSEEK_KEYS",
    claude: "AI_AGENT_CLAUDE_KEYS",
  }[provider];

  if (!envKey) return [];

  const raw = process.env[envKey] || "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .filter((key, index, keys) => keys.indexOf(key) === index);
}

/**
 * Returns the next platform key to use for a given provider, round-robin.
 * @param {"google"|"deepseek"|"claude"} provider
 * @returns {{ key: string, poolSize: number } | null} null if no keys configured
 */
export function getNextKey(provider) {
  const keys = getKeySequence(provider);
  if (keys.length === 0) return null;
  return { key: keys[0], poolSize: keys.length };
}

export function getKeySequence(provider) {
  const pool = getPool(provider);
  if (pool.length === 0) return [];

  const start = Math.floor(Date.now() / ROTATION_WINDOW_MS) % pool.length;
  return pool.map((_, offset) => pool[(start + offset) % pool.length]);
}

export function hasPlatformKeys(provider) {
  return getPool(provider).length > 0;
}
