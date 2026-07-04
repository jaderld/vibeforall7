# FAILC Browser Extension

FAILC is a Chrome extension built for the Capgemini and Hi!Paris VibeForAll hackathon.
It helps people understand administrative web pages by making content simpler and easier to use.

## What the extension does

- Detects administrative pages and analyzes their visible content.
- Rewrites complex text into easier-to-read FALC-style explanations.
- Generates a short page summary and a list of practical next steps.
- Extracts useful contact details when found (phone, email, address, opening hours).
- Highlights important terms and shows simple definitions in a glossary popover.
- Detects forms and proposes voice assistance when a form is present.
- Supports accessibility display profiles:
  - Standard
  - Dyslexia
  - Low vision
  - Anti-epilepsy
- Adds a right-click action to simplify any selected text.
- Includes a popup assistant where users can trigger analysis and ask contextual questions.

## Architecture

- `content-script/`: page analysis, simplification, glossary highlighting, and on-page UI.
- `popup/`: React popup interface (profiles, summary, contacts, quick Q&A).
- `background/`: context menu registration and message forwarding.
- `server.js`: local analysis API (fallback-friendly mock AI backend) on `http://127.0.0.1:8787`.

## Run locally

1. Install dependencies:

	```bash
	npm install
	```

2. Build the extension:

	```bash
	npm run build
	```

3. (Optional but recommended) start the local analysis server:

	```bash
	npm run ai-server
	```

4. Load the built extension in Chrome:
	- Open `chrome://extensions`
	- Enable **Developer mode**
	- Click **Load unpacked**
	- Select the extension build output folder

## Notes

- If the local server is unavailable, the extension falls back to local in-page analysis.
- Current form voice-assistance button opens a placeholder URL (`https://example.com/vocal`).
