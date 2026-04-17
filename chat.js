// api/chat.js — Groq LLM proxy with automatic key rotation
// Set GROQ_KEY_1, GROQ_KEY_2, GROQ_KEY_3 in Vercel environment variables

const KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
].filter(Boolean);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!KEYS.length) return res.status(500).json({ error: "No API keys configured. Add GROQ_KEY_1/2/3 to Vercel Environment Variables." });

  const { messages, system, model = "llama-3.3-70b-versatile", max_tokens = 1200 } = req.body || {};

  const body = JSON.stringify({
    model,
    max_tokens,
    messages: system
      ? [{ role: "system", content: system }, ...(messages || [])]
      : messages || [],
  });

  let lastErr = null;
  for (let i = 0; i < KEYS.length; i++) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEYS[i]}` },
        body,
      });
      if (r.status === 429) { lastErr = `Key ${i + 1} rate-limited`; continue; }
      const data = await r.json();
      if (!r.ok) {
        lastErr = data.error?.message || `HTTP ${r.status}`;
        if (r.status === 401) break; // bad key, no point trying others
        continue;
      }
      res.setHeader("X-Key-Used", i + 1);
      return res.json(data);
    } catch (e) { lastErr = e.message; }
  }
  return res.status(500).json({ error: lastErr || "All keys exhausted" });
};
