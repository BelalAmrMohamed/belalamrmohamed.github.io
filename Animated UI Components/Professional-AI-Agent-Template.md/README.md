# AI Agent modal — portable package

The "الباشــمبصمج" AI agent modal, extracted from the basmagi-quiz project.

## What was changed vs. the original
- **Removed الإعدادات (Settings):** `ai-agent-settings.js` deleted; sidebar button, settings modal, and all related CSS removed.
- **Removed `ai-agent-chat-model-select`:** the model dropdown (and its sidebar slot / CSS) is gone. The client no longer sends `provider`, `model`, `ownKey` or `useOwnKey`.
- **System prompt** now comes only from the host page's `defaultSystemPrompt` option.
- **Backend `api/ai-agent/chat.js`:** the platform picks provider + model. Bring-your-own-key path removed.
- `public/src/features/home/user-quizzes-folders.js` is a **slim stub** (3 pure functions copied verbatim) so the package doesn't need the whole quiz app.

## Layout (paths preserved so relative imports work)
- `public/src/components/ai-agent/` — the agent (entry: `ai-agent.js`, styles: `ai-agent.css`)
- `public/src/components/notifications/`, `telegram-bot-card/` — required UI helpers + CSS
- `public/src/shared/`, `features/…` — helper modules the agent imports
- `public/src/styles/themes.css` — design tokens the CSS relies on (`--color-*`, `--shadow-*`, `--z-*`…)
- `public/assets/images/el-bash-mebasmag--no-bg.png` — logo (used by FAB/header/sidebar)
- `api/` — backend reference (`ai-agent/chat.js`, `_tools.js`, `_providerClients.js`, `_keyPool.js`, `_middleware.js`)
- `supabase/migrations/…daily_usage.sql` — daily quota RPC used by `chat.js`

## Frontend usage
```html
<link rel="stylesheet" href="/src/styles/themes.css">
<link rel="stylesheet" href="/src/components/ai-agent/ai-agent.css">
<link rel="stylesheet" href="/src/components/notifications/notifications.css">
```
```js
import { createAIAgentFab } from "/src/components/ai-agent/ai-agent.js";
document.body.appendChild(createAIAgentFab({
  pageKey: "home",
  defaultSystemPrompt: "You are …",
  placeholder: "اسأل…",
  suggestedPrompts: ["…"],
}));
```
Serve `public/` as the site root (the code uses absolute `/assets/...` and `/api/...` paths).

## Backend
`POST /api/ai-agent/chat` body: `{ messages, systemPrompt?, enableTools?, toolNames? }` → `{ text, toolCalls? }`.
Env vars: `AI_AGENT_GOOGLE_KEYS` / `AI_AGENT_DEEPSEEK_KEYS` / `AI_AGENT_CLAUDE_KEYS` (comma-separated),
optional `AI_AGENT_PROVIDER`, optional `AI_AGENT_MODEL` (must be in `ALLOWED_MODELS`),
plus `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
npm: `jsonwebtoken`, `mammoth`, `@supabase/supabase-js`.

The client gets its identity token from `getUserToken()` (`shared/userLevel.js` → `/api/user-profile?action=identify`) and admins via `shared/adminAuth.js`.
**That identity endpoint is NOT included** — implement an equivalent on the other site, or simplify the quota block in `chat.js`.

## Not changed (you may want to strip these)
- Telegram sidebar button + chat banner (hardcoded `@basmagi_quiz_bot`).
- Hardcoded brand name/logo.
- Quiz-platform-specific modules: `@` library search, `ai-agent-attach-launcher.js`, `ai-agent-default-prompts.js`, `ai-agent-suggested-prompts.js`, `ai-agent-readonly-tools.js`, `ai-agent-item-lookup.js`, and the quiz/lesson tools in `api/ai-agent/_tools.js`.
- Not browser-tested after edits (syntax- and import-checked only).
