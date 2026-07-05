# Ava — AI Receptionist for Obsidian Labs

The foundation for **Ava**, the AI receptionist for [Obsidian Labs](https://obsidianlabs.io) — a Hudson Valley web-design studio (HQ Mahopac, NY). Ava answers questions, captures leads, and books calls **24/7** across two channels that share one brain:

- **Website chat** — a small serverless backend that streams replies from Claude.
- **Phone / voice** — the same persona pasted into a voice platform (Vapi, Synthflow, etc.).

> ⚠️ **Status: foundation only.** Nothing here is wired to the live obsidianlabs site yet, and **no API keys or credentials are stored in this repo.** Deploy it yourself and add your own secret (steps below).

---

## What's in here

```
AVA_BRAIN.md                     ← THE MASTER: Ava's persona, knowledge, FAQ,
                                   lead-capture rules, voice call flow, booking.
                                   Used by BOTH the chat backend and the phone agent.

cloudflare-worker/               ← Primary chat backend (recommended)
  worker.js                      ← Streams Claude replies; /chat + /lead endpoints
  wrangler.toml                  ← Config (non-secret vars only)

vercel/
  api/chat.js                    ← Equivalent backend as a Vercel Edge Function
                                   (use ONE backend — Cloudflare OR Vercel, not both)

widget/
  ava-widget-integration.js      ← Snippet to point the site's Ava widget at the
                                   backend — ADD TO THE SITE LATER, once deployed.

.gitignore
```

The `SYSTEM_PROMPT` inside `worker.js` and `vercel/api/chat.js` is an operational copy of **AVA_BRAIN.md**. AVA_BRAIN.md is the master — if you change the offer, pricing, or persona there, update the prompt string in whichever backend you deploy.

---

## How it works

```
Visitor types in the Ava widget
        │  POST /chat  { messages: [...] }
        ▼
Cloudflare Worker (or Vercel Edge Function)
   • CORS-locked to obsidianlabs.io
   • adds Ava's system prompt (AVA_BRAIN)
   • calls the Anthropic Claude API with your SECRET key
   • streams the reply back as plain text
        │
        ▼
Widget appends the streamed text live

Captured a lead?  POST /lead → forwarded to your webhook (Formspree / Apps Script / email)
```

The Anthropic API key **never** touches the browser and is **never** in this repo — it lives as an environment secret on the server.

---

## Deploy the chat backend (Cloudflare Worker — recommended)

**Prerequisites:** a free [Cloudflare](https://dash.cloudflare.com/sign-up) account, Node.js installed, and an [Anthropic API key](https://console.anthropic.com/).

1. **Get the code**

   ```bash
   git clone https://github.com/themortgagemaster01-eng/ava-receptionist.git
   cd ava-receptionist/cloudflare-worker
   ```

2. **Set your production domain(s)** — edit `wrangler.toml`, `ALLOWED_ORIGINS`:

   ```toml
   ALLOWED_ORIGINS = "https://obsidianlabs.io,https://www.obsidianlabs.io"
   ```

3. **Add your Anthropic API key as a SECRET** (this is the important step — it is NOT stored in the repo):

   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   # paste your key when prompted
   ```

   Optional — to deliver captured leads, add a webhook (Formspree form URL, a Google Apps Script web-app URL, or any email relay):

   ```bash
   npx wrangler secret put LEAD_WEBHOOK_URL
   ```

4. **Deploy**

   ```bash
   npx wrangler deploy
   ```

   Wrangler prints your Worker URL, e.g. `https://ava-receptionist.<your-subdomain>.workers.dev`. That's your backend base URL.

   *(Prefer clicking? You can also paste `worker.js` into the Cloudflare dashboard → Workers & Pages → Create → Edit code, then set `ANTHROPIC_API_KEY` under Settings → Variables → Secrets, and `ALLOWED_ORIGINS` as a plain Variable.)*

5. **Test it**

   ```bash
   curl -X POST https://ava-receptionist.<your-subdomain>.workers.dev/chat \
     -H "content-type: application/json" \
     -H "Origin: https://obsidianlabs.io" \
     -d '{"messages":[{"role":"user","content":"How much does a site cost?"}]}'
   ```

   You should see Ava's answer stream back.

### Vercel alternative

If you'd rather use Vercel: deploy a project containing `vercel/api/chat.js`, then in **Project Settings → Environment Variables** add `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`, and (optional) `LEAD_WEBHOOK_URL`. Your endpoint becomes `https://<project>.vercel.app/api/chat` (leads go to `/api/chat?route=lead`). Use **one** backend, not both.

---

## Wire the widget to the site (do this LATER)

Once the backend is deployed and tested:

1. Open `widget/ava-widget-integration.js`.
2. Set `AVA_ENDPOINT` to your deployed base URL (and flip `USE_VERCEL = true` if you deployed on Vercel).
3. Adapt the example element IDs to the real Ava widget markup on obsidianlabs.io, and include the snippet on the site.
4. `sendToAva(text, onChunk)` streams the reply; `captureLead({...})` posts a captured lead.

Nothing needs to change on the live site until you're ready — this repo is intentionally standalone.

---

## Swap in your booking link

Ava references a scheduling link placeholder `[BOOKING LINK]`. When your calendar is ready:

- Replace `[BOOKING LINK]` in **AVA_BRAIN.md** and in the `SYSTEM_PROMPT` of whichever backend you deployed, with your real [Cal.com](https://cal.com) or Calendly URL (e.g. `https://cal.com/obsidianlabs/intro`).

---

## Voice option (the phone version of Ava)

To stand up the **phone** receptionist, you don't need this backend at all — you reuse the same brain:

1. Create an agent in a voice platform such as **[Vapi](https://vapi.ai)** or **[Synthflow](https://synthflow.ai)**.
2. Paste the contents of **AVA_BRAIN.md** as the agent's **system prompt**, and use the greeting from the *Voice Call Flow* section as the **first message**.
3. Fill in the placeholders **in the platform's private config, never in this repo**:
   - `[HOURS]` — business hours. Currently **Monday–Friday, 9:00 AM–5:00 PM ET**.
   - `[TRANSFER_CELL]` — Robert's cell, as the **screened-transfer** target during business hours. ⚠️ **Enter this only in the voice platform's settings. It must never be committed to this public repo.**
   - `[BOOKING LINK]` — your Cal.com/Calendly URL.

### Screened / whisper transfer (important)

Robert wants to **know it's an Obsidian Labs call before he answers.** So the business-hours transfer is a **screened (whisper) transfer**, not a blind one: the platform calls Robert's cell, plays him a private whisper ("Obsidian Labs call from [caller] about [reason] — press 1 to accept, or hang up to send them to a message"), and only bridges the caller through **if Robert accepts**. If he declines / doesn't answer, Ava takes a detailed message instead (template in AVA_BRAIN.md → Voice Call Flow) and routes it to Robert via email/SMS. Configure it like this:

- **Vapi** — use a `transferCall` tool with `destination.type: "number"` set to `[TRANSFER_CELL]`, and a transfer plan that plays a whisper before connecting: set `transferPlan.mode` to `"warm-transfer-experimental"` (or the current warm/whisper mode), with a `summaryPlan` / whisper message announcing the caller. Enable "require acceptance" (DTMF press-1) so the call only bridges when Robert confirms; otherwise fall back to the message flow. See Vapi's *Call Transfers → Warm transfer with a summary* docs.
- **Synthflow** — add a **Call Transfer** action set to **Warm Transfer** (not cold/blind), point it at `[TRANSFER_CELL]`, and enable the **agent whisper / transfer message** so the agent announces the caller to Robert and waits for him to accept before connecting. If the transfer isn't accepted, route back to the message-taking flow. See Synthflow's *Warm Transfer* action docs.

Set business-hours logic (9–5 ET, Mon–Fri) as a condition/variable on the transfer action so it only attempts the screened transfer during hours and takes a message otherwise.

---

## Security checklist

- ✅ API key is an **env secret**, never in code and never sent to the browser.
- ✅ CORS **fails closed** — only origins in `ALLOWED_ORIGINS` may call the backend.
- ✅ System prompt lives server-side (can't be scraped from the page).
- ✅ Inputs are trimmed and capped; conversation history is bounded.
- ✅ `.gitignore` blocks `.env` / `.dev.vars` so secrets never get committed.

---

## License / ownership

Built for Obsidian Labs. Internal foundation — adapt freely.
