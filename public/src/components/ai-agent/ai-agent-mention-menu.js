// =============================================================================
// public/src/components/ai-agent/ai-agent-mention-menu.js
// Custom `@` mention menu — REPLACES the old shared `/`+`@` trigger menu that
// used to live inline in ai-agent-chat.js (~L2373-2547 in the pre-this-change
// version). Per the update plan: `/` is dropped entirely (nothing in this
// app used `/` for anything else, and keeping it as a second, narrower
// trigger for only the Quick-Access items would just move the "`/` and `@`
// do almost the same thing" redundancy down a level instead of removing
// it); `@` becomes the single, richer entry point covering:
//   - Quick-Access pseudo-items (@Last_Created_Quiz, @Last_Taken_Quiz,
//     @Last_Quiz_Results) — always listed first, never filtered by the
//     typed query since they're commands, not searchable content.
//   - Database items — the user's own library (instant, local) AND the
//     platform's main-page content (async, via ai-agent-library-search.js).
//   - Single-select: picking any row (Quick-Access or a database item)
//     attaches it and immediately closes the menu — the same "click =
//     done" behavior as every other dropdown in this app
//     (.exam-dropdown-menu). A second `@` reopens it for another
//     attachment. Rows already in pendingAttachments render disabled
//     (see isAttached/buildRow) so the same item can't be attached twice.
//
// Zero dependency on ai-agent.js (openAIAgentModal/getChatPanelForPageKey) —
// same cycle-avoidance reasoning as ai-agent-item-lookup.js's own header
// comment. This module only needs a host-supplied set of callbacks
// (see createMentionMenu's options), so ai-agent-chat.js (which already has
// pendingAttachments/renderAttachmentChips/updateSendBtnVisibility in its
// own closure) stays the single owner of attachment state; this module only
// ever calls back into it.
// =============================================================================

import { searchMyLibrary, searchPlatformLibrary } from "./ai-agent-library-search.js";
import { resolveUserItemById, listRecentUserItems } from "./ai-agent-item-lookup.js";

const PLATFORM_SEARCH_DEBOUNCE_MS = 250;

// Quick-Access pseudo-items. Each `resolve` returns the same
// {kind, id, title, summary, source, payload} shape as resolveUserItemById
// (or null if there's nothing to attach yet, e.g. no quiz taken this
// session) — the menu shows a disabled row with `emptyReason` when that
// happens, rather than silently doing nothing on click.
function buildQuickAccessItems() {
    return [
        {
            quickAccessId: "Last_Created_Quiz",
            label: "@Last_Created_Quiz",
            description: "The last quiz you created",
            resolve: () => {
                const [latest] = listRecentUserItems("", 1);
                if (!latest) return { item: null, emptyReason: "You haven't created any quiz yet." };
                return { item: resolveUserItemById(latest.id), emptyReason: null };
            },
        },
        {
            quickAccessId: "Last_Taken_Quiz",
            label: "@Last_Taken_Quiz",
            description: "The last quiz you took",
            // Backed by the same `last_quiz_result` key as @Last_Quiz_Results
            // (see quiz.js's saveResultAndRedirect-equivalent, which writes both
            // this single overwritten key AND removes that quiz's own
            // quiz_state_{id} on completion) — there's no separate taken-log, so
            // "last taken" and "last result" necessarily resolve to the same
            // underlying record today. Exposed as two distinct mentions anyway
            // because they read naturally as different asks ("what quiz did I
            // last take" vs "how did I do"), and nothing prevents a future
            // per-attempt history log from splitting them apart later without
            // changing this menu's surface.
            resolve: () => resolveLastQuizResultAttachment("taken"),
        },
        {
            quickAccessId: "Last_Quiz_Results",
            label: "@Last_Quiz_Results",
            description: "The result of the last quiz you took",
            resolve: () => resolveLastQuizResultAttachment("results"),
        },
    ];
}

/**
 * Reads `last_quiz_result` (written by quiz.js on quiz completion — see
 * that file's own comment at the write site) and shapes it into an
 * attachment. `variant` only changes the title/summary phrasing between
 * the two mentions that share this one storage key (see the
 * Last_Taken_Quiz item's own comment above) — the underlying payload is
 * identical either way.
 * @param {"taken"|"results"} variant
 */
function resolveLastQuizResultAttachment(variant) {
    let result = null;
    try {
        result = JSON.parse(localStorage.getItem("last_quiz_result"));
    } catch {
        result = null;
    }
    if (!result) {
        return {
            item: null,
            emptyReason: "You haven't taken any quiz on this device yet.",
        };
    }

    const scorePart = `Score: ${result.score ?? "?"}/${result.total ?? "?"}`;
    const title = variant === "results"
        ? `Result: ${result.examTitle || "Quiz"}`
        : (result.examTitle || "Last quiz taken");
    const summary = variant === "results"
        ? scorePart
        : `${scorePart} — Question count: ${result.totalQuestions ?? result.questions?.length ?? 0}`;

    return {
        item: {
            kind: "quiz",
            id: result.examId || result.quizDbId || `last-quiz-result-${variant}`,
            dbId: result.quizDbId || null,
            title,
            summary,
            source: "local",
            // Full result payload (score/answers/questions), not just the quiz's
            // own questions — @Last_Quiz_Results specifically needs the score
            // and per-question correctness to be useful for "how did I do"-style
            // follow-ups; the quiz's `questions` array alone (present on any
            // other quiz attachment) wouldn't carry that.
            payload: result,
        },
        emptyReason: null,
    };
}

/**
 * @param {object} options
 * @param {HTMLTextAreaElement} options.textarea
 * @param {() => number} options.getPendingCount - current pendingAttachments.length
 * @param {number} options.maxPending
 * @param {(id: string) => boolean} options.isAttached - whether an id (or
 *   quickAccessId) is already in pendingAttachments, so picked rows can
 *   render as checked instead of closing the menu.
 * @param {(attachment: object) => void} options.onPick - called with a
 *   resolved {kind, id, title, ...} attachment when the user picks a row.
 * @param {(startIndex: number, endIndexExclusive: number) => void} options.onConsumeTriggerText -
 *   called to remove the `@`+query text from the textarea after a pick.
 * @param {{quiz: string, course: string, folder: string}} options.icons - the
 *   host's existing ATTACHMENT_*_ICON_SVG constants, reused rather than
 *   duplicated here.
 * @returns {{open: (startIndex: number) => void, close: () => void, isOpen: () => boolean, handleInput: () => void, handleKeydown: (e: KeyboardEvent) => boolean}}
 */
export function createMentionMenu(options) {
    const {
        textarea,
        getPendingCount,
        maxPending,
        isAttached,
        onPick,
        onConsumeTriggerText,
        icons,
        positionMenu, // (menuEl, anchorEl) => void — host's positionAgentDropdown
        getProjects = null,
    } = options;

    let menuEl = null;
    let triggerStart = -1;
    let platformDebounceTimer = null;
    let platformSearchToken = 0; // guards against a stale slow search overwriting a newer one
    let activeIndex = -1; // keyboard nav

    function iconFor(kind) {
        if (kind === "course") return icons.course;
        if (kind === "folder") return icons.folder;
        if (kind === "lesson") return icons.lesson || icons.quiz;
        return icons.quiz;
    }

    function close() {
        if (!menuEl) return;
        menuEl.remove();
        menuEl = null;
        triggerStart = -1;
        activeIndex = -1;
        clearTimeout(platformDebounceTimer);
        window.removeEventListener("resize", reposition);
        document.removeEventListener("click", onOutsideClick);
    }

    function reposition() {
        if (menuEl) positionMenu(menuEl, textarea);
    }

    function onOutsideClick(e) {
        if (!menuEl) return;
        if (menuEl.contains(e.target) || e.target === textarea) return;
        close();
    }

    function currentRows() {
        return Array.from(menuEl?.querySelectorAll("[data-mention-row]") || []);
    }

    function setActiveIndex(index) {
        const rows = currentRows().filter((row) => !row.hasAttribute("disabled"));
        if (rows.length === 0) return;
        activeIndex = ((index % rows.length) + rows.length) % rows.length;
        rows.forEach((row) => row.classList.remove("is-active"));
        rows[activeIndex]?.classList.add("is-active");
        rows[activeIndex]?.scrollIntoView({ block: "nearest" });
    }

    function safeImageUrl(value) {
        if (!value) return null;
        try {
            const url = new URL(value, window.location.origin);
            return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
        } catch {
            return null;
        }
    }

    function buildRow({ id, kind, title, description, disabled, checked, imageUrl }, onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-mention-row", "");
        if (id != null) btn.setAttribute("data-mention-row-id", id);
        btn.className = "ai-agent-dropdown-item ai-agent-mention-row" + (checked ? " is-attached" : "");
        // `checked` (already in pendingAttachments) makes the row disabled
        // too, not just visually checked — prevents attaching the exact
        // same item twice. `disabled` can also be true for its original
        // reason (an empty Quick-Access item, e.g. no quiz taken yet).
        if (disabled || checked) btn.setAttribute("disabled", "");
        // Latin/ASCII labels (Quick-Access rows: "@Last_Created_Quiz" etc.)
        // must stay LTR, or the `@` and word order visually reverse (see
        // this module's own bug history — the `@` rendering trailing/last
        // was exactly this). Titles/descriptions from searched items are
        // unaffected since `dir="auto"` reads their own script direction
        // per line.
        const imageSrc = safeImageUrl(imageUrl);
        if (imageSrc) {
            const image = document.createElement("img");
            image.className = "ai-agent-mention-row-thumb";
            image.src = imageSrc;
            image.alt = "";
            image.loading = "eager";
            btn.appendChild(image);
        } else {
            const icon = document.createElement("span");
            icon.className = "ai-agent-mention-row-icon";
            icon.innerHTML = iconFor(kind);
            btn.appendChild(icon);
        }

        const text = document.createElement("span");
        text.className = "ai-agent-mention-row-text";
        const titleEl = document.createElement("span");
        titleEl.className = "ai-agent-mention-row-title";
        titleEl.dir = "auto";
        titleEl.textContent = title;
        text.appendChild(titleEl);
        if (description) {
            const descriptionEl = document.createElement("span");
            descriptionEl.className = "ai-agent-mention-row-desc";
            descriptionEl.dir = "auto";
            descriptionEl.textContent = description;
            text.appendChild(descriptionEl);
        }
        btn.appendChild(text);

        const check = document.createElement("span");
        check.className = "ai-agent-mention-row-check";
        check.setAttribute("aria-hidden", "true");
        check.textContent = "✓";
        btn.appendChild(check);
        if (!disabled && !checked) {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                onClick();
            });
        }
        return btn;
    }

    function renderSectionHeader(text) {
        const header = document.createElement("div");
        header.className = "ai-agent-mention-section-header";
        header.textContent = text;
        return header;
    }

    /**
     * Attaches the picked item and closes the menu immediately — same
     * "click = done" behavior as every other dropdown in this app
     * (.exam-dropdown-menu). A second `@` reopens the menu for another
     * attachment; isAttached (see buildRow's `checked`/`disabled` wiring)
     * keeps an already-picked item from being picked again in that next
     * session.
     * @param {object} attachment
     */
    function pickAndClose(attachment) {
        if (!attachment) return;
        if (getPendingCount() >= maxPending) return;
        onPick(attachment);
        // Consume the `@`+query text (see open()'s own comment on the
        // triggerStart convention for why it's triggerStart - 1) so it
        // doesn't linger in the input alongside the chip that now
        // represents it.
        onConsumeTriggerText(triggerStart - 1, textarea.selectionStart);
        close();
        textarea.focus();
    }

    async function render(query) {
        if (!menuEl) return;
        menuEl.innerHTML = "";
        activeIndex = -1;

        const atCap = getPendingCount() >= maxPending;
        if (atCap) {
            const full = document.createElement("div");
            full.className = "ai-agent-trigger-menu-empty";
            full.textContent = "Maximum number of attachments reached.";
            menuEl.appendChild(full);
            return;
        }

        if (typeof getProjects === "function") {
            const section = renderSectionHeader("Published projects");
            menuEl.appendChild(section);
            const resultsHost = document.createElement("div");
            resultsHost.className = "ai-agent-mention-project-results";
            resultsHost.innerHTML = '<div class="ai-agent-mention-loading">Loading published projects…</div>';
            menuEl.appendChild(resultsHost);
            reposition();
            const myToken = ++platformSearchToken;
            try {
                const projects = await getProjects();
                if (myToken !== platformSearchToken || !menuEl) return;
                const cleanQuery = query.trim().toLocaleLowerCase();
                const filtered = projects.filter((project) => {
                    const searchable = `${project.title || ""} ${project.category || ""} ${project.summary || ""}`;
                    return searchable.toLocaleLowerCase().includes(cleanQuery);
                });
                resultsHost.replaceChildren();
                if (!filtered.length) {
                    const empty = document.createElement("div");
                    empty.className = "ai-agent-trigger-menu-empty";
                    empty.textContent = query
                        ? "No published projects match that search."
                        : "No published projects are available.";
                    resultsHost.appendChild(empty);
                } else {
                    filtered.forEach((project) => {
                        const title = project.title || "Untitled project";
                        const row = buildRow(
                            {
                                id: project.id,
                                kind: "project",
                                title,
                                description: project.category || project.summary || "",
                                imageUrl: project.image_url,
                                checked: isAttached(project.id),
                            },
                            () => pickAndClose({
                                kind: "project",
                                id: project.id,
                                title,
                                summary: project.summary || "",
                                category: project.category || "",
                                project_url: project.project_url || "",
                                github_url: project.github_url || "",
                                image_url: project.image_url || "",
                                source: "portfolio",
                            }),
                        );
                        resultsHost.appendChild(row);
                    });
                }
                reposition();
            } catch (error) {
                if (myToken !== platformSearchToken || !menuEl) return;
                console.error("[ai-agent-mention-menu] published projects failed to load:", error);
                resultsHost.replaceChildren();
                const failure = document.createElement("div");
                failure.className = "ai-agent-trigger-menu-empty";
                failure.textContent = "Published projects could not be loaded. Please try again later.";
                resultsHost.appendChild(failure);
                reposition();
            }
            return;
        }

        // ── Quick-Access section — unfiltered by query, always visible ──
        menuEl.appendChild(renderSectionHeader("Quick Access"));
        buildQuickAccessItems().forEach((qa) => {
            const attachedAlready = isAttached(qa.quickAccessId);
            const { item, emptyReason } = qa.resolve();
            const row = buildRow(
                {
                    id: qa.quickAccessId,
                    kind: item?.kind || "quiz",
                    title: qa.label,
                    description: emptyReason || qa.description,
                    disabled: !item,
                    checked: attachedAlready,
                },
                () => pickAndClose(item ? { ...item, id: item.id || qa.quickAccessId } : null),
            );
            menuEl.appendChild(row);
        });

        // ── "Your Library" — instant, local ──
        const localSectionHeader = renderSectionHeader("Your Library");
        menuEl.appendChild(localSectionHeader);

        const renderLocal = () => {
            const items = searchMyLibrary(query, 6);
            if (items.length === 0) {
                const empty = document.createElement("div");
                empty.className = "ai-agent-trigger-menu-empty";
                empty.textContent = query ? "No results in your library." : "Nothing in your library yet.";
                menuEl.appendChild(empty);
            } else {
                items.forEach((it) => {
                    const row = buildRow(
                        { id: it.id, kind: it.kind, title: it.title, checked: isAttached(it.id) },
                        () => pickAndClose(resolveUserItemById(it.id)),
                    );
                    menuEl.appendChild(row);
                });
            }
        };
        renderLocal();

        // ── "Main Page" (platform) — async, own header+state ──
        // Kept as its own section (own header, own empty/loading message)
        // rather than sharing one combined header+message with "Your
        // Library" above — the old combined section made it look like one
        // bucket of results with no way to tell which item came from
        // where, and a single shared loading/empty message that didn't
        // actually reflect "Your Library" (which is never loading — it's
        // synchronous).
        menuEl.appendChild(renderSectionHeader("Main Page"));
        const loadingPlatformResultsHost = document.createElement("div");
        menuEl.appendChild(loadingPlatformResultsHost);
        loadingPlatformResultsHost.innerHTML = '<div class="ai-agent-mention-loading">Searching the main page…</div>';
        reposition();

        // Debounced: only the network half. Local results above already
        // re-rendered synchronously on this exact call, so typing quickly
        // never delays what's already resolvable instantly — it only delays
        // (and coalesces) the repeated Supabase-backed manifest reads.
        const myToken = ++platformSearchToken;
        clearTimeout(platformDebounceTimer);
        platformDebounceTimer = setTimeout(async () => {
            if (myToken !== platformSearchToken || !menuEl) return; // superseded before it even started
            try {
                const platformItems = await searchPlatformLibrary(query, 6);
                if (myToken !== platformSearchToken || !menuEl) return; // stale / menu closed meanwhile
                loadingPlatformResultsHost.innerHTML = "";
                if (platformItems.length === 0) {
                    const empty = document.createElement("div");
                    empty.className = "ai-agent-trigger-menu-empty";
                    empty.textContent = query ? "No results on the main page." : "Nothing to show here yet.";
                    menuEl.appendChild(empty);
                } else {
                    platformItems.forEach((it) => {
                        const row = buildRow(
                            { id: it.id, kind: it.kind, title: it.title, checked: isAttached(it.id) },
                            () => pickAndClose({ ...it }),
                        );
                        menuEl.appendChild(row);
                    });
                }
            } catch {
                if (myToken !== platformSearchToken || !menuEl) return;
                loadingPlatformResultsHost.innerHTML = '<div class="ai-agent-trigger-menu-empty">Couldn\'t search the main page right now.</div>';
            }
            reposition();
        }, PLATFORM_SEARCH_DEBOUNCE_MS);
    }

    // `atCharIndex` is the index of the literal `@` character in
    // textarea.value. Internally, triggerStart is normalized to point one
    // past it (the first query character).
    function open(atCharIndex) {
        close();
        triggerStart = atCharIndex + 1;
        menuEl = document.createElement("div");
        menuEl.className = "ai-agent-dropdown-menu ai-agent-mention-menu";
        menuEl.setAttribute("role", "menu");
        menuEl.style.visibility = "hidden";
        document.body.appendChild(menuEl);
        render("");
        positionMenu(menuEl, textarea);
        menuEl.style.visibility = "visible";
        window.addEventListener("resize", reposition);
        // Deferred one tick — same reasoning as the menu this replaces: the
        // very `@` keydown that opens it is still bubbling, and a click-type
        // outside-click listener registered synchronously could otherwise
        // race it shut immediately on some input paths.
        setTimeout(() => document.addEventListener("click", onOutsideClick), 0);
    }

    function handleInput() {
        if (!menuEl) return false;
        const caret = textarea.selectionStart;

        if (caret <= triggerStart) {
            close();
            return false;
        }
        const query = textarea.value.slice(triggerStart, caret);
        if (/\s/.test(query)) {
            close();
            return false;
        }
        clearTimeout(platformDebounceTimer);
        // Local results re-render immediately inside render(); the debounce
        // here only throttles how often the platform network call fires while
        // the user is still actively typing.
        render(query);
        return true;
    }

    function handleKeydown(e) {
        if (!menuEl) return false;
        // Escape backs out WITHOUT consuming the typed `@`+query text — the
        // user is cancelling the mention, not selecting anything, so the text
        // they typed should stay editable exactly as-is (matches the menu this
        // replaces: Escape there was a plain close(), no text removal either).
        if (e.key === "Escape") {
            close();
            return true;
        }
        if (e.key === "ArrowDown") {
            setActiveIndex(activeIndex + 1);
            return true;
        }
        if (e.key === "ArrowUp") {
            setActiveIndex(activeIndex - 1);
            return true;
        }
        if (e.key === "Enter") {
            // Explicit choice for "nothing highlighted yet" (the brief's own
            // open question): swallow Enter rather than either (a) falling
            // through to the textarea's default Enter-sends-the-message
            // behavior while the menu is still visibly open with an
            // unconsumed "@query" in the text, or (b) silently picking row
            // 0 on the user's behalf — attaching an item they never
            // highlighted just because they hit Enter out of chat muscle
            // memory would be a surprising, hard-to-undo side effect. An
            // arrow key first (landing on index 0 via setActiveIndex's own
            // wrap math) is the explicit way to select the first row.
            if (activeIndex < 0) return true;
            const rows = currentRows().filter((row) => !row.hasAttribute("disabled"));
            rows[activeIndex]?.click();
            return true;
        }
        if (e.key === "Tab") {
            // Tab has no other job while this menu is open (the textarea is
            // a single-field form, so there's nothing further to tab to
            // inside the modal that would make sense to jump to instead).
            // Same "don't act without an explicit highlight" reasoning as
            // Enter above: with nothing highlighted, swallow it rather than
            // falling through to the browser's default focus-move (which
            // would silently shift focus off the textarea while the menu
            // stayed open) or silently picking row 0.
            // preventDefault/stopPropagation both happen at the call site
            // (ai-agent-chat.js's keydown listener) whenever this function
            // returns true, same as every other handled key here.
            if (activeIndex < 0) return true;
            const rows = currentRows().filter((row) => !row.hasAttribute("disabled"));
            rows[activeIndex]?.click();
            return true;
        }
        return false;
    }

    return {
        open,
        close,
        isOpen: () => Boolean(menuEl),
        handleInput,
        handleKeydown,
        getTriggerStart: () => triggerStart,
    };
}