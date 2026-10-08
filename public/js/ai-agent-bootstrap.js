import { createAIAgentFab } from "../src/components/ai-agent/ai-agent.js";

const PROJECT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';
const PROFILE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
const CONTACT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';

function normalizeName(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
}

function safePublicUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function markdownText(value) {
  return String(value || "").replace(/([\\`*_{}[\]()#+\-.!>])/g, "\\$1");
}

async function getPublishedProjects() {
  const ready = window.BELAL_PORTFOLIO_PROJECTS_READY;
  if (!ready || typeof ready.then !== "function") {
    throw new Error("The published portfolio project loader is unavailable.");
  }
  await ready;
  if (!Array.isArray(window.BELAL_PORTFOLIO_PROJECTS)) {
    throw new Error("Published portfolio projects could not be loaded.");
  }
  return window.BELAL_PORTFOLIO_PROJECTS;
}

function getPublishedContacts() {
  const links = Array.from(document.querySelectorAll("#contact a[href], .intro-social a[href]"));
  const methods = new Map();
  const definitions = [
    { command: "email", label: "Email", matches: (href) => href.toLowerCase().startsWith("mailto:") },
    { command: "whatsapp", label: "WhatsApp", matches: (href) => /^https?:\/\/(?:www\.)?wa\.me\//i.test(href) },
    { command: "telegram", label: "Telegram", matches: (href) => /^(?:https?:\/\/)?(?:www\.)?t\.me\//i.test(href) },
    { command: "github", label: "GitHub", matches: (href) => /^https?:\/\/(?:www\.)?github\.com\//i.test(href) },
    { command: "phone", label: "Phone", matches: (href) => href.toLowerCase().startsWith("tel:") },
    { command: "upwork", label: "Upwork", matches: (href) => /^https?:\/\/(?:www\.)?upwork\.com\//i.test(href) },
    { command: "mostaql", label: "Mostaql", matches: (href) => /^https?:\/\/(?:www\.)?mostaql\.com\//i.test(href) },
    { command: "linkedin", label: "LinkedIn", matches: (href) => /^https?:\/\/(?:www\.)?linkedin\.com\//i.test(href) },
  ];

  for (const definition of definitions) {
    const link = links.find((candidate) => definition.matches(candidate.getAttribute("href") || ""));
    if (!link) continue;
    let href = link.getAttribute("href").trim();
    if (definition.command === "telegram" && !/^https?:\/\//i.test(href)) {
      href = `https://${href}`;
    }
    const safeHref = definition.command === "email" || definition.command === "phone"
      ? href
      : safePublicUrl(href);
    if (safeHref) methods.set(definition.command, { ...definition, href: safeHref });
  }

  return [...methods.values()];
}

function projectResult(project) {
  const title = markdownText(project.title || "Untitled project");
  const imageUrl = safePublicUrl(project.image_url);
  const websiteUrl = safePublicUrl(project.project_url);
  const sourceUrl = safePublicUrl(project.github_url);
  const lines = [];

  if (imageUrl) lines.push(`![${title}](${imageUrl})`, "");
  lines.push(`**${title}**`);
  if (project.category) lines.push(`\n**Category:** ${markdownText(project.category)}`);
  if (project.summary) lines.push(`\n${markdownText(project.summary)}`);
  if (websiteUrl) lines.push(`\n[Visit project](${websiteUrl})`);
  if (sourceUrl) lines.push(`[Source code](${sourceUrl})`);
  return lines.join("\n");
}

async function showProject(query) {
  const projects = await getPublishedProjects();
  const term = normalizeName(query);
  if (!term) {
    const names = projects.map((project) => project.title).filter(Boolean);
    return names.length
      ? `Enter a project name after the command, for example **/show_project ${markdownText(names[0])}**.\n\nPublished projects: ${names.map(markdownText).join(", ")}`
      : "There are no published projects to show right now.";
  }

  const exact = projects.filter((project) => normalizeName(project.title) === term);
  const matches = exact.length
    ? exact
    : projects.filter((project) => normalizeName(project.title).includes(term));
  if (matches.length === 1) return projectResult(matches[0]);
  if (matches.length > 1) {
    return `More than one published project matches **${markdownText(query)}**. Please use a more specific name:\n\n${matches.map((project) => `- ${markdownText(project.title)}`).join("\n")}`;
  }
  return `I couldn't find a published project matching **${markdownText(query)}**. Check the project name and try again.`;
}

function getProfileSummary() {
  const about = document.querySelector("#about .attention-getter")?.textContent.trim();
  return about || "The portfolio does not currently publish a profile summary.";
}

function createPortfolioActions() {
  const actions = [
    {
      id: "show_project",
      command: "show_project",
      label: "Show a project",
      description: "Display a published project with its available details and image.",
      icon: PROJECT_ICON,
      execute: showProject,
    },
    {
      id: "show_belal_amr",
      command: "show_belal_amr",
      label: "About Belal Amr",
      description: "Show Belal's published profile and picture.",
      icon: PROFILE_ICON,
      execute: () =>
        `![Belal Amr Mohamed](/images/about-photo.png)\n\n**Belal Amr Mohamed**\n\n${markdownText(getProfileSummary())}`,
    },
  ];

  const contacts = getPublishedContacts();
  if (contacts.length) {
    actions.push({
      id: "get_communications",
      command: "get_communications",
      label: "Contact Belal",
      description: "Show the contact methods published on this portfolio.",
      icon: CONTACT_ICON,
      execute: () =>
        `Contact methods published on this portfolio:\n\n${contacts.map((method) => `- [${method.label}](${method.href})`).join("\n")}`,
    });
  }
  for (const method of contacts) {
    actions.push({
      id: method.command,
      command: method.command,
      label: method.label,
      description: `Open the published ${method.label} contact link.`,
      icon: CONTACT_ICON,
      execute: () => `[Contact Belal via ${method.label}](${method.href})`,
    });
  }
  return actions;
}

const systemPrompt = [
  "Answer questions about Belal Amr Mohamed, his skills, contact information, and published portfolio projects.",
  "Use the portfolio database context supplied by the server. Never invent private information or claim to be Belal.",
  "When useful, include project links and keep answers concise. Only discuss published portfolio projects and contact methods.",
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
  actions: createPortfolioActions(),
  getProjects: getPublishedProjects,
  enableTools: false,
  enableFileUpload: true,
  enableMentions: true,
  enableActions: true,
});

document.body.appendChild(agent);
