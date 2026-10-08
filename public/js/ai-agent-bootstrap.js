import { createAIAgentFab } from "../src/components/ai-agent/ai-agent.js";

const systemPrompt = [
  "Answer questions about Belal Amr Mohamed, his skills, contact information, and published portfolio projects.",
  "Use the portfolio database context supplied by the server. Never invent private information or claim to be Belal.",
  "When useful, include project links and keep answers concise.",
].join(" ");

const agent = createAIAgentFab({
  pageKey: "portfolio",
  defaultSystemPrompt: systemPrompt,
  placeholder: "Ask about Belal or his projects…",
  suggestedPrompts: [
    "Which projects are featured?",
    "Tell me about Belal's published work",
    "What does Belal's portfolio focus on?",
  ],
  enableTools: false,
  enableFileUpload: true,
  enableMentions: false,
  enableActions: false,
});

document.body.appendChild(agent);
