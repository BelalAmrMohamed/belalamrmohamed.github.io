// =============================================================================
// public/src/components/ai-agent/ai-agent-suggested-prompts.js
// Default "quick prompt" chips shown above the chat input before the user
// sends their first message — one tap fills + sends that exact text. Mirrors
// ai-agent-default-prompts.js's pattern: home page is a static list, result
// page is a function since good suggestions there depend on the actual
// attempt (see buildResultSuggestedPrompts).
// =============================================================================

export const HOME_PAGE_SUGGESTED_PROMPTS = [
  "What can you do?",
  "Show me my current quizzes",
  "Create a new quiz from this file",
  "Check my last quiz and tell me if there are any mistakes.",
];

// Create-quiz page ("Create Quiz") — scoped to the single in-progress
// quiz on that page, unlike HOME_PAGE_SUGGESTED_PROMPTS above which talks
// about "your quizzes" (plural, picked from a list).
export const CREATE_QUIZ_PAGE_SUGGESTED_PROMPTS = [
  "Add a new question on the same topic",
  "Turn this file into multiple-choice questions",
  "Review the current questions and tell me if anything's wrong",
];

export const LESSON_PAGE_SUGGESTED_PROMPTS = [
  "Summarize this lesson in simple points",
  "Explain the hardest idea in this lesson with an example",
  "Suggest practice questions for this lesson",
  "Create an interactive quiz from this lesson",
];

export const CREATE_LESSON_PAGE_SUGGESTED_PROMPTS = [
  "Suggest a multiple-choice question for this lesson",
  "Add an essay question with a model answer",
  "Suggest a question with multiple correct answers",
];

/**
 * @param {object} summary - same shape as resultSummaryForAI in result.js
 * @returns {string[]}
 */
export function buildResultSuggestedPrompts(summary) {
  const prompts = ["What were my mistakes?", "What should I focus on studying to improve?"];

  if (Array.isArray(summary?.questions) && summary.questions.length) {
    prompts.push("Explain the first question I got wrong");
  }
  if (typeof summary?.percentage === "number" && summary.percentage < 50) {
    prompts.push("Am I studying the right way?");
  }

  return prompts;
}