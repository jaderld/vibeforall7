# FALCon Assistant — Making French Public Services Accessible to Everyone

**FALCon** is a Chrome extension that makes French administrative websites — **impots.gouv.fr, caf.fr, ameli.fr, ants.gouv.fr, urssaf.fr** — understandable and usable for people with cognitive, visual, motor, or language difficulties.

It combines **on-the-fly page simplification**, an **AI assistant that reads and explains the page for you**, **visual accessibility profiles**, and a **voice-guided form filler** — all running directly inside the browser, with no data sent anywhere except the AI provider you choose to configure.

> Built during the **Capgemini × Hi!Paris VibeForAll hackathon**.

> **Naming note:** the project was previously called *FAILC*. Some internal identifiers (storage key prefixes such as `failc:`, the context-menu id `failc-selection`, etc.) still reference the old name in the codebase and will be renamed in a future cleanup pass : this doesn't affect functionality.

---

## Presnetation screenshots

> **TODO for the team:** add real screenshots/GIFs here before submission. Create a `docs/screenshots/` folder at the root of the repo, drop your images there, and reference them like this:
>
> ```markdown
> ![Popup overview](docs/screenshots/popup-overview.png)
> ```

Suggested screenshots to capture (in this order, so the README tells a story):

| # | What to capture | Suggested filename |
|---|---|---|
| 1 | The extension icon + side panel opening on a supported site (e.g. caf.fr) | `docs/screenshots/01-sidepanel-open.png` |
| 2 | The **profile selection screen** (Standard / Dyslexia / Low vision / Anti-epilepsy) on first launch | `docs/screenshots/02-profile-setup.png` |
| 3 | The **AI provider setup** screen (OpenAI / Gemini API key) | `docs/screenshots/03-ai-setup.png` |
| 4 | A **before/after** of a page: raw government site vs. simplified page (highlighted buttons, glossary terms underlined) | `docs/screenshots/04-before-after.png` |
| 5 | The **"Page summary"** panel with steps and contact info extracted | `docs/screenshots/05-summary-panel.png` |
| 6 | A **glossary tooltip** appearing over a highlighted term (e.g. "avis d'imposition") | `docs/screenshots/06-glossary-tooltip.png` |
| 7 | The **chatbot** answering a question about the page | `docs/screenshots/07-chatbot.png` |
| 8 | The **voice form filling** flow (detected form banner + live conversation transcript) | `docs/screenshots/08-voice-form.png` |
| 9 | The **dyslexia** and **low-vision** visual profiles applied side by side | `docs/screenshots/09-visual-profiles.png` |

Once added, insert each image right under the matching feature description further down in this README (marked with `📷 [Insert screenshot here]`).

---

## The problem

Millions of people in France struggle to complete essential administrative tasks online — filing taxes, requesting family benefits (CAF), managing health reimbursements (Ameli), or renewing an ID card (ANTS) — because these websites are:

- Written in dense administrative "jargon" ("avis d'imposition", "revenu fiscal de référence", "complémentaire santé"...)
- Visually overwhelming for people with dyslexia, low vision, or photosensitive epilepsy
- Full of long, multi-step forms that are hard to navigate without help
- Missing a simple way to find "where do I get help" (contact, phone number, appointment booking)

This disproportionately affects **elderly people, people with disabilities, non-native speakers, and anyone with cognitive or visual impairments** — exactly the population these public services are meant to serve.

## Our solution

FALCon Assistant sits as a **browser side panel** and silently works in the background on supported government websites to:

1. **Simplify the page in real time** : difficult and/or dense termination is rewritten in plain language using web parsing and AI interpretation of the content, action buttons get bold, unambiguous labels (i.e saying "Click here to go to the next page" only to mean "Continue"...) are simplified, and important links are visually highlighted.
2. **Read and summarize the page with AI** : a short, plain-language summary and a step-by-step guide are generated automatically, no button to click.
3. **Explain complex terms on hover** : a glossary (static for basic terms then AI-generated to complete, tailored to the page) highlights difficult terms and shows a definition in a tooltip.
4. **Surface help contacts automatically** : phone numbers, emails, addresses, opening hours are extracted and displayed clearly. When the contact section is on another page and a button is present (often at the button of the page), FALCon directly fetches the link the button refers to and integrates this clickable link in the sidebar.
5. **Answer questions in a chat** : an AI chatbot, aware of the page's content, answers user questions in simple French, with text-to-speech read-aloud and speech-to-text input for people with visual or cognitive diabilities.
6. **Fill out forms by voice** — for users who struggle with typing or reading forms, FALCon detects forms on the page and offers to fill them out through a spoken, one-question-at-a-time conversation, complete with confirmation before submission.
7. **Adapt the visual style** to the user's needs, with one-click accessibility profiles.

---

## Key Features

### 1. Visual Accessibility Profiles
📷 *[Insert screenshot here — profile comparison]*

Four selectable display profiles, applied instantly to any page:

| Profile | What it changes |
|---|---|
| **Standard** | Default browsing experience |
| **Dyslexia** | Dyslexia-friendly font (Arial), increased line height and letter spacing, left-aligned text |
| **Low vision** | High-contrast dark theme, enlarged text on key elements |
| **Anti-epilepsy** | Disables all CSS animations/transitions and video autoplay to prevent seizure triggers |

### 2. Silent Page Analysis (AI + rule-based)
As soon as a supported page loads, FALCon automatically (no click required):
- Extracts the visible text content of the page (paragraphs, lists, headings, labels)
- Sends it to the configured AI provider (OpenAI or Gemini) to generate a **plain-language summary**, a **list of steps to follow**, and a **contextual glossary**
- Falls back gracefully to static rules if the AI call fails or no API key is configured, so the extension **always provides at least basic simplification**

📷 *[Insert screenshot here — summary panel]*

### 3. Real-Time Text & Button Simplification
A content script rewrites the DOM in place:
- Jargon and acronyms are replaced with plain-language equivalents and definitions (e.g. *"CAF"* → *"CAF (aides familiales)"*)
- Buttons and links are relabeled with unambiguous action words (`CONNEXION`, `RECHERCHE`, `COMMENCER`, `SUIVANT`, `CONFIRMER`, `RETOUR`)
- Important procedure links (e.g. "obtenir une attestation", "payer en ligne") are visually outlined without changing their text, so users don't lose the specific information. Less important links are not highlighted
- Search fields get a clear `RECHERCHE` placeholder
- A `MutationObserver` re-applies all of this automatically as the page changes (single-page apps, lazy-loaded content), with no need to click a button

📷 *[Insert screenshot here — before/after highlighting]*

### 4. Interactive Glossary
Difficult terms are underlined and highlighted directly in the page text. Hovering over one shows a tooltip with a short, plain-language definition ; this is a result of a combination between a **built-in glossary** of common administrative terms with **AI-generated definitions** specific to the page being viewed.

📷 *[Insert screenshot here — glossary tooltip]*

### 5. Automatic Contact Discovery
FALCon scans the page for:
- Phone numbers, email addresses, opening hours, and physical addresses (via pattern matching)
- The most relevant "Contact us" / "Make an appointment" link or button, prioritizing unambiguous keywords (*contact, rendez-vous...*) over vaguer ones (*aide, FAQ...*)
- Contacts that appear later (lazy-loaded content) are picked up automatically and pushed live to the side panel

### 6. Contextual AI Chatbot
📷 *[Insert screenshot here — chatbot conversation]*

Users can ask free-form questions ("Where do I click to see my tax notice?", "What does URSSAF mean?") and get answers that are:
- Grounded in the current page's content when the question is page-specific
- Answered from general knowledge when the question is about administrative concepts in general
- Delivered in short, reassuring, plain French (FALC-inspired)
- Read aloud automatically (text-to-speech) and answerable # FALCon Assistant — Making French Public Services Accessible to Everyone

**FALCon** is a Chrome extension that makes French administrative websites — **impots.gouv.fr, caf.fr, ameli.fr, ants.gouv.fr, urssaf.fr** — understandable and usable for people with cognitive, visual, motor, or language difficulties.

It combines **on-the-fly page simplification**, an **AI assistant that reads and explains the page for you**, **visual accessibility profiles**, and a **voice-guided form filler** — all running directly inside the browser, with no data sent anywhere except the AI provider you choose to configure.

> Built during the **Capgemini × Hi!Paris VibeForAll hackathon**.

> ℹ️ **Naming note:** the project was previously called *FAILC*. Some internal identifiers (storage key prefixes such as `failc:`, the context-menu id `failc-selection`, the `vibeforall7` folder name, etc.) still reference the old name in the codebase and will be renamed in a future cleanup pass — this doesn't affect functionality.

---

## 📸 Screenshots

> **TODO for the team:** add real screenshots/GIFs here before submission. Create a `docs/screenshots/` folder at the root of the repo, drop your images there, and reference them like this:
>
> ```markdown
> ![Popup overview](docs/screenshots/popup-overview.png)
> ```

Suggested screenshots to capture (in this order, so the README tells a story):

| # | What to capture | Suggested filename |
|---|---|---|
| 1 | The extension icon + side panel opening on a supported site (e.g. caf.fr) | `docs/screenshots/01-sidepanel-open.png` |
| 2 | The **profile selection screen** (Standard / Dyslexia / Low vision / Anti-epilepsy) on first launch | `docs/screenshots/02-profile-setup.png` |
| 3 | The **AI provider setup** screen (OpenAI / Gemini API key) | `docs/screenshots/03-ai-setup.png` |
| 4 | A **before/after** of a page: raw government site vs. simplified page (highlighted buttons, glossary terms underlined) | `docs/screenshots/04-before-after.png` |
| 5 | The **"Page summary"** panel with steps and contact info extracted | `docs/screenshots/05-summary-panel.png` |
| 6 | A **glossary tooltip** appearing over a highlighted term (e.g. "avis d'imposition") | `docs/screenshots/06-glossary-tooltip.png` |
| 7 | The **chatbot** answering a question about the page | `docs/screenshots/07-chatbot.png` |
| 8 | The **voice form filling** flow (detected form banner + live conversation transcript) | `docs/screenshots/08-voice-form.png` |
| 9 | The **dyslexia** and **low-vision** visual profiles applied side by side | `docs/screenshots/09-visual-profiles.png` |

Once added, insert each image right under the matching feature description further down in this README (marked with `📷 [Insert screenshot here]`).

---

## 🎯 The Problem

Millions of people in France struggle to complete essential administrative tasks online — filing taxes, requesting family benefits (CAF), managing health reimbursements (Ameli), or renewing an ID card (ANTS) — because these websites are:

- Written in dense administrative jargon ("avis d'imposition", "revenu fiscal de référence", "complémentaire santé"...)
- Visually overwhelming for people with dyslexia, low vision, or photosensitive epilepsy
- Full of long, multi-step forms that are hard to navigate without help
- Missing a simple way to find "where do I get help" (contact, phone number, appointment booking)

This disproportionately affects **elderly people, people with disabilities, non-native speakers, and anyone with cognitive or visual impairments** — exactly the population these public services are meant to serve.

## 💡 Our Solution

FALCon Assistant sits as a **browser side panel** and silently works in the background on supported government websites to:

1. **Simplify the page in real time** — jargon is rewritten in plain language, action buttons get bold, unambiguous labels (CONNEXION, SUIVANT, CONFIRMER...), and important administrative links are visually highlighted.
2. **Read and summarize the page with AI** — a short, plain-language summary and a step-by-step guide are generated automatically, no button to click.
3. **Explain complex terms on hover** — a glossary (static + AI-generated, tailored to the page) highlights difficult terms and shows a definition in a tooltip.
4. **Surface help contacts automatically** — phone numbers, emails, addresses, opening hours, and "Contact us" links are extracted and displayed clearly.
5. **Answer questions in a chat** — an AI chatbot, aware of the page's content, answers user questions in simple French, with text-to-speech read-aloud and speech-to-text input.
6. **Fill out forms by voice** — for users who struggle with typing or reading forms, FALCon detects forms on the page and offers to fill them out through a spoken, one-question-at-a-time conversation, complete with confirmation before submission.
7. **Adapt the visual style** to the user's needs, with one-click accessibility profiles.
8. **Simplify any selected text on demand** — a right-click context menu entry ("Simplifier cette sélection avec FALCon") lets users highlight a confusing paragraph anywhere on the page and get an instant plain-language explanation.

---

## ✨ Key Features

### 1. Visual Accessibility Profiles
📷 *[Insert screenshot here — profile comparison]*

Four selectable display profiles, applied instantly to any page:

| Profile | What it changes |
|---|---|
| **Standard** | Default browsing experience |
| **Dyslexia** | Dyslexia-friendly font (Arial), increased line height and letter spacing, left-aligned text |
| **Low vision** | High-contrast dark theme, enlarged text on key elements |
| **Anti-epilepsy** | Disables all CSS animations/transitions and video autoplay to prevent seizure triggers |

### 2. Silent Page Analysis (AI + rule-based)
As soon as a supported page loads, FALCon automatically (no click required):
- Extracts the visible text content of the page (paragraphs, lists, headings, labels)
- Sends it to the configured AI provider (OpenAI or Gemini) to generate a **plain-language summary**, a **list of steps to follow**, and a **contextual glossary**
- Falls back gracefully to static rules if the AI call fails or no API key is configured, so the extension **always provides at least basic simplification**

📷 *[Insert screenshot here — summary panel]*

### 3. Real-Time Text & Button Simplification
A content script rewrites the DOM in place:
- Jargon is replaced with plain-language equivalents (e.g. *"avis d'imposition"* → *"document de l'administration"*, *"CAF"* → *"CAF (aides familiales)"*)
- Buttons and links are relabeled with unambiguous action words (`CONNEXION`, `RECHERCHE`, `COMMENCER`, `SUIVANT`, `CONFIRMER`, `RETOUR`)
- Important procedure links (e.g. "obtenir une attestation", "payer en ligne") are visually outlined without changing their text, so users don't lose the specific information
- Search fields get a clear `RECHERCHE` placeholder
- A `MutationObserver` re-applies all of this automatically as the page changes (single-page apps, lazy-loaded content), with no need to click a button

📷 *[Insert screenshot here — before/after highlighting]*

### 4. Interactive Glossary
Difficult terms are underlined and highlighted directly in the page text. Hovering over one shows a tooltip with a short, plain-language definition — combining a **built-in glossary** of common administrative terms with **AI-generated definitions** specific to the page being viewed.

📷 *[Insert screenshot here — glossary tooltip]*

### 5. Automatic Contact Discovery
FALCon scans the page for:
- Phone numbers, email addresses, opening hours, and physical addresses (via pattern matching)
- The most relevant "Contact us" / "Make an appointment" link or button, prioritizing unambiguous keywords (*contact, rendez-vous...*) over vaguer ones (*aide, FAQ...*)
- Contacts that appear later (lazy-loaded content) are picked up automatically and pushed live to the side panel

### 6. Contextual AI Chatbot
📷 *[Insert screenshot here — chatbot conversation]*

Users can ask free-form questions ("Where do I click to see my tax notice?", "What does URSSAF mean?") via text or voice input (speech-to-text), and get answers that are:
- Grounded in the current page's content when the question is page-specific
- Answered from general knowledge when the question is about administrative concepts in general
- Delivered in short, reassuring, plain French (FALC-inspired: *Facile à Lire et à Comprendre*)
- Read aloud automatically (text-to-speech, with an option to stop the reading) and including markdown formatting for readability

### 7. Voice-Guided Form Filling
📷 *[Insert screenshot here — voice form flow]*

For the hardest part of any administrative task — the form itself — FALCon can:
1. Automatically detect the richest form on the page
2. Ask the user, out loud, one question per field
3. Transcribe the spoken answer, validate it, and fill the corresponding field on the page live, with a visible success/error highlight
4. Ask for confirmation ("Is this correct? Say yes or no.") before moving on
5. Read back a final summary and ask for explicit confirmation before submitting the form

The whole conversation is displayed as a readable transcript in the side panel in parallel with the voice interaction, so it's usable by people with hearing difficulties too.

---

## How It Works — Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Chrome Side Panel (UI)                   │
│                     src/vibeforall7/sidebar/                     │
│   sidebar.tsx (React) — profiles, AI setup, chat, voice form UI  │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ chrome.runtime messages
┌───────────────────────────────▼───────────────────────────────────┐
│                        Background Service Worker                  │
│                          src/background.ts                        │
│  • Routes messages between content script and side panel          │
│  • Calls OpenAI / Gemini APIs (page analysis, chat, form logic)   │
│  • BackgroundController · FormFillController                      │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ chrome.tabs.sendMessage
┌───────────────────────────────▼───────────────────────────────────┐
│                          Content Script                           │
│                        src/contentScript.ts                       │
│  • Detects supported sites & applies visual profiles              │
│  • Reads & rewrites the DOM (simplification, glossary, buttons)   │
│  • Extracts contact info, detects forms                           │
│  • Fills form fields live during voice-guided filling             │
│                                                                     │
│  services/  FormDetectionService · FormFillingService              │
│  strategies/ DefaultWebPageStrategy · GoogleDocsStrategy ·          │
│              YouTubeStrategy (site-specific content extraction)   │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow for page analysis:**
`contentScript.ts` collects visible text blocks → sends them to the background worker (`FETCH_ANALYSIS`) → background calls the configured AI provider → response (summary, steps, glossary, UI label suggestions) is sanitized and cached in `chrome.storage.local` → sent back to both the content script (to enrich the on-page simplification) and the side panel (to display the summary).

**Data flow for voice form filling:**
`FormDetectionService` scans the DOM for the richest form → the side panel drives a speak → listen → transcribe → validate loop through the background worker → `FormFillingService` fills, highlights, and eventually submits the form in the actual page.

**Local analysis server (optional):** `server.js` runs a small local analysis API on `http://127.0.0.1:8787`, used as a convenient fallback/mock AI backend during development and demos — if it isn't running, or if no AI key is configured, the extension automatically falls back to the local, rule-based in-page analysis described above, so the demo never breaks.

---

## Tech Stack

- **TypeScript** — extension logic (background, content script, services, strategies)
- **React 18** — side panel UI (`sidebar.tsx`)
- **Vite** — build tooling (`vite.config.ts`)
- **Chrome Extension Manifest V3** — side panel, content scripts, background service worker, context menus
- **Web Speech API** — `SpeechRecognition` (voice input) and `SpeechSynthesisUtterance` (text-to-speech)
- **AI providers** (user-configurable, bring-your-own API key):
  - OpenAI (`gpt-4o-mini`)
  - Google Gemini (`gemini-3.1-flash-lite`)
- **chrome.storage.local** — stores user profile, AI settings, analysis cache, and chat history locally in the browser

---

## Supported Websites

FALCon's automatic simplification and AI analysis currently activate on:

- `impots.gouv.fr` — Taxes
- `caf.fr` — Family benefits
- `ameli.fr` — Health insurance
- `ants.gouv.fr` — ID documents / driving licence
- `urssaf.fr` — Social contributions

*(The chatbot, contact extraction, and profile styling are designed to be easily extended to any other site by adding its domain to `SUPPORTED_SITES` in `contentScript.ts`.)*

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (comes with Node.js)
- Google Chrome (or any Chromium-based browser supporting Manifest V3 side panels)
- An API key from [OpenAI](https://platform.openai.com/api-keys) **or** [Google AI Studio](https://aistudio.google.com/app/apikey) (a free-tier key works for the demo)

### 1. Clone and install

```bash
git clone <repository-url>
cd VibeForAll/vibeforall7
npm install
```

### 2. Build the extension

```bash
npm run build
```

This generates the production build in the `dist/` folder.

*(For active development with auto-rebuild, use `npm run dev` if available in `package.json`.)*

### 3. (Optional but recommended) start the local analysis server

```bash
npm run ai-server
```

This starts the local mock/fallback analysis API on `http://127.0.0.1:8787`. It's handy for demos or offline development — if it isn't running, the extension automatically falls back to local in-page analysis instead.

### 4. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder generated in step 2

### 5. Configure the extension

1. Click the FALCon icon in the Chrome toolbar — the side panel opens
2. Choose your preferred **display profile** (Standard, Dyslexia, Low vision, Anti-epilepsy)
3. Choose your **AI provider** (OpenAI or Gemini) and paste your API key
   - Your key is stored **only** in `chrome.storage.local`, on your machine — it is never sent to any FALCon server (there isn't one)
4. Navigate to a supported site (e.g. [caf.fr](https://www.caf.fr)) — the page is automatically simplified and analyzed

---

## Project Structure

```
VibeForAll/
├── icons/                      # Extension icons
├── src/
│   ├── background.ts           # Service worker: routes messages, calls AI APIs
│   ├── contentScript.ts        # Injected into supported pages: DOM simplification,
│   │                           #   glossary, contact extraction, form filling hooks
│   ├── constants.ts            # Shared constants (chat history limit, storage keys)
│   ├── types.ts                # Shared TypeScript types
│   ├── webExtraction.ts        # Generic page content extraction helpers
│   ├── controllers/
│   │   ├── BackgroundController.ts   # Handles page-analysis related messages
│   │   └── FormFillController.ts     # Orchestrates the voice form filling flow
│   ├── models/
│   │   ├── ContextManager.ts         # Picks the right extraction strategy per tab
│   │   └── TabContext.ts             # Holds current tab context/state
│   ├── services/
│   │   ├── FormDetectionService.ts   # Detects forms & fields on the page
│   │   ├── FormFillingService.ts     # Fills, highlights, and submits form fields
│   │   └── tabService.ts             # Chrome tabs helper functions
│   └── strategies/
│       ├── IContentStrategy.ts       # Common interface for extraction strategies
│       ├── DefaultWebPageStrategy.ts # Generic page extraction
│       ├── GoogleDocsStrategy.ts     # Google Docs-specific extraction
│       └── YouTubeStrategy.ts        # YouTube-specific extraction
│   ├── sidebar/
│   │   ├── sidebar.html
│   │   ├── sidebar.js
│   │   └── sidebar.tsx         # React UI: profiles, AI settings, summary, chat, voice form
│   ├── manifest.json           # Chrome extension manifest (Manifest V3)
│   ├── package.json
│   ├── server.js               # Local analysis API (fallback-friendly mock AI backend), runs on http://127.0.0.1:8787
│   ├── tsconfig.json / tsconfig.node.json
│   └── vite.config.ts
└── README.md
```

---

## Privacy & Data Handling

- No FALCon cloud backend exists : the extension talks **directly** from the user's browser to the AI provider the user chose to configure. The optional `server.js` local server only runs on the developer's own machine (`127.0.0.1:8787`) as a mock/fallback for demos, and never leaves it.
- API keys, chosen profile, and chat history are stored **locally** in `chrome.storage.local` and never leave the device except as part of the direct call to OpenAI/Gemini.
- Only the visible text of the current page (limited to the first 60 relevant text blocks) is sent to the AI provider for analysis — no personal form data is ever included in that request.
- Voice recognition uses the browser's built-in Web Speech API; no separate speech-to-text server is used.

---

## Team

Built during the **Capgemini × Hi!Paris VibeForAll hackathon** by **Team 7**.

*(Add team member names, roles, and links here.)*

---