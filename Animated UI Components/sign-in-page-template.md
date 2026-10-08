<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in or join</title>

  <style>
    /* ==========================================================
       Login 03 — vanilla HTML / CSS / JS port
       Original: Hirael <https://hirael.com/blocks/auth/login-03>
       MIT · Mohammad Shehadeh
       ========================================================== */

    /* ---------- Theme tokens (shadcn "neutral") ---------- */
    :root {
      --background: oklch(1 0 0);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --primary: oklch(0.205 0 0);
      --primary-foreground: oklch(0.985 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --border: oklch(0.922 0 0);
      --accent: oklch(0.97 0 0);
      --accent-foreground: oklch(0.205 0 0);
      --ring: oklch(0.708 0 0);
      --input: oklch(0.922 0 0);
      --radius: 0.5rem;
      --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
      --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, sans-serif;
      --ease-enter: cubic-bezier(0.22, 1, 0.36, 1);
    }

    @media (prefers-color-scheme: dark) {
      :root:not(.light) {
        --background: oklch(0.145 0 0);
        --foreground: oklch(0.985 0 0);
        --card: oklch(0.205 0 0);
        --primary: oklch(0.922 0 0);
        --primary-foreground: oklch(0.205 0 0);
        --muted-foreground: oklch(0.708 0 0);
        --border: oklch(1 0 0 / 10%);
        --accent: oklch(0.269 0 0);
        --accent-foreground: oklch(0.985 0 0);
        --ring: oklch(0.556 0 0);
        --input: oklch(1 0 0 / 15%);
      }
    }

    /* Manual override: add class="dark" or class="light" on <html> */
    :root.dark {
      --background: oklch(0.145 0 0);
      --foreground: oklch(0.985 0 0);
      --card: oklch(0.205 0 0);
      --primary: oklch(0.922 0 0);
      --primary-foreground: oklch(0.205 0 0);
      --muted-foreground: oklch(0.708 0 0);
      --border: oklch(1 0 0 / 10%);
      --accent: oklch(0.269 0 0);
      --accent-foreground: oklch(0.985 0 0);
      --ring: oklch(0.556 0 0);
      --input: oklch(1 0 0 / 15%);
    }

    /* ---------- Minimal reset ---------- */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      font-family: var(--font-sans);
      background: var(--background);
      color: var(--foreground);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    svg { display: block; }
    a { color: inherit; text-decoration: none; }
    button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }

    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }

    /* ---------- Entrance animation ----------
       Add class="enter" and style="--i: N" for a staggered delay. */
    @keyframes enter {
      from { opacity: 0; transform: translateY(1rem); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .enter {
      animation: enter 500ms var(--ease-enter) both;
      animation-delay: calc(var(--i, 0) * 60ms);
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }

    @media (prefers-reduced-motion: reduce) {
      .enter, .spin { animation: none; }
    }

    /* ---------- Button ---------- */
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      white-space: nowrap; border-radius: calc(var(--radius) - 2px);
      font-size: 0.875rem; line-height: 1.25rem; font-weight: 500;
      height: 2.5rem; padding: 0.5rem 1rem;
      transition: background-color 150ms, color 150ms;
    }
    .btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--ring);
    }
    .btn:disabled { pointer-events: none; opacity: 0.5; }
    .btn-default { background: var(--primary); color: var(--primary-foreground); }
    .btn-default:hover { background: color-mix(in oklch, var(--primary) 90%, transparent); }
    .btn-ghost:hover { background: var(--accent); color: var(--accent-foreground); }
    .btn-lg { height: 2.75rem; padding-inline: 2rem; }
    .btn-full { width: 100%; }
    .btn-gap-1 { gap: 0.375rem; }
    .btn-gap-2 { gap: 0.5rem; }

    .icon { width: 1rem; height: 1rem; flex-shrink: 0; }
    [dir="rtl"] .rtl-flip { transform: rotate(180deg); }

    /* ---------- Layout ---------- */
    .login {
      position: relative;
      min-height: 100vh;
      min-height: 100svh;
      overflow: hidden;
      background: var(--background);
    }

    /* Decorative backdrop.
       Phones: the animated lines sit behind the whole page.
       Desktop: they are confined to the left-hand panel. */
    .login::before {
      content: "";
      display: none;
      position: absolute; z-index: 0;
      top: 0; bottom: 0; inset-inline-start: 0;
      width: 50%;
      background:
        linear-gradient(to bottom, transparent, transparent, var(--background)),
        var(--card);
      border-inline-end: 1px solid var(--border);
    }
    .bg-paths {
      position: absolute; inset: 0; z-index: 0;
      overflow: hidden; pointer-events: none;
      opacity: 0.7;
    }
    .paths { position: absolute; inset: 0; pointer-events: none; }
    .paths svg { width: 100%; height: 100%; color: var(--primary); }
    .paths path { opacity: 0.6; }

    /* Left aside (desktop only) */
    .login-aside {
      position: relative; z-index: 1;
      display: none;
      height: 100%;
      flex-direction: column;
      padding: 2.5rem;
    }

    .brand {
      position: relative; z-index: 10;
      display: flex; align-items: center; gap: 0.5rem;
    }
    .brand-mark { width: 1.5rem; height: 1.5rem; color: var(--foreground); }
    .brand-name { font-size: 1rem; line-height: 1.5rem; font-weight: 600; letter-spacing: -0.025em; }

    .quote {
      position: relative; z-index: 10;
      margin-top: auto;
      display: flex; flex-direction: column; gap: 0.75rem;
    }
    .quote blockquote {
      font-family: var(--font-serif);
      font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.025em;
    }
    .quote em { font-style: italic; color: var(--foreground); }
    .quote figcaption {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.75rem; line-height: 1rem; text-transform: uppercase;
      color: var(--muted-foreground);
    }
    .quote .sep { color: var(--border); }

    /* Right main column */
    .login-main {
      position: relative;
      display: flex; flex-direction: column; justify-content: center;
      min-height: 100vh;
      min-height: 100svh;
      padding: 5rem 2rem;
    }
    .main-glow {
      position: absolute; inset: 0; z-index: 0;
      pointer-events: none; opacity: 0.6;
    }
    .glow {
      position: absolute; top: 0; inset-inline-end: 0;
      border-radius: 9999px;
    }
    .glow-1 {
      height: 80rem; width: 35rem;
      transform: translateY(-22rem);
      background: radial-gradient(
        68.54% 68.72% at 55.02% 31.46%,
        color-mix(in oklch, var(--foreground) 6%, transparent) 0,
        color-mix(in oklch, var(--foreground) 2%, transparent) 50%,
        color-mix(in oklch, var(--foreground) 1%, transparent) 80%
      );
    }
    .glow-2 {
      height: 80rem; width: 15rem;
      transform: translate(5%, -50%);
      background: radial-gradient(
        50% 50% at 50% 50%,
        color-mix(in oklch, var(--foreground) 4%, transparent) 0,
        color-mix(in oklch, var(--foreground) 1%, transparent) 80%,
        transparent 100%
      );
    }

    .back {
      position: absolute; z-index: 10;
      inset-inline-start: 1.25rem; top: 1.75rem;
    }

    .panel {
      position: relative; z-index: 10;
      width: 100%; margin-inline: auto;
      display: flex; flex-direction: column; gap: 1.5rem;
    }
    .panel-brand { display: flex; align-items: center; gap: 0.5rem; }
    .panel-header { display: flex; flex-direction: column; gap: 0.5rem; }
    .panel-header h1 {
      font-family: var(--font-serif);
      font-size: 2.25rem; line-height: 2.5rem; font-weight: 500; letter-spacing: -0.025em;
    }
    .panel-header p { font-size: 0.875rem; line-height: 1.25rem; color: var(--muted-foreground); }

    .legal { font-size: 0.75rem; line-height: 1rem; color: var(--muted-foreground); }
    .legal a { color: var(--foreground); text-underline-offset: 4px; }
    .legal a:hover { text-decoration: underline; }

    /* ---------- Providers, divider, form ---------- */
    .providers { display: flex; flex-direction: column; gap: 0.75rem; }

    .divider {
      display: flex; align-items: center; gap: 0.75rem;
      font-size: 0.75rem; line-height: 1rem; color: var(--muted-foreground);
    }
    .divider::before, .divider::after {
      content: ""; flex: 1; height: 1px; background: var(--border);
    }

    .form { display: flex; flex-direction: column; gap: 1rem; }
    .field { display: flex; flex-direction: column; gap: 0.5rem; }
    .field-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .label { font-size: 0.875rem; line-height: 1; font-weight: 500; }
    .link { font-size: 0.875rem; line-height: 1.25rem; text-underline-offset: 4px; }
    .link:hover { text-decoration: underline; }
    .link:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 2px; }

    .input {
      display: flex; width: 100%; height: 2.5rem;
      padding: 0.5rem 0.75rem;
      font: inherit; font-size: 1rem; line-height: 1.5rem; color: inherit;
      background: var(--background);
      border: 1px solid var(--input);
      border-radius: calc(var(--radius) - 2px);
      transition: box-shadow 150ms;
    }
    .input::placeholder { color: var(--muted-foreground); }
    .input:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--ring);
    }
    .input:disabled { cursor: not-allowed; opacity: 0.5; }

    .btn-outline { background: var(--background); border: 1px solid var(--input); }
    .btn-outline:hover { background: var(--accent); color: var(--accent-foreground); }
    .icon-slot { display: inline-flex; }
    .icon-slot:empty { display: none; }

    /* ---------- Breakpoints ---------- */
    @media (min-width: 640px) {
      .panel { max-width: 24rem; }
      .panel-header h1 { font-size: 3rem; line-height: 1; }
    }
    @media (min-width: 768px) {
      .quote blockquote { font-size: 1.875rem; }
      .input { font-size: 0.875rem; line-height: 1.25rem; }
    }
    @media (min-width: 1024px) {
      .login { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .login::before { display: block; }
      .bg-paths { inset-inline-end: 50%; opacity: 1; }
      .login-aside { display: flex; }
      .login-main { min-height: 0; }
      .panel-brand { display: none; }
    }
  </style>
</head>

<body>
  <section class="login" data-slot="login">

    <!-- Animated lines: page background on phones, left panel on desktop -->
    <div class="bg-paths" id="floating-paths" aria-hidden="true"></div>

    <!-- ============ Left: brand + quote ============ -->
    <aside class="login-aside" data-slot="login-aside">
      <div class="brand enter">
        <svg class="brand-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M2.3 12h2.4v10.95h6.2V14.6h4.6v8.35h6.2V12h-2.4V1.05h-6.2V9.4H8.5V1.05H2.3Z" />
        </svg>
        <span class="brand-name">Hirael</span>
      </div>

      <figure class="quote enter" style="--i: 4">
        <blockquote>
          We wired up auth in an afternoon and
          <em>never looked back</em>.
          The source lives in our repo, so it bends to us.
        </blockquote>
        <figcaption>
          <span>Platform team</span>
          <span class="sep" aria-hidden="true">|</span>
          <span>Northwind</span>
        </figcaption>
      </figure>
    </aside>

    <!-- ============ Right: sign-in ============ -->
    <div class="login-main" data-slot="login-main">
      <div class="main-glow" aria-hidden="true">
        <div class="glow glow-1"></div>
        <div class="glow glow-2"></div>
      </div>

      <a href="#" class="btn btn-ghost btn-gap-1 back enter">
        <svg class="icon rtl-flip" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Home
      </a>

      <div class="panel" data-slot="login-panel">
        <div class="panel-brand enter">
          <svg class="brand-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M2.3 12h2.4v10.95h6.2V14.6h4.6v8.35h6.2V12h-2.4V1.05h-6.2V9.4H8.5V1.05H2.3Z" />
          </svg>
          <span class="brand-name">Hirael</span>
        </div>

        <div class="panel-header" data-slot="login-header">
          <h1 class="enter" style="--i: 1">Sign in or join.</h1>
          <p class="enter" style="--i: 2">
            Continue with Google or GitHub, or use your email and password.
          </p>
        </div>

        <div class="providers enter" style="--i: 3">
          <button type="button" id="google-btn" class="btn btn-outline btn-lg btn-full btn-gap-2">
            <span class="icon-slot" aria-hidden="true"></span>
            <span class="btn-label">Continue with Google</span>
          </button>
          <button type="button" id="github-btn" class="btn btn-outline btn-lg btn-full btn-gap-2">
            <span class="icon-slot" aria-hidden="true"></span>
            <span class="btn-label">Continue with GitHub</span>
          </button>
        </div>

        <div class="divider enter" style="--i: 4">or sign in with email</div>

        <form class="form enter" id="email-form" style="--i: 5">
          <div class="field">
            <label class="label" for="email">Email</label>
            <input class="input" id="email" name="email" type="email" required
                   autocomplete="email" inputmode="email" placeholder="you@example.com" />
          </div>

          <div class="field">
            <div class="field-row">
              <label class="label" for="password">Password</label>
              <a href="#" class="link">Forgot password?</a>
            </div>
            <input class="input" id="password" name="password" type="password" required
                   autocomplete="current-password" />
          </div>

          <button type="submit" id="email-btn" class="btn btn-default btn-lg btn-full btn-gap-2">
            <span class="icon-slot" aria-hidden="true"></span>
            <span class="btn-label">Sign in</span>
          </button>
        </form>

        <span role="status" id="auth-status" class="sr-only"></span>

        <p class="legal enter" style="--i: 6">
          By continuing, you agree to the
          <a href="#">terms</a> and <a href="#">privacy policy</a>.
        </p>
      </div>
    </div>
  </section>

  <script>
    (function () {
      "use strict";

      var SVG_NS = "http://www.w3.org/2000/svg";
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      /* ---------- Floating background paths ---------- */

      // Deterministic pseudo-random value in [0, 1) so every load looks the same.
      function jitter(i) {
        var value = Math.sin(i + 1) * 10000;
        return value - Math.floor(value);
      }

      function createFloatingPaths(position) {
        var wrap = document.createElement("div");
        wrap.className = "paths";

        var svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("fill", "none");
        svg.setAttribute("viewBox", "0 0 696 316");

        for (var i = 0; i < 36; i++) {
          var d =
            "M-" + (380 - i * 5 * position) + " -" + (189 + i * 6) +
            "C-" + (380 - i * 5 * position) + " -" + (189 + i * 6) +
            " -" + (312 - i * 5 * position) + " " + (216 - i * 6) +
            " " + (152 - i * 5 * position) + " " + (343 - i * 6) +
            "C" + (616 - i * 5 * position) + " " + (470 - i * 6) +
            " " + (684 - i * 5 * position) + " " + (875 - i * 6) +
            " " + (684 - i * 5 * position) + " " + (875 - i * 6);

          var path = document.createElementNS(SVG_NS, "path");
          path.setAttribute("d", d);
          path.setAttribute("stroke", "currentColor");
          path.setAttribute("stroke-opacity", (0.1 + i * 0.03).toFixed(2));
          path.setAttribute("stroke-width", (0.5 + i * 0.03).toFixed(2));
          // Normalise the path length to 1 so dash values are fractions of the line.
          path.setAttribute("pathLength", "1");
          path.style.strokeDasharray = "0.3 1";
          svg.appendChild(path);

          if (!reduceMotion && path.animate) {
            var duration = (20 + jitter(i) * 10) * 1000;
            var timing = { duration: duration, iterations: Infinity, easing: "linear" };

            // Line grows from 30% to 100% of its length...
            path.animate(
              [{ strokeDasharray: "0.3 1" }, { strokeDasharray: "1 1" }],
              timing
            );
            // ...while sliding along itself and back again.
            path.animate(
              [
                { strokeDashoffset: "0" },
                { strokeDashoffset: "-1" },
                { strokeDashoffset: "0" }
              ],
              timing
            );
          }
        }

        wrap.appendChild(svg);
        return wrap;
      }

      var pathsHost = document.getElementById("floating-paths");
      if (pathsHost) {
        pathsHost.appendChild(createFloatingPaths(1));
        pathsHost.appendChild(createFloatingPaths(-1));

        // Phones: "slice" so the lines fill the whole tall screen.
        // Desktop: "meet" so they sit inside the left panel as designed.
        var wide = window.matchMedia("(min-width: 1024px)");
        var applyAspect = function () {
          var mode = wide.matches ? "xMidYMid meet" : "xMidYMid slice";
          pathsHost.querySelectorAll("svg").forEach(function (el) {
            el.setAttribute("preserveAspectRatio", mode);
          });
        };
        applyAspect();
        wide.addEventListener("change", applyAspect);
      }

      /* ---------- Sign-in buttons ---------- */

      var GOOGLE_ICON =
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
        '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>' +
        '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>' +
        '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>' +
        "</svg>";

      var GITHUB_ICON =
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="currentColor" d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.7-2.78.61-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.49-1.11-1.49-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.13-4.55-5.04 0-1.11.39-2.02 1.03-2.74-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.04A9.4 9.4 0 0 1 12 7.04c.85 0 1.7.12 2.5.34 1.9-1.31 2.74-1.04 2.74-1.04.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.74 0 3.92-2.34 4.78-4.57 5.03.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.04 10.04 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z"/>' +
        "</svg>";

      var SPINNER_ICON =
        '<svg class="icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

      function field(id) { return document.getElementById(id); }

      var actions = {
        google: {
          btn: field("google-btn"),
          idleIcon: GOOGLE_ICON,
          idleLabel: "Continue with Google",
          busyLabel: "Redirecting to Google\u2026",
          status: "Redirecting to Google"
        },
        github: {
          btn: field("github-btn"),
          idleIcon: GITHUB_ICON,
          idleLabel: "Continue with GitHub",
          busyLabel: "Redirecting to GitHub\u2026",
          status: "Redirecting to GitHub"
        },
        email: {
          btn: field("email-btn"),
          idleIcon: "",
          idleLabel: "Sign in",
          busyLabel: "Signing in\u2026",
          status: "Signing in"
        }
      };

      var form = field("email-form");
      var inputs = form.querySelectorAll("input");
      var statusEl = field("auth-status");

      // Pass the key of the action in progress, or null for the idle state.
      // While one action runs, every button and field is disabled.
      function setPending(activeKey) {
        Object.keys(actions).forEach(function (key) {
          var a = actions[key];
          var busy = key === activeKey;
          a.btn.disabled = activeKey !== null;
          a.btn.querySelector(".icon-slot").innerHTML = busy ? SPINNER_ICON : a.idleIcon;
          a.btn.querySelector(".btn-label").textContent = busy ? a.busyLabel : a.idleLabel;
        });
        inputs.forEach(function (input) { input.disabled = activeKey !== null; });
        statusEl.textContent = activeKey ? actions[activeKey].status : "";
      }

      function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
      }

      async function run(key, work) {
        setPending(key);
        try {
          await work();
        } finally {
          setPending(null);
        }
      }

      // TODO: replace each fake delay below with your real auth call.
      actions.google.btn.addEventListener("click", function () {
        run("google", function () {
          // window.location.href = "/auth/google";
          return wait(2000);
        });
      });

      actions.github.btn.addEventListener("click", function () {
        run("github", function () {
          // window.location.href = "/auth/github";
          return wait(2000);
        });
      });

      form.addEventListener("submit", function (event) {
        event.preventDefault(); // the browser has already checked required + email format
        var email = field("email").value.trim();
        var password = field("password").value;

        run("email", function () {
          // e.g. return fetch("/api/login", { method: "POST", ... });
          void email; void password;
          return wait(2000);
        });
      });

      setPending(null);
    })();
  </script>
</body>
</html>