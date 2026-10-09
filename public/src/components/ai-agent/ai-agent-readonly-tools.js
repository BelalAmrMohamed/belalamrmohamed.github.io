// =============================================================================
// public/src/components/ai-agent/ai-agent-readonly-tools.js
// Read-only AI Agent tool-call handlers: search_library, parse_item_info,
// get_user_activity. Extracted out of user-quizzes-view.js so that any
// chat panel wired with HOME_PAGE_SYSTEM_PROMPT (which tells the model
// these three tools exist — see ai-agent-default-prompts.js) can actually
// answer them, without needing user-quizzes-view.js's own write-side tools
// (create_quiz/edit_quiz/delete_quiz/create_folder/create_course/
// move_item), which depend on page-local state (folder tree context,
// re-rendering the grid) that only makes sense on the home page itself.
//
// Kept dependency-free of both user-quizzes-view.js and
// ai-agent-attach-launcher.js/ai-agent.js — only pulls in the already
// DOM-free, headless helpers (ai-agent-library-search.js,
// ai-agent-item-lookup.js, storage-helpers.js), the same pattern
// ai-agent-item-lookup.js's own header comment documents for avoiding a
// three-file import cycle back into ai-agent-chat.js.
// =============================================================================

import { getFromStorage } from "../../shared/storage-helpers.js";
import { searchLibrary, resolveLibraryItemById } from "./ai-agent-library-search.js";
import { listRecentUserItems, resolveUserItemById } from "./ai-agent-item-lookup.js";

/**
 * Handles `search_library` — see api/ai-agent/_tools.js's own comment on
 * why this (and parse_item_info/get_user_activity below) are resolved
 * entirely client-side rather than on the server: half the data
 * (user_quizzes) only exists in this browser's localStorage, and the
 * other half (platform courses/quizzes) is already fully
 * client-resolvable via the manifest with no server round-trip needed.
 *
 * Formats a compact, model-readable listing rather than raw JSON —
 * matches fetch_attached_quiz's own precedent of returning readable text
 * (see openAIAgentWithAttachment in ai-agent-attach-launcher.js) rather
 * than a JSON blob the model would have to re-parse conceptually anyway.
 * @param {{name: string, input: {query: string, scope?: string}}} toolCall
 * @returns {Promise<string>}
 */
export async function handleSearchLibraryToolCall(toolCall) {
    const { query, scope } = toolCall?.input || {};
    if (!query || !query.trim()) {
        const err = new Error("search_library called without a query");
        err.userMessage = "Please specify a search term.";
        throw err;
    }

    const { mine, platform } = await searchLibrary(query.trim(), { scope });

    const formatSection = (label, items) => {
        if (!items.length) return `${label}: No results.`;
        const lines = items.map((it) => {
            const kindLabel = { quiz: "Quiz", course: "Course", folder: "Folder" }[it.kind] || it.kind;
            return `  - [${kindLabel}] ${it.title} (id: ${it.id})`;
        });
        return `${label}:\n${lines.join("\n")}`;
    };

    const sections = [];
    if (scope !== "platform") sections.push(formatSection("Results from your library", mine));
    if (scope !== "mine") sections.push(formatSection("Results from the main page", platform));

    return `Search results for "${query.trim()}":\n\n${sections.join("\n\n")}`;
}

/**
 * Handles `parse_item_info` — resolves an id against the user's own
 * library first (instant, no network), falling back to platform content
 * (see resolveLibraryItemById's own doc comment). Returns the item's
 * summary/payload as text, same shape principle as
 * fetch_attached_quiz's own tool-result formatting.
 * @param {{name: string, input: {id: string, kind?: string}}} toolCall
 * @returns {Promise<string>}
 */
export async function handleParseItemInfoToolCall(toolCall) {
    const { id, kind } = toolCall?.input || {};
    if (!id) {
        const err = new Error("parse_item_info called without an id");
        err.userMessage = "No item was specified.";
        throw err;
    }

    const item = await resolveLibraryItemById(id, kind);
    if (!item) {
        const err = new Error(`parse_item_info: no item with id "${id}" found`);
        err.userMessage = "The requested item could not be found.";
        throw err;
    }

    const kindLabel = { quiz: "Quiz", course: "Course", folder: "Folder" }[item.kind] || item.kind;
    const body = item.payload ? JSON.stringify(item.payload) : (item.summary || "(No additional details available)");
    return `[${kindLabel}: ${item.title}]\n${body}`;
}

/**
 * Handles `get_user_activity`. "last_created" is a straightforward
 * listRecentUserItems(limit=1) read; "last_taken_or_result" reads the
 * single `last_quiz_result` localStorage key (see quiz.js's own write
 * site) — this device tracks only the most recent attempt, not a full
 * history (quiz_state_{id} is just in-progress state, cleared on
 * completion, not a log), which GET_USER_ACTIVITY_TOOL's own description
 * already tells the model up front so it doesn't need to be told again
 * here as an apology — this handler just answers plainly from what
 * exists.
 * @param {{name: string, input: {which: string}}} toolCall
 * @returns {Promise<string>}
 */
export async function handleGetUserActivityToolCall(toolCall) {
    const { which } = toolCall?.input || {};

    if (which === "last_created") {
        const [latest] = listRecentUserItems("", 1);
        if (!latest) return "The user hasn't created any quiz yet.";
        const item = resolveUserItemById(latest.id);
        return `Last quiz created: ${item?.title || latest.title}${item?.summary ? ` — ${item.summary}` : ""}`;
    }

    if (which === "last_taken_or_result") {
        let result = null;
        try {
            result = JSON.parse(getFromStorage("last_quiz_result", "null"));
        } catch {
            result = null;
        }
        if (!result) return "The user hasn't taken any quiz on this device yet.";
        return `Last quiz taken: ${result.examTitle || "Quiz"} — Score: ${result.score ?? "?"}/${result.total ?? "?"} — Question count: ${result.totalQuestions ?? result.questions?.length ?? 0}`;
    }

    const err = new Error(`get_user_activity called with unknown which="${which}"`);
    err.userMessage = "Unknown request.";
    throw err;
}

/**
 * Dispatches by tool name across all three read-only tools. Any caller
 * wiring up toolNames: [..., "search_library", "parse_item_info",
 * "get_user_activity"] can pass this straight through (or fold it into a
 * bigger switch, as user-quizzes-view.js's handleQuizToolCall does) rather
 * than re-listing the three cases itself.
 * @param {{name: string, input: object}} toolCall
 * @returns {Promise<string>}
 */
export async function handleReadOnlyLibraryToolCall(toolCall) {
    switch (toolCall?.name) {
        case "search_library":
            return handleSearchLibraryToolCall(toolCall);
        case "parse_item_info":
            return handleParseItemInfoToolCall(toolCall);
        case "get_user_activity":
            return handleGetUserActivityToolCall(toolCall);
        default: {
            const err = new Error(`Unknown tool call: ${toolCall?.name}`);
            err.userMessage = "Unknown tool.";
            throw err;
        }
    }
}

/** Tool names this module can handle — shared by every caller's toolNames array. */
export const READONLY_LIBRARY_TOOL_NAMES = ["search_library", "parse_item_info", "get_user_activity"];