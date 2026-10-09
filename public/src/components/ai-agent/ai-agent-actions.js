// =============================================================================
// public/src/components/ai-agent/ai-agent-actions.js
// Modular Actions (Slash Commands) system & Registry for AI Helper.
//
// Provides:
//   1. Action Registry: Allows pages or plugins to register their own
//      slash command actions (plugin/registry pattern), with zero hardcoded
//      page knowledge in the agent core.
//   2. Built-in defaults: Sensible page-specific action sets for home,
//      create-quiz, create-lesson, lesson view, and result pages.
//   3. Slash Command Dropdown Menu (createSlashMenu): Renders an anchored
//      popover when user types `/`, supporting keyboard navigation,
//      fuzzy/substring filtering, and auto-insertion into the textarea.
//   4. Direct Execution Directives: Explicit slash commands instruct the AI
//      to execute tools immediately with NO confirmation step.
// =============================================================================

// Standard SVG icons for actions
const ICON_QUIZ = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
const ICON_FOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
const ICON_COURSE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
const ICON_QUESTION = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;
const ICON_SPARKLE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;
const ICON_TRASH = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
const ICON_ANALYZE = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`;
const ICON_LESSON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
const ICON_SECTION = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16"/><path d="M4 12h10"/><path d="M4 19h7"/><path d="M19 14v6"/><path d="M16 17h6"/></svg>`;

// Registry maps
const pageActionsRegistry = new Map();
const patternActionsRegistry = [];

/**
 * Registers an array of actions for a given pageKey or pattern matcher.
 * @param {string|((key: string) => boolean)|RegExp} pageKeyOrMatcher
 * @param {Array<object>} actions
 */
export function registerPageActions(pageKeyOrMatcher, actions) {
    if (typeof pageKeyOrMatcher === "function" || pageKeyOrMatcher instanceof RegExp) {
        patternActionsRegistry.push({ matcher: pageKeyOrMatcher, actions });
    } else {
        pageActionsRegistry.set(pageKeyOrMatcher, actions);
    }
}

/**
 * Unregisters actions for a given pageKey or pattern matcher.
 * @param {string|((key: string) => boolean)|RegExp} pageKeyOrMatcher
 */
export function unregisterPageActions(pageKeyOrMatcher) {
    if (typeof pageKeyOrMatcher === "function" || pageKeyOrMatcher instanceof RegExp) {
        const idx = patternActionsRegistry.findIndex((p) => p.matcher === pageKeyOrMatcher);
        if (idx !== -1) patternActionsRegistry.splice(idx, 1);
    } else {
        pageActionsRegistry.delete(pageKeyOrMatcher);
    }
}

/**
 * Retrieves the registered actions for a given pageKey.
 * Checks instanceActions first, then exact pageKey, then pattern matchers.
 * @param {string} pageKey
 * @param {Array<object>} [instanceActions]
 * @returns {Array<object>}
 */
export function getPageActions(pageKey, instanceActions = null) {
    if (Array.isArray(instanceActions)) {
        return instanceActions;
    }
    const key = pageKey || "default";
    if (pageActionsRegistry.has(key)) {
        return pageActionsRegistry.get(key) || [];
    }
    for (const entry of patternActionsRegistry) {
        if (typeof entry.matcher === "function" && entry.matcher(key)) {
            return entry.actions || [];
        }
        if (entry.matcher instanceof RegExp && entry.matcher.test(key)) {
            return entry.actions || [];
        }
    }
    return [];
}

// ── Built-in Standard Action Sets ─────────────────────────────────────────────

// Home page actions ("your library")
const HOME_PAGE_ACTIONS = [
    {
        id: "create-lesson",
        command: "create-lesson",
        label: "Create Lesson",
        description: "Create a new lesson with sections and educational content, and save it to your library",
        icon: ICON_LESSON,
        systemDirective: "The user explicitly invoked /create-lesson. Prepare a lesson with a title, description, ordered sections, Markdown blocks, and suitable embedded interactive MCQ or essay questions. Use zero-based correctIndex/correctIndexes, multiSelect for multiple answers, explanations for MCQs, and a complete modelAnswer for essays. Call create_lesson immediately to save it in the user's library without confirmation.",
        placeholder: "Lesson topic and the level of detail you need...",
    },
    {
        id: "create-quiz",
        command: "create-quiz",
        label: "Create Quiz",
        description: "Create a new quiz and save it directly to your library",
        icon: ICON_QUIZ,
        systemDirective: "The user explicitly requested creating a new quiz via the /create-quiz command. Execute the action immediately and call the create_quiz tool to save it to the user's library, without asking for any prior confirmation.",
        placeholder: "Write the quiz topic and number of questions...",
    },
    {
        id: "create-folder",
        command: "create-folder",
        label: "Create Folder",
        description: "Create a new folder to organize and arrange your library",
        icon: ICON_FOLDER,
        systemDirective: "The user explicitly requested creating a new folder via the /create-folder command. Call the create_folder tool immediately without asking for confirmation.",
        placeholder: "Folder name and location...",
    },
    {
        id: "create-course",
        command: "create-course",
        label: "Create Course",
        description: "Create a new course at the top level",
        icon: ICON_COURSE,
        systemDirective: "The user explicitly requested creating a new course via the /create-course command. Call the create_course tool immediately without asking for confirmation.",
        placeholder: "Course name...",
    },
];

// Create Quiz page actions ("Create Quiz")
const CREATE_QUIZ_PAGE_ACTIONS = [
    {
        id: "generate-quiz",
        command: "generate-quiz",
        label: "Generate Quiz",
        description: "Generate the quiz content and fill it directly into the current form",
        icon: ICON_SPARKLE,
        systemDirective: "The user explicitly requested generating or replacing the current quiz's questions via the /generate-quiz command. Call the edit_current_quiz tool immediately and place the new questions in the form without asking for confirmation.",
        placeholder: "Quiz topic, number of questions, and type...",
    },
    {
        id: "add-questions",
        command: "add-questions",
        label: "Add Questions",
        description: "Add new questions to the current quiz while keeping the existing ones",
        icon: ICON_QUESTION,
        systemDirective: "The user requested adding new questions to the current quiz via the /add-questions command. Call the edit_current_quiz tool, keeping all existing questions and adding the new ones, without asking for confirmation.",
        placeholder: "Write the questions to add, or their topic...",
    },
    {
        id: "clear-quiz",
        command: "clear-quiz",
        label: "Clear Form",
        description: "Clear all fields and questions in the current form and reset the page",
        icon: ICON_TRASH,
        systemDirective: "The user explicitly requested clearing the page entirely via the /clear-quiz command. Call the reset_quiz_page tool immediately without asking for confirmation.",
    },
];

// Lesson Reader page actions ("lesson page")
const LESSON_PAGE_ACTIONS = [
    {
        id: "create-quiz",
        command: "create-quiz",
        label: "Create Practice from Lesson",
        description: "Create a temporary interactive practice set from this entire lesson's content, shown only within the page",
        icon: ICON_QUIZ,
        systemDirective: "The user explicitly requested creating a temporary interactive practice set from this lesson's content via the /create-quiz command. Extract questions from the full lesson and call the create_quiz tool immediately to display the practice set within the lesson page. This practice set is temporary and is never saved to or shown in the user's library — do not ask for confirmation.",
        placeholder: "Number of questions or sections to focus on...",
    },
    {
        id: "create-quiz-section",
        command: "create-quiz-section",
        label: "Practice From Current Section Only",
        description: "Create a temporary interactive practice set covering only the section the user is currently reading, not the whole lesson",
        icon: ICON_QUIZ,
        systemDirective: "The user requested creating a temporary interactive practice set from only the current section (not the whole lesson) via the /create-quiz-section command. Use only the current section referenced in the page context as the source for questions, and call the create_quiz tool immediately to display the practice set within the lesson page without asking for confirmation. This practice set is temporary and is not saved to the user's library.",
        placeholder: "Number of questions needed from this section...",
    },
    {
        id: "explain",
        command: "explain",
        label: "Explain & Simplify",
        description: "A detailed, simplified explanation of this lesson's key points and concepts",
        icon: ICON_LESSON,
        systemDirective: "The user requested an explanation and simplification of the lesson via the /explain command. Provide an engaging, simplified, educational explanation.",
        placeholder: "Which concept would you like explained specifically?...",
    },
    {
        id: "simplify-section",
        command: "simplify",
        label: "Simplify Current Section",
        description: "Rephrase the section the user is currently reading in a simpler style",
        icon: ICON_LESSON,
        systemDirective: "The user requested simplifying the current section via the /simplify command. Rephrase only the current section's ideas (as referenced in the page context) in simpler language and clearer examples, without cutting important information.",
        placeholder: "Which specific part would you like simplified?...",
    },
    {
        id: "flashcards",
        command: "flashcards",
        label: "Flashcards",
        description: "Generate review flashcards (question/answer) from this lesson's key ideas — for studying only, not saved",
        icon: ICON_SPARKLE,
        systemDirective: "The user requested flashcards from this lesson via the /flashcards command. Write a series of flashcards, each in the format 'Question: ... / Answer: ...', covering the lesson's key concepts. These are text-only study cards within the conversation, not an interactive practice set, and are not saved anywhere.",
        placeholder: "Number of cards or topic to focus on...",
    },
    {
        id: "summarize-full-lesson",
        command: "summarize",
        label: "Summarize Full Lesson",
        description: "A comprehensive, focused summary of all the lesson's sections",
        icon: ICON_LESSON,
        systemDirective: "The user requested a comprehensive summary of the entire lesson via the /summarize command. Summarize all sections in a focused, organized way, not just one section.",
    },
    {
        id: "practice-weak-topic",
        command: "practice",
        label: "Practice a Specific Point",
        description: "Text-based (non-interactive) practice questions on a specific concept the user feels weak on",
        icon: ICON_QUESTION,
        systemDirective: "The user requested additional practice questions on a specific concept they feel weak on via the /practice command. Write text-based questions (not via the create_quiz tool) focused on the point the user mentions, including the correct answer and why it's correct for each question.",
        placeholder: "What point or concept would you like to practice?...",
    },
];

// Create Lesson page actions ("lesson editor")
const CREATE_LESSON_PAGE_ACTIONS = [
    {
        id: "create-lesson",
        command: "create-lesson",
        label: "Create Lesson Content",
        description: "Create the lesson's title, sections, and content in the current editor",
        icon: ICON_LESSON,
        systemDirective: "The user explicitly invoked /create-lesson. Create a title, description, ordered sections with Markdown blocks, and suitable embedded interactive MCQ or essay questions. Use zero-based correctIndex/correctIndexes, multiSelect for multiple answers, MCQ explanations, and a complete modelAnswer for essays. Call create_lesson immediately to fill the current editor without confirmation.",
        placeholder: "Lesson topic and the level of detail you need...",
    },
    {
        id: "add-section",
        command: "add-section",
        label: "Add Section",
        description: "Add a new section and educational content to the current lesson",
        icon: ICON_SECTION,
        systemDirective: "The user explicitly requested adding a section via the /add-section command. Create the section's title and content, then call the add_lesson_section tool immediately without asking for confirmation.",
        placeholder: "Section title and content...",
    },
    {
        id: "add-question",
        command: "add-question",
        label: "Add Question to Lesson",
        description: "Draft and insert a new interactive question into the current lesson",
        icon: ICON_QUESTION,
        systemDirective: "The user explicitly requested adding an interactive question to the lesson via the /add-question command. Call the add_lesson_question tool immediately to insert the question into the lesson without asking for confirmation.",
        placeholder: "Write the question's wording or idea, and its section...",
    },
    {
        id: "summarize-lesson",
        command: "summarize-lesson",
        label: "Summarize Lesson",
        description: "Generate a focused, comprehensive summary of the lesson's points and sections",
        icon: ICON_LESSON,
        systemDirective: "The user requested a summary of the lesson via the /summarize-lesson command. Provide a clear summary of the lesson's sections.",
    },
];

// Result page actions ("result page")
const RESULT_PAGE_ACTIONS = [
    {
        id: "analyze-result",
        command: "analyze-result",
        label: "Analyze Result",
        description: "A detailed analysis of your quiz performance, identifying strengths and weaknesses",
        icon: ICON_ANALYZE,
        systemDirective: "The user requested a detailed analysis of their result via the /analyze-result command. Analyze the performance and provide a comprehensive assessment.",
    },
    {
        id: "recommendations",
        command: "recommendations",
        label: "Recommendations & Review Plan",
        description: "Suggest a custom review plan focused on incorrect and skipped questions",
        icon: ICON_SPARKLE,
        systemDirective: "The user requested a plan and recommendations via the /recommendations command. Provide a practical, direct review plan.",
    },
];

// Register the defaults
registerPageActions("home", HOME_PAGE_ACTIONS);
registerPageActions("create", CREATE_QUIZ_PAGE_ACTIONS);
registerPageActions("create-lesson", CREATE_LESSON_PAGE_ACTIONS);
registerPageActions((key) => key && key.startsWith("lesson-"), LESSON_PAGE_ACTIONS);
registerPageActions("result", RESULT_PAGE_ACTIONS);

// ── Slash Dropdown Menu Component ─────────────────────────────────────────────

/**
 * Creates the slash command dropdown menu controller.
 * @param {object} options
 * @param {HTMLTextAreaElement} options.textarea
 * @param {() => Array<object>} options.getActions
 * @param {(action: object) => void} options.onPick
 * @param {(menu: HTMLElement, anchor: HTMLElement) => void} options.positionMenu
 * @returns {{open: (slashIndex: number) => void, close: () => void, isOpen: () => boolean, handleInput: () => boolean, handleKeydown: (e: KeyboardEvent) => boolean, getTriggerStart: () => number}}
 */
export function createSlashMenu(options) {
    const { textarea, getActions, onPick, positionMenu } = options;

    let menuEl = null;
    let triggerStart = -1; // index of the '/' character
    let activeIndex = -1;
    let currentActions = [];

    function close() {
        if (!menuEl) return;
        menuEl.remove();
        menuEl = null;
        triggerStart = -1;
        activeIndex = -1;
        currentActions = [];
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
        return Array.from(menuEl?.querySelectorAll("[data-slash-row]") || []);
    }

    function setActiveIndex(index) {
        const rows = currentRows();
        if (rows.length === 0) return;
        activeIndex = ((index % rows.length) + rows.length) % rows.length;
        rows.forEach((row, i) => {
            row.classList.toggle("is-active", i === activeIndex);
        });
        rows[activeIndex]?.scrollIntoView({ block: "nearest" });
    }

    function buildRow(action, index) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-slash-row", "");
        btn.className = "ai-agent-dropdown-item ai-agent-slash-row" + (index === activeIndex ? " is-active" : "");

        btn.innerHTML = `
      <div class="ai-agent-slash-row-icon" aria-hidden="true">${action.icon || ICON_SPARKLE}</div>
      <span class="ai-agent-slash-row-text">
        <span class="ai-agent-slash-row-header">
          <span class="ai-agent-slash-row-title" dir="auto">${action.label}</span>
          <span class="ai-agent-slash-row-cmd" dir="ltr">/${action.command}</span>
        </span>
        ${action.description ? `<span class="ai-agent-slash-row-desc" dir="auto">${action.description}</span>` : ""}
      </span>
    `;

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            onPick(action);
            close();
        });

        return btn;
    }

    function render(query = "") {
        if (!menuEl) return;
        menuEl.innerHTML = "";

        const allActions = getActions() || [];
        const cleanQuery = (query || "").trim().toLowerCase();

        currentActions = cleanQuery
            ? allActions.filter((a) => {
                const cmd = (a.command || "").toLowerCase();
                const label = (a.label || "").toLowerCase();
                const desc = (a.description || "").toLowerCase();
                return cmd.includes(cleanQuery) || label.includes(cleanQuery) || desc.includes(cleanQuery);
            })
            : allActions;

        if (currentActions.length === 0) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "ai-agent-slash-empty";
            emptyEl.textContent = cleanQuery ? "No matching commands" : "No commands available for this page";
            menuEl.appendChild(emptyEl);
            activeIndex = -1;
            reposition();
            return;
        }

        const sectionHeader = document.createElement("div");
        sectionHeader.className = "ai-agent-mention-section-header ai-agent-slash-section-header";
        sectionHeader.textContent = "Available commands";
        menuEl.appendChild(sectionHeader);

        activeIndex = 0;
        currentActions.forEach((action, idx) => {
            menuEl.appendChild(buildRow(action, idx));
        });

        reposition();
    }

    function open(slashCharIndex) {
        close();
        const available = getActions();
        if (!available || available.length === 0) {
            return; // No actions for this page, don't open
        }

        triggerStart = slashCharIndex;
        menuEl = document.createElement("div");
        menuEl.className = "ai-agent-dropdown-menu ai-agent-slash-menu";
        menuEl.setAttribute("role", "menu");
        menuEl.style.visibility = "hidden";
        document.body.appendChild(menuEl);

        render("");
        positionMenu(menuEl, textarea);
        menuEl.style.visibility = "visible";

        window.addEventListener("resize", reposition);
        setTimeout(() => document.addEventListener("click", onOutsideClick), 0);
    }

    function handleInput() {
        if (!menuEl) return false;
        const caret = textarea.selectionStart;

        // User erased the '/'
        if (caret <= triggerStart) {
            close();
            return false;
        }

        // Query text between '/' and caret
        const raw = textarea.value.slice(triggerStart + 1, caret);
        if (/\s/.test(raw)) {
            // Whitespace encountered — user moved on to args
            close();
            return false;
        }

        render(raw);
        return true;
    }

    function handleKeydown(e) {
        if (!menuEl) return false;

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
        if (e.key === "Enter" || e.key === "Tab") {
            if (activeIndex >= 0 && currentActions[activeIndex]) {
                onPick(currentActions[activeIndex]);
                close();
                return true;
            }
            if (currentActions.length === 0) {
                close();
                return true;
            }
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