// =============================================================================
// api/ai-agent/chat.js
// POST /api/ai-agent/chat
// Body: {
//   messages: [{
//     role: "user"|"assistant",
//     content: string,
//     attachments?: [{ mimeType: string, base64: string, name?: string }],
//   }, ...],
//   systemPrompt?: string,     // optional system-role instructions
//   enableTools?: boolean,     // if true, offers page-selected tools (see _tools.js)
//   toolNames?: string[],      // which tools to offer when enableTools is true —
//                              // names must exist in TOOLS_BY_NAME below.
//                              // Defaults to create_quiz/edit_quiz/delete_quiz
//                              // when omitted. Unknown names are dropped.
// }
//
// The client NEVER chooses the AI provider, the model, or supplies an API
// key — the platform decides all three (see resolvePlatformProvider() and
// resolvePlatformModel() below). Any `provider` / `model` / `useOwnKey` /
// `ownKey` fields a client may still send are ignored.
//
// PLATFORM CONFIGURATION (environment variables):
//   AI_AGENT_GOOGLE_KEYS / AI_AGENT_DEEPSEEK_KEYS / AI_AGENT_CLAUDE_KEYS
//       comma-separated key pools (see _keyPool.js)
//   AI_AGENT_PROVIDER  (optional) "google" | "deepseek" | "claude". When
//       unset, the first provider that has keys configured is used, in that
//       order.
//   AI_AGENT_MODEL     (optional) a model id from ALLOWED_MODELS in
//       _providerClients.js. When unset (or not on that allowlist), the
//       provider's own lightest default is used.
//
// ATTACHMENTS: max 1 per message, 4MB decoded (see MAX_ATTACHMENT_BYTES —
// Vercel's own request body cap is the real binding constraint here, not
// any provider's own limit). Images/PDF are sent natively to Google/Claude;
// everything else (currently just .docx) is text-extracted server-side via
// processAttachments() and folded into `content` — this is also what makes
// attachments work at all with DeepSeek, which has no file input in its API.
// Success 200: { text: string, toolCalls?: Array<{ name: string, input: object }> }
// Failure 400/401/403/429/500/503: { error: string }
//
// AUTHORIZATION:
// The platform's rotated free-tier keys (getNextKey in _keyPool.js) are
// available to EVERYONE now, including anonymous/never-logged-in users —
// there is no more level gate. What's required instead:
//   - a valid admin JWT (see _middleware.js::requireAdmin) — "Verified
//     Admin" — uncapped, OR
//   - a valid regular-user JWT (see api/user-profile.js's action=identify,
//     minted for every user including anonymous ones via a client-side
//     device_id — see public/src/shared/userLevel.js) — capped at
//     AI_AGENT_DAILY_LIMIT platform-key requests per UTC day, tracked in
//     user_profiles.ai_agent_usage_count/_date and enforced atomically via
//     the increment_ai_agent_usage() Postgres function (see the migration
//     that added it) so concurrent requests can't race past the cap — see
//     checkAndIncrementDailyUsage() below.
// Both JWTs are minted server-side with a server-computed claim (admin
// role / user profileId), so neither the identity nor the resulting quota
// row is spoofable by a client.
//
// =============================================================================

import { createHmac } from "node:crypto";
import { getKeySequence, hasPlatformKeys } from "./_keyPool.js";
import { callProvider, isSupportedProvider } from "./_providerClients.js";
import mammoth from "mammoth";
import { createClient } from "@supabase/supabase-js";

// ── File attachments (Task 3) ──────────────────────────────────────────────
// Deliberately handled inside this single endpoint rather than a new
// serverless function — the project is close to Vercel Hobby's 12-function
// cap (see public-config.js's comment re: the removed /api/env route), so
// every new capability here needs to fold into an existing route.
//
// Vercel's default request body limit (4.5MB on Hobby) is well below
// Gemini's own ~20MB inline-file limit, so *that* is the real binding
// constraint — enforce a conservative cap here so oversized uploads fail
// with a clear message instead of an opaque 413 from the platform.
//
// MAX_ATTACHMENT_BYTES is a per-file ceiling (still needed so one runaway
// file can't dominate the budget on its own), but the real gate for
// "how many files can ride in one message" is MAX_TOTAL_ATTACHMENT_BYTES,
// checked against the SUM of every attachment's decoded size — files don't
// each get an equal slice of the budget, one attachment can be 4MB and
// another can be 50KB, as long as the total fits. Budget math: base64
// inflates decoded bytes by ~4/3 on the wire, and the JSON envelope
// (message text, conversation history, system prompt) needs its own room
// under the 4.5MB body cap, so the total decoded-attachment budget is set
// well below what 4.5MB / (4/3) alone would suggest.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // per-file ceiling, base64-decoded size
const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024; // combined ceiling across all attachments on one message, base64-decoded
const MAX_ATTACHMENTS_PER_MESSAGE = 10; // v2: multiple files, gated by MAX_TOTAL_ATTACHMENT_BYTES above, not an equal per-file split

// Gemini and Claude both take these natively (see _providerClients.js);
// anything else goes through extractAttachmentText() below instead.
const NATIVELY_SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function base64ByteLength(base64) {
  // Cheap approximation good enough for a size guard: 4 base64 chars encode
  // 3 raw bytes, minus up to 2 bytes for padding.
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * DeepSeek has no file/image input in its API at all (text-only), and
 * neither Gemini nor Claude take .docx/.pptx natively. For any mime type
 * outside NATIVELY_SUPPORTED_MIME_TYPES, extract plain text server-side and
 * fold it into the message's `content` instead of sending it as a binary
 * attachment — this is also what makes DeepSeek usable when a file is
 * attached (see _providerClients.js's top comment).
 *
 * v1 supports .docx via mammoth. .pptx extraction is a larger lift (no
 * lightweight library on hand) and is intentionally out of scope for now —
 * unsupported types get a clear error back to the user rather than silently
 * doing nothing.
 * @param {{mimeType: string, base64: string, name?: string}} attachment
 * @returns {Promise<string>} extracted plain text
 */
async function extractAttachmentText(attachment) {
  if (attachment.mimeType === DOCX_MIME_TYPE) {
    const buffer = Buffer.from(attachment.base64, "base64");
    const { value } = await mammoth.extractRawText({ buffer });
    return value || "";
  }
  const err = new Error(`Unsupported attachment type for extraction: ${attachment.mimeType}`);
  err.userFacing = true;
  throw err;
}

/**
 * Validates and, where needed, converts each message's attachments in
 * place — extracting text for non-natively-supported file types (folded
 * into that message's `content`) and leaving natively-supported types
 * (images/PDF) untouched for the provider adapter to send as binary parts.
 * Mutates and returns the same messages array.
 * @param {Array<object>} messages
 * @returns {Promise<Array<object>>}
 */
async function processAttachments(messages) {
  for (const message of messages) {
    if (!Array.isArray(message.attachments) || !message.attachments.length) continue;

    if (message.attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      const err = new Error("Too many attachments on one message");
      err.userFacing = true;
      err.userMessage = `يمكن إرفاق ${MAX_ATTACHMENTS_PER_MESSAGE} ملفات كحد أقصى في كل رسالة.`;
      throw err;
    }

    // Sum first, across every attachment on this message, before doing any
    // per-file work below — a message that's already over budget should
    // fail with one clear "too much total" error rather than an unrelated
    // "this specific file is too big" error for whichever file happens to
    // be last in the array.
    let totalBytes = 0;
    for (const att of message.attachments) {
      if (!att?.base64) continue;
      totalBytes += base64ByteLength(att.base64);
    }
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      const err = new Error(`Total attachment size too large: ${totalBytes} bytes`);
      err.userFacing = true;
      err.userMessage = `الحجم الإجمالي للملفات المرفقة كبير جدًا (الحد الأقصى ${(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(1)} ميجابايت لكل الملفات معًا).`;
      throw err;
    }

    const remainingAttachments = [];
    for (const att of message.attachments) {
      if (!att?.base64 || !att?.mimeType) continue;

      const byteLength = base64ByteLength(att.base64);
      if (byteLength > MAX_ATTACHMENT_BYTES) {
        const err = new Error(`Attachment too large: ${byteLength} bytes`);
        err.userFacing = true;
        err.userMessage = "حجم أحد الملفات كبير جدًا (الحد الأقصى 4 ميجابايت لكل ملف).";
        throw err;
      }

      if (NATIVELY_SUPPORTED_MIME_TYPES.has(att.mimeType)) {
        remainingAttachments.push(att);
        continue;
      }

      try {
        const extractedText = await extractAttachmentText(att);
        const label = att.name ? `\n\n[محتوى الملف المرفق: ${att.name}]\n` : "\n\n[محتوى الملف المرفق]\n";
        message.content = `${message.content || ""}${label}${extractedText}`;
      } catch (extractErr) {
        if (extractErr.userFacing) throw extractErr;
        const err = new Error(`Attachment extraction failed: ${extractErr.message}`);
        err.userFacing = true;
        err.userMessage = "لا يمكن معالجة نوع هذا الملف حاليًا. الأنواع المدعومة: صور، PDF، Word (.docx).";
        throw err;
      }
    }
    message.attachments = remainingAttachments;
  }
  return messages;
}

// Upstream 429 ("too many requests") / 503 ("model overloaded") are
// transient provider-side conditions, not something wrong with the key or
// our code — surface them as a distinct, friendlier message + a real HTTP
// status the frontend can use to suggest "try again" rather than reading
// as a generic broken-integration error.
function isTransientUpstreamStatus(status) {
  return status === 429 || status === 503;
}

function transientMessageFor(status) {
  return status === 429
    ? "تم الوصول للحد الأقصى من الطلبات لدى مزوّد الذكاء الاصطناعي حاليًا. حاول مرة أخرى خلال قليل."
    : "خوادم مزوّد الذكاء الاصطناعي مشغولة حاليًا (overloaded). حاول مرة أخرى خلال لحظات.";
}

// A bare "fetch failed" (no err.upstreamStatus at all) means the runtime's
// fetch() never got an HTTP response to inspect in the first place — DNS
// resolution failed, the connection was refused, or there's no outbound
// network path to the provider host at all (common on a dev machine behind
// a restrictive proxy/firewall, or with no internet access). This is
// distinct from every case above, where the provider *did* respond and we
// have a real status code — so give it its own message instead of the
// same generic "فشل الاتصال" a reader can't act on, and log the specific
// cause code (ENOTFOUND/ECONNREFUSED/etc, available on err.cause on
// undici's fetch) to make this diagnosable from server logs alone.
function isNetworkLevelFailure(err) {
  return !err?.upstreamStatus && (err?.cause?.code || /fetch failed/i.test(err?.message || ""));
}

function networkFailureMessage() {
  return "تعذّر الوصول إلى خادم مزوّد الذكاء الاصطناعي عبر الشبكة. تحقق من اتصال الخادم بالإنترنت (DNS/جدار الحماية) وحاول مرة أخرى.";
}

const AI_AGENT_DAILY_LIMIT = 15;
const AI_AGENT_IP_DAILY_LIMIT = 60;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://belal-amr.vercel.app",
  "https://belalamrmohamed.github.io",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://localhost:3001",
];

let cachedSupabaseClient = null;
function getSupabaseClient() {
  if (!cachedSupabaseClient) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
    }
    cachedSupabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );
  }
  return cachedSupabaseClient;
}

function applyCors(req, res) {
  const origins = (process.env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && !origins.includes(origin)) return false;

  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

function hashQuotaSubject(kind, value) {
  const secret = process.env.AI_AGENT_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!secret) throw new Error("AI quota hashing is not configured");
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

async function checkAndIncrementDailyUsage(deviceId, ipAddress) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId || "")) {
    return { allowed: false, deviceUsage: 0, ipUsage: 0, invalidIdentity: true };
  }

  const { data, error } = await getSupabaseClient().rpc("consume_ai_agent_daily_quota", {
    p_device_hash: hashQuotaSubject("device", deviceId),
    p_ip_hash: hashQuotaSubject("ip", ipAddress),
    p_device_limit: AI_AGENT_DAILY_LIMIT,
    p_ip_limit: AI_AGENT_IP_DAILY_LIMIT,
  });
  if (error || !Array.isArray(data) || !data.length) {
    console.error("[ai-agent/chat] daily quota database check failed", error);
    throw new Error("AI request quota could not be verified");
  }
  return {
    allowed: Boolean(data[0].allowed),
    deviceUsage: Number(data[0].device_usage) || 0,
    ipUsage: Number(data[0].ip_usage) || 0,
  };
}

async function loadPortfolioContext(client) {
  const [projectsResult, settingsResult] = await Promise.all([
    client
      .from("portfolio_projects")
      .select("title, summary, category, project_url, github_url, featured")
      .eq("is_published", true)
      .neq("status", "archived")
      .order("sort_order", { ascending: true })
      .limit(40),
    client
      .from("portfolio_settings")
      .select("key, value")
      .eq("is_public", true)
      .limit(40),
  ]);
  if (projectsResult.error) throw projectsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const settings = Object.fromEntries(
    (settingsResult.data || []).map(({ key, value }) => [key, value]),
  );
  const projects = (projectsResult.data || []).map((project) => ({
    title: project.title,
    description: project.summary,
    category: project.category,
    url: project.project_url,
    source: project.github_url,
    featured: project.featured,
  }));

  return [
    "You are Belal Amr's portfolio assistant. Answer in the language the visitor used.",
    "Use only the following published portfolio data for personal, project, and contact claims. Do not invent details. If the data does not answer a question, say so clearly.",
    "Share project and source links as markdown links when relevant. You are an AI assistant, not Belal.",
    `Public profile settings: ${JSON.stringify(settings)}`,
    `Published projects: ${JSON.stringify(projects)}`,
    process.env.AI_AGENT_SYSTEM_PROMPT || "",
  ].filter(Boolean).join("\n\n");
}

// The platform — not the client — decides which provider answers.
// AI_AGENT_PROVIDER wins when set to a supported provider; otherwise the
// first provider with at least one configured key is used.
const PROVIDER_PREFERENCE_ORDER = ["google", "deepseek", "claude"];

function resolvePlatformProvider() {
  const forced = (process.env.AI_AGENT_PROVIDER || "").trim().toLowerCase();
  if (forced && isSupportedProvider(forced)) return forced;
  return PROVIDER_PREFERENCE_ORDER.find((p) => hasPlatformKeys(p)) || null;
}

// Optional platform-level model pin. callProvider() validates it against the
// provider's allowlist and silently falls back to the provider's default if
// it isn't on it, so a typo here can never produce an arbitrary model string.
function resolvePlatformModel() {
  return (process.env.AI_AGENT_MODEL || "").trim() || undefined;
}

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ error: "Origin is not allowed" });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, deviceId } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return res.status(400).json({ error: "الرسائل مطلوبة" });
  }

  const conversation = messages.slice(-30);
  let totalTextLength = 0;
  for (const message of conversation) {
    if (
      !message
      || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string"
      || message.content.length > 15000
    ) {
      return res.status(400).json({ error: "محتوى المحادثة غير صالح" });
    }
    totalTextLength += message.content.length;
  }
  if (totalTextLength > 60000) {
    return res.status(413).json({ error: "المحادثة طويلة جدًا. ابدأ محادثة جديدة." });
  }

  try {
    await processAttachments(conversation);
  } catch (err) {
    console.error("[ai-agent/chat] attachment processing error:", err);
    return res.status(400).json({ error: err.userMessage || "تعذر معالجة الملف المرفق" });
  }

  const provider = resolvePlatformProvider();
  if (!provider) {
    return res.status(503).json({ error: "خدمة المساعد الذكي غير متاحة حاليًا" });
  }
  const keys = getKeySequence(provider);
  if (!keys.length) {
    return res.status(503).json({ error: "خدمة المساعد الذكي غير متاحة حاليًا" });
  }

  const rawIpAddress = req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
  const ipAddress = String(Array.isArray(rawIpAddress) ? rawIpAddress[0] : rawIpAddress).slice(0, 128);

  try {
    const quota = await checkAndIncrementDailyUsage(deviceId, ipAddress);
    if (quota.invalidIdentity) {
      return res.status(400).json({ error: "تعذّر إنشاء معرّف جلسة صالح. حدّث الصفحة وحاول مجددًا." });
    }
    if (!quota.allowed) {
      return res.status(429).json({
        error: `تم الوصول إلى الحد اليومي للمساعد (${AI_AGENT_DAILY_LIMIT} طلبًا لهذا المتصفح). حاول مرة أخرى غدًا.`,
        dailyLimit: AI_AGENT_DAILY_LIMIT,
        usageCount: quota.deviceUsage,
      });
    }

    const client = getSupabaseClient();
    const systemPrompt = await loadPortfolioContext(client);
    const model = resolvePlatformModel();
    let lastProviderError;

    for (const key of keys) {
      try {
        const result = await callProvider(provider, key, conversation, systemPrompt, undefined, model);
        return res.status(200).json(result);
      } catch (error) {
        lastProviderError = error;
        if (![401, 403, 429].includes(error.upstreamStatus)) break;
      }
    }

    const upstreamStatus = lastProviderError?.upstreamStatus;
    console.error("[ai-agent/chat] provider request failed", {
      provider,
      status: upstreamStatus || null,
      cause: lastProviderError?.cause?.code || null,
    });

    if (isTransientUpstreamStatus(upstreamStatus)) {
      return res.status(upstreamStatus).json({
        error: transientMessageFor(upstreamStatus),
        transient: true,
      });
    }
    if (isNetworkLevelFailure(lastProviderError)) {
      return res.status(502).json({ error: networkFailureMessage(), networkLevel: true });
    }
    return res.status(502).json({ error: "فشل الاتصال بمزوّد الذكاء الاصطناعي" });
  } catch (err) {
    console.error("[ai-agent/chat] request failed", err);
    return res.status(503).json({
      error: "تعذر الوصول إلى بيانات الملف الشخصي أو التحقق من حد الاستخدام. حاول مرة أخرى لاحقًا.",
    });
  }
}