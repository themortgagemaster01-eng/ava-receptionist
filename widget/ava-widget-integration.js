/**
 * Ava widget → backend integration snippet
 * ========================================
 * Points the on-page "Ava" chat at the Cloudflare Worker's streaming /chat
 * endpoint and (optionally) posts a captured lead to /lead.
 *
 * Nothing here contains secrets — there are none anymore. The backend runs on
 * Cloudflare Workers AI (no API keys at all).
 *
 * SETUP: set AVA_ENDPOINT to your deployed Worker base URL, e.g.
 *   "https://ava-receptionist.<your-subdomain>.workers.dev"
 */

const AVA_ENDPOINT = "https://ava-receptionist.themortgagemaster01.workers.dev"; // <-- change me

const CHAT_URL = `${AVA_ENDPOINT}/chat`;
const LEAD_URL = `${AVA_ENDPOINT}/lead`;

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
    avaHistory.pop(); // keep history consistent on failure
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

export { sendToAva, captureLead };
