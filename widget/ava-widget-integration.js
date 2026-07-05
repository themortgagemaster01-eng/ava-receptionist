/**
 * Ava widget → backend integration snippet
 * ========================================
 * ADD THIS TO THE OBSIDIAN LABS SITE LATER — after the Worker/Vercel backend is
 * deployed. It shows how to point the existing on-page "Ava" chat widget at the
 * streaming /chat endpoint and (optionally) post a captured lead to /lead.
 *
 * Nothing here contains secrets. The API key stays on the server.
 *
 * SETUP: set AVA_ENDPOINT to your deployed backend base URL, e.g.
 *   Cloudflare: "https://ava-receptionist.<your-subdomain>.workers.dev"
 *   Vercel:     "https://<your-project>.vercel.app/api/chat"  (note the path difference below)
 */

const AVA_ENDPOINT = "https://ava-receptionist.YOUR-SUBDOMAIN.workers.dev"; // <-- change me

// Cloudflare exposes /chat and /lead. On Vercel it's /api/chat and /api/chat?route=lead.
// Flip this to true if you deployed the Vercel function instead of the Worker.
const USE_VERCEL = false;
const CHAT_URL = USE_VERCEL ? `${AVA_ENDPOINT}` : `${AVA_ENDPOINT}/chat`;
const LEAD_URL = USE_VERCEL ? `${AVA_ENDPOINT}?route=lead` : `${AVA_ENDPOINT}/lead`;

// Conversation history kept in memory for the session (role: "user" | "assistant").
const avaHistory = [];

/**
 * Send a user message and stream Ava's reply.
 * @param {string} userText  the message the visitor typed
 * @param {(chunk:string)=>void} onChunk  called with each streamed text chunk
 * @returns {Promise<string>} the full reply text
 */
async function sendToAva(userText, onChunk) {
  avaHistory.push({ role: "user", content: userText });

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: avaHistory }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ava request failed: ${res.status}`);
  }

  // The backend streams PLAIN TEXT chunks — just read and append them.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    full += value;
    if (onChunk) onChunk(value);
  }

  avaHistory.push({ role: "assistant", content: full });
  return full;
}

/**
 * Optionally send a captured lead to the backend (which forwards it to your
 * webhook / email). Call this once Ava has gathered the details.
 */
async function captureLead({ name, business, contact, need, website, notes }) {
  try {
    const res = await fetch(LEAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, business, contact, need, website, notes }),
    });
    return res.ok;
  } catch (err) {
    console.error("Lead capture failed:", err);
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * EXAMPLE: wiring to a simple existing widget. Adapt the element IDs/classes to
 * match the real markup already on obsidianlabs.io. This block is illustrative.
 * ------------------------------------------------------------------------- */
//
// const form   = document.querySelector("#ava-form");
// const input  = document.querySelector("#ava-input");
// const thread = document.querySelector("#ava-thread");
//
// form.addEventListener("submit", async (e) => {
//   e.preventDefault();
//   const text = input.value.trim();
//   if (!text) return;
//   input.value = "";
//   appendBubble("user", text);
//
//   const bubble = appendBubble("assistant", "");   // empty bubble to fill as it streams
//   try {
//     await sendToAva(text, (chunk) => { bubble.textContent += chunk; });
//   } catch {
//     bubble.textContent = "Sorry — I'm having trouble right now. Please try again.";
//   }
// });
//
// function appendBubble(role, text) {
//   const el = document.createElement("div");
//   el.className = `ava-bubble ava-${role}`;
//   el.textContent = text;
//   thread.appendChild(el);
//   thread.scrollTop = thread.scrollHeight;
//   return el;
// }

export { sendToAva, captureLead };
