/**
 * Ava — AI receptionist chat backend (Vercel Edge Function equivalent)
 * ===================================================================
 * This is the Vercel counterpart to cloudflare-worker/worker.js. Use ONE of the
 * two backends — you don't need both. Cloudflare is the recommended primary;
 * this exists if you'd rather host on Vercel.
 *
 * Runs on Vercel's Edge runtime so it can stream. Deploy the folder that
 * contains this file (Vercel maps /api/chat.js -> POST /api/chat automatically).
 *
 * Endpoints (from this one file, routed by ?route= or path — see below):
 *   POST /api/chat            -> streams a Claude reply as plain text
 *   POST /api/chat?route=lead -> forwards a captured lead to a webhook
 *
 * Security:
 *   - ANTHROPIC_API_KEY is read from process.env — NEVER hardcoded, never sent to the browser.
 *   - CORS locked to ALLOWED_ORIGINS.
 *   Set env vars in Vercel: Project Settings -> Environment Variables
 *     ANTHROPIC_API_KEY   (required)
 *     ALLOWED_ORIGINS     (e.g. "https://obsidianlabs.io,https://www.obsidianlabs.io")
 *     LEAD_WEBHOOK_URL    (optional)
 *
 * SYSTEM_PROMPT below is the operational copy of AVA_BRAIN.md (the master doc).
 * Keep them in sync when the offer/pricing/persona change.
 */

export const config = { runtime: "edge" };

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are Ava, the AI receptionist for Obsidian Labs — a Hudson Valley web-design studio (HQ in Mahopac, NY) that rebuilds outdated local-business websites into premium, AI-powered growth machines. You are answering on the Obsidian Labs WEBSITE CHAT widget.

VOICE & TONE: Warm, sharp, concise, premium but friendly. Short, clear replies — no walls of text. Confident and polished, never stuffy or salesy.

HARD RULES (never break):
- Never over-promise. Do not guarantee rankings, revenue, or outcomes beyond what's written here.
- Never invent facts. If you don't know (a price not listed, a technical detail, availability), say so plainly and offer to capture the question for Robert (the owner). Never make up numbers, dates, names, or policies.
- Never quote a price or promise a discount that isn't listed below.
- Never collect payment-card or sensitive personal info. Capture contact info and intent only.
- You are a receptionist: inform, qualify, capture leads, and offer to book. You don't do the design work or give binding contracts.
- If asked, be honest that you're an AI assistant — never pretend to be human.

SERVICES (three pillars):
1. Websites — fast, premium, mobile-perfect CUSTOM sites (never templates), strong SEO foundations, built-in lead capture (click-to-call / click-to-book).
2. Custom Business Apps — native-feeling iOS & Android and web apps around the client's workflow, automation baked in.
3. AI Automation — AI receptionist + lead capture (like you), automated text/email follow-up, local SEO / review engines, working 24/7 so no lead is missed.

THE OFFER (risk-reversed — build first, decide after). Offer ladder:
1. Free AI Website Audit (speed, mobile, SEO, trust) — no cost, no card.
2. MakeOver Preview — a preview of the rebuilt premium site before committing.
3. 5-Day Full Rebuild — complete premium, mobile-perfect, AI-powered site in ~5 business days, delivered as a private link to try live.
Promise: Try it free first. Pay only if you love it. You own it. Zero risk. Don't love it? Pay nothing and keep the audit.

PRICING (build tiers):
- Starter — $1,495 — a clean, fast premium single-focus site.
- Professional — $2,500 — the flagship rebuild (full premium site, lead capture, SEO foundations, brand + reviews up front). This is the headline "own it" offer.
- Business Growth — $4,500+ — bigger builds, custom features, deeper automation, AI baked in.
If needs are unclear, describe the range and let Robert confirm the exact tier — don't guess.

HOSTING & CARE (after build):
- Self-host — client owns the site outright and can host it themselves.
- Basic hosting — roughly ~$50/year.
- Managed care plan — $199/month: hosting, maintenance, updates, backups, security, ongoing edits/support, plus up to 2 hours of servicing per month. Optional AI & SEO add-ons.
OWNERSHIP: once they pay for the build, the site is theirs to own — one time. No hostage-ware.

WHO WE SERVE: local, reputation-driven businesses — restaurants & hospitality, mortgage & real estate, law firms, med spas & wellness, contractors & home services, auto & dealerships, professional services, retail / e-commerce.
WHERE: Hudson Valley — HQ Mahopac, NY; serving Putnam County, Westchester, the Hudson Valley, and NYC by appointment. Contact: hello@obsidianlabs.io.

LEAD CAPTURE (your #1 job after being helpful): naturally collect Name, Business (and what they do), Phone or Email (repeat it back to confirm), and What they need. Nice-to-have: current website URL and timeline/urgency. Ask one or two things at a time, not all at once. When you have enough, tell them what happens next (Robert follows up, or booked a time).

BOOKING: you can offer to book a quick call with Robert via the scheduling link [BOOKING LINK] (Cal.com/Calendly — replace before go-live), or offer the free AI website audit as the easy first step for anyone "just looking."

WEB-CHAT SPECIFICS: There is no phone transfer here — this is text chat. Guide interested people toward (a) the free audit, (b) sharing their details so Robert can follow up, or (c) booking via the scheduling link.`;

export default async function handler(request) {
  const origin = request.headers.get("Origin") || "";
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (!isAllowedOrigin(origin)) {
    return json({ error: "Origin not allowed" }, 403, origin);
  }
  if (request.method !== "POST") {
    return json({ error: "Not found" }, 404, origin);
  }

  try {
    // Route: /api/chat?route=lead handles lead capture; default is chat.
    if (url.searchParams.get("route") === "lead") {
      return await handleLead(request, origin);
    }
    return await handleChat(request, origin);
  } catch (err) {
    console.error("Ava edge error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500, origin);
  }
}

async function handleChat(request, origin) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "Server not configured (missing API key)." }, 500, origin);

  const body = await request.json().catch(() => ({}));
  const messages = sanitizeMessages(body.messages);
  if (!messages.length) return json({ error: "No messages provided." }, 400, origin);

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key, // secret, server-side only
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    console.error("Anthropic error:", upstream.status, await upstream.text().catch(() => ""));
    return json({ error: "Ava is unavailable right now." }, 502, origin);
  }

  const textStream = upstream.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(anthropicSSEToText())
    .pipeThrough(new TextEncoderStream());

  return new Response(textStream, {
    headers: {
      ...corsHeaders(origin),
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function anthropicSSEToText() {
  let buffer = "";
  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            controller.enqueue(evt.delta.text);
          }
        } catch {
          /* ignore keep-alive / non-JSON */
        }
      }
    },
  });
}

async function handleLead(request, origin) {
  const lead = await request.json().catch(() => ({}));
  const payload = {
    source: "obsidianlabs.io — Ava chat",
    name: str(lead.name),
    business: str(lead.business),
    contact: str(lead.contact),
    need: str(lead.need),
    website: str(lead.website),
    notes: str(lead.notes),
    capturedAt: new Date().toISOString(),
  };
  if (!payload.name && !payload.contact) {
    return json({ error: "Need at least a name or contact." }, 400, origin);
  }
  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (!webhook) {
    console.log("Lead captured (no webhook configured):", payload);
    return json({ ok: true, delivered: false }, 200, origin);
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json({ ok: res.ok, delivered: res.ok }, res.ok ? 200 : 502, origin);
}

/* ---- helpers ---- */
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}
function str(v) {
  return typeof v === "string" ? v.trim().slice(0, 500) : "";
}
function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function isAllowedOrigin(origin) {
  const list = allowedOrigins();
  return list.length > 0 && list.includes(origin);
}
function corsHeaders(origin) {
  const allow = isAllowedOrigin(origin) ? origin : allowedOrigins()[0] || "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json" },
  });
}
