# FALCon Assistant — Making French Public Services Accessible to Everyone

**FALCon** is a Chrome extension that makes French administrative websites — **impots.gouv.fr, caf.fr, ameli.fr, ants.gouv.fr, urssaf.fr** — understandable and usable for people with cognitive, visual, motor, or language difficulties.

It combines **on-the-fly page simplification**, an **AI assistant that reads and explains the page for you**, **visual accessibility profiles**, and a **voice-guided form filler** — all running directly inside the browser, with no data sent anywhere except the AI provider you choose to configure.

It is built around FALC (Facile à Lire et à Comprendre — "Easy to Read and Understand"), the French accessibility standard for producing content that is clear and usable by people with cognitive, cognitive-adjacent, or reading difficulties. It gives people the efficient falcon's eyes to see through the dense administrative procedures.

> Built during the **Capgemini × Hi!Paris VibeForAll hackathon**.

---

## Presentation video


---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (comes with Node.js)
- Google Chrome (or any Chromium-based browser supporting Manifest V3 side panels)
- An API key from [OpenAI](https://platform.openai.com/api-keys) **or** [Google AI Studio](https://aistudio.google.com/app/apikey) (a free-tier key works for the demo)

### 1. Clone and install

```bash
git clone https://github.com/jaderld/vibeforall7.git
cd VibeForAll
npm install
```

### 2. Build the extension

```bash
npm run build
```

This generates the production build in the `dist/` folder.

*(For active development with auto-rebuild, use `npm run dev` if available in `package.json`.)*

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder generated in step 2

### 5. Configure the extension

1. Click the FALCon icon in the Chrome toolbar —> the side panel opens
2. Choose your preferred **display profile** (Standard, Dyslexia, Low vision, Anti-epilepsy)
3. Choose your **AI provider** (OpenAI or Gemini) and paste your API key
   - Your key is stored **only** in `chrome.storage.local`, on your machine : it is never sent to any FALCon server (there isn't one)
4. Navigate to a supported site (e.g. [caf.fr](https://www.caf.fr)) : the page is automatically simplified and analyzed

And this is it for the install! Below, you cand find more details about our project, the idea behind it, the solution and more technical details.

---

## The problem

Millions of people in France struggle to complete essential administrative tasks online — filing taxes, requesting family benefits (CAF), managing health reimbursements (Ameli), or renewing an ID card (ANTS) — because these websites are:

- Written in dense administrative jargon ("avis d'imposition", "revenu fiscal de référence", "complémentaire santé"...)
- Visually overwhelming for people with dyslexia, low vision, or photosensitive epilepsy
- Full of long, multi-step forms that are hard to navigate without help
- Missing a simple way to find "where do I get help" (contact, phone number, appointment booking)

This disproportionately affects **elderly people, people with disabilities, non-native speakers, and anyone with cognitive or visual impairments**.

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

### 3. Real-Time Text & Button Simplification
A content script rewrites the DOM in place:
- Jargon and acronyms are replaced with plain-language equivalents and definitions (e.g. *"CAF"* → *"CAF (aides familiales)"*)
- Buttons and links are relabeled with unambiguous action words (`CONNEXION`, `RECHERCHE`, `COMMENCER`, `SUIVANT`, `CONFIRMER`, `RETOUR`)
- Important procedure links (e.g. "obtenir une attestation", "payer en ligne") are visually outlined without changing their text, so users don't lose the specific information. Less important links are not highlighted
- Search fields get a clear `RECHERCHE` placeholder
- A `MutationObserver` re-applies all of this automatically as the page changes (single-page apps, lazy-loaded content), with no need to click a button

### 4. Interactive Glossary
Difficult terms are underlined and highlighted directly in the page text. Hovering over one shows a tooltip with a short, plain-language definition ; this is a result of a combination between a **built-in glossary** of common administrative terms with **AI-generated definitions** specific to the page being viewed.

### 5. Automatic Contact Discovery
FALCon scans the page for:
- Phone numbers, email addresses, opening hours, and physical addresses (via pattern matching)
- The most relevant "Contact us" / "Make an appointment" link or button, prioritizing unambiguous keywords (*contact, rendez-vous...*) over vaguer ones (*aide, FAQ...*)
- Contacts that appear later (lazy-loaded content) are picked up automatically and pushed live to the side panel

### 6. Contextual AI Chatbot

Users can ask free-form questions ("Where do I click to see my tax notice?", "What does URSSAF mean?") and get answers that are:
- Grounded in the current page's content when the question is page-specific
- Answered from general knowledge when the question is about administrative concepts in general
- Delivered in short, reassuring, plain French (FALC-inspired)
- Read aloud automatically (text-to-speech) and answerable # FALCon Assistant — Making French Public Services Accessible to Everyone

### 7. Voice-Guided Form Filling

For the hardest part of any administrative task — the form itself — FALCon can:
1. Automatically detect the richest form on the page
2. Ask the user, out loud, one question per field
3. Transcribe the spoken answer, validate it, and fill the corresponding field on the page live, with a visible success/error highlight
4. Ask for confirmation ("Is this correct? Say yes or no.") before moving on
5. Read back a final summary and ask for explicit confirmation before submitting the form

The whole conversation is displayed as a readable transcript in the side panel in parallel with the voice interaction, so it's usable by people with hearing difficulties too.
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

## Project Structure

```
VibeForAll/
├── .venv/
├── icons/
├── node_modules/
├── src/
│   └── scripts/
│       ├── controllers/
│       │   └── FormFillController.ts
│       ├── models/
│       │   ├── ContextManager.ts
│       │   └── TabContext.ts
│       ├── services/
│       │   ├── FormDetectionService.ts
│       │   ├── FormFillingService.ts
│       │   └── tabService.ts
│       ├── strategies/
│       │   ├── DefaultWebPageStrategy.ts
│       │   └── IContentStrategy.ts
│       ├── background.ts
│       ├── constants.ts
│       ├── contentScript.ts
│       ├── types.ts
│       ├── webExtraction.ts
│       └── sidebar/
│           ├── assets.d.ts
│           ├── logo.png
│           ├── sidebar.html
│           ├── sidebar.js
│           └── sidebar.tsx
├── .env
├── .gitignore
├── manifest.json
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.json
├── tsconfig.node.json
└── server.js
```

---

## Privacy & Data Handling

- No FALCon cloud backend exists : the extension talks **directly** from the user's browser to the AI provider the user chose to configure. The optional `server.js` local server only runs on the developer's own machine (`127.0.0.1:8787`) as a mock/fallback for demos, and never leaves it.
- API keys, chosen profile, and chat history are stored **locally** in `chrome.storage.local` and never leave the device except as part of the direct call to OpenAI/Gemini.
- Only the visible text of the current page is sent to the AI provider for analysis — no personal form data is ever included in that request.
- Voice recognition uses the browser's built-in Web Speech API; no separate speech-to-text server is used.

---

## Team

Built during the **Capgemini × Hi!Paris VibeForAll hackathon** by **Team 7**.

---