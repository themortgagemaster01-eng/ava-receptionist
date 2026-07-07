# Ava — AI Receptionist for Obsidian Labs

The chat backend for **Ava**, the AI receptionist for [Obsidian Labs](https://obsidianlabs.io) — a Hudson Valley web-design studio (HQ Mahopac, NY). Ava answers questions, captures leads, and offers to book calls **24/7**.

> ✅ **Zero API keys.** This backend runs entirely on **Cloudflare Workers AI** (the `env.AI` binding), included in Cloudflare's **free** Workers plan. No Anthropic key, no xAI key, no secrets to manage for chat.

---

## What's in here

```
AVA_BRAIN.md                     ← THE MASTER: Ava's persona, knowledge, FAQ,
                                   lead-capture rules, voice call flow, booking.
                                   Imported directly by the Worker as the system
                                   prompt at deploy time — edit it, redeploy, done.

cloudflare-worker/
  worker.js                      ← Streams replies from Workers AI; /chat + /lead
  wrangler.toml                  ← Config incl. the [ai] binding (no secrets)

widget/
  ava-widget-integration.js      ← Snippet to point the site's Ava widget at the
                                   backend — add to the site once deployed.

.gitignore
```

---

## The model

| Setting | Value |
|---|---|
| Model | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Why | The strongest general chat model on Workers AI that fits sensibly in the free daily allocation. 70B parameters, fast fp8 serving, excellent instruction-following for a receptionist persona. |
| Free allocation | 10,000 neurons/day on the free plan (resets 00:00 UTC) ≈ **90–100 Ava replies/day** at typical conversation sizes |
| If exhausted | Requests fail for the rest of the day → Ava returns a polite fallback message pointing to hello@obsidianlabs.io. Upgrading to Workers Paid ($5/mo) removes the ceiling ($0.011/1k neurons beyond the free 10k). |
| Swap it | One line in `worker.js` (`MODEL`). Alternatives: `@cf/openai/gpt-oss-120b` (strong reasoning, similar cost) or `@cf/meta/llama-3.1-8b-instruct-fp8-fast` (~5x more replies/day, noticeably less smart). |

## Built-in guardrails

- **Reply cap** — `max_tokens: 512`, plus prompt instructions to keep replies to 2–4 sentences.
- **History trimming** — last 12 turns, 2,000 chars per message, 14,000 chars total; oldest turns dropped first.
- **Graceful fallback** — any model error (including a used-up daily allocation) returns a friendly plain-text message instead of a broken widget.
- **Business hours aware** — the Worker computes the current time in `America/New_York` (DST-safe) on every request and tells Ava whether the studio is OPEN (Mon–Fri 9–5 ET). After hours, Ava offers to take a message for a next-business-day follow-up instead of promising an immediate callback.
- **CORS fails closed** — only origins in `ALLOWED_ORIGINS` may call the backend.

---

## Deploy (free — ~5 minutes, no API keys)

**Prerequisites:** Node.js installed. That's it.

1. **Create a free Cloudflare account** (if you don't have one): <https://dash.cloudflare.com/sign-up> — free plan is fine; no card needed.

2. **Get the code**

   ```bash
   git clone https://github.com/themortgagemaster01-eng/ava-receptionist.git
   cd ava-receptionist/cloudflare-worker
   ```

3. **Log in and deploy**

   ```bash
   npx wrangler login    # opens a browser — approve once
   npx wrangler deploy
   ```

   Wrangler prints your Worker URL, e.g. `https://ava-receptionist.<your-subdomain>.workers.dev`. **That's the whole deploy — no secrets to set.**

4. **Test it**

   ```bash
   curl -X POST https://ava-receptionist.<your-subdomain>.workers.dev/chat \
     -H "content-type: application/json" \
     -H "Origin: https://themortgagemaster01-eng.github.io" \
     -d '{"messages":[{"role":"user","content":"How much does a site cost?"}]}'
   ```

   You should see Ava's answer stream back.

5. **Optional — lead delivery webhook** (Formspree / Apps Script / email relay):

   ```bash
   npx wrangler secret put LEAD_WEBHOOK_URL
   ```

**Config notes**

- `ALLOWED_ORIGINS` in `wrangler.toml` already includes `https://themortgagemaster01-eng.github.io` (the GitHub Pages origin) and the `obsidianlabshq.io` domains. Adjust as needed and redeploy.
- Changed `AVA_BRAIN.md`? Just `npx wrangler deploy` again — the Worker imports it at build time.

---

## Wire the widget to the site

Once the backend is deployed and tested:

1. Open `widget/ava-widget-integration.js`, set `AVA_ENDPOINT` to your Worker URL.
2. Add the snippet to the obsidianlabs site (see the repo's site-wiring instructions for the drop-in block that upgrades the existing Ava chat panel and corner widget to live AI chat).
3. `sendToAva(text, onChunk)` streams the reply; `captureLead({...})` posts a captured lead.

---

## Swap in your booking link

Ava references a scheduling link placeholder `[BOOKING LINK]`. When your calendar is ready, replace `[BOOKING LINK]` in **AVA_BRAIN.md** with your real Cal.com or Calendly URL and redeploy.

---

## Voice option (the phone version of Ava)

The phone receptionist doesn't use this backend — you reuse the same brain:

1. Create an agent in a voice platform such as **[Vapi](https://vapi.ai)** or **[Synthflow](https://synthflow.ai)**.
2. Paste the contents of **AVA_BRAIN.md** as the agent's **system prompt**, and use the greeting from the *Voice Call Flow* section as the **first message**.
3. Fill in the placeholders **in the platform's private config, never in this repo**:
   - `[HOURS]` — business hours. Currently **Monday–Friday, 9:00 AM–5:00 PM ET**.
   - `[TRANSFER_CELL]` — Robert's cell, as the **screened-transfer** target during business hours. ⚠️ **Enter this only in the voice platform's settings. It must never be committed to this public repo.**
   - `[BOOKING LINK]` — your Cal.com/Calendly URL.

### Screened / whisper transfer (important)

Robert wants to **know it's an Obsidian Labs call before he answers.** The business-hours transfer is a **screened (whisper) transfer**, not a blind one: the platform calls Robert's cell, plays a private whisper ("Obsidian Labs call from [caller] about [reason] — press 1 to accept, or hang up to send them to a message"), and only bridges the caller through **if Robert accepts**. If he declines / doesn't answer, Ava takes a detailed message instead (template in AVA_BRAIN.md → Voice Call Flow).

- **Vapi** — `transferCall` tool with `destination.type: "number"` set to `[TRANSFER_CELL]`, warm-transfer plan with a whisper/summary and require-acceptance (DTMF press-1). Verify current field names in Vapi's *Call Transfers* docs when building.
- **Synthflow** — **Call Transfer** action set to **Warm Transfer**, pointed at `[TRANSFER_CELL]`, with the agent whisper enabled. Verify against Synthflow's current docs when building.

Gate the transfer to business hours (9–5 ET, Mon–Fri); otherwise Ava takes a message.

---

## Security & privacy checklist

- ✅ **No API keys exist for chat.** Workers AI is authorized by the account binding itself.
- ✅ CORS **fails closed** — only origins in `ALLOWED_ORIGINS` may call the backend.
- ✅ System prompt lives server-side (can't be scraped from the page).
- ✅ Inputs are trimmed and capped; conversation history is bounded.
- ✅ Replies are length-capped; model errors degrade to a polite fallback.
- ✅ No real phone numbers in this repo — `[TRANSFER_CELL]` stays a placeholder forever.
- ✅ `.gitignore` blocks `.env` / `.dev.vars` so nothing sensitive gets committed.

---

## License / ownership

Built for Obsidian Labs. Internal foundation — adapt freely.
