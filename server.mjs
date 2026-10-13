import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Add it as a server environment variable; never put it in public/index.html.');
  process.exit(1);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/chat', async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
      return res.status(400).json({ error: 'Messages 1 se 20 ke beech hone chahiye.' });
    }
    const cleanMessages = [];
    for (const item of messages) {
      if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
        return res.status(400).json({ error: 'Message format sahi nahi hai.' });
      }
      const content = item.content.trim();
      if (!content || content.length > 4000) {
        return res.status(400).json({ error: 'Har message 1 se 4000 characters ka hona chahiye.' });
      }
      cleanMessages.push({ role: item.role, content });
    }
    if (cleanMessages.at(-1)?.role !== 'user') {
      return res.status(400).json({ error: 'Aakhri message user ka hona chahiye.' });
    }

    const response = await openai.responses.create({
      model: MODEL,
      instructions: 'You are Harsh AI, a helpful, honest, friendly assistant. Reply in the language the user uses; if they write Hindi/Hinglish, answer in simple Hindi/Hinglish. Explain clearly and at an age-appropriate level. Do not claim you remember anything outside the conversation supplied. If unsure, say so.',
      input: cleanMessages,
      max_output_tokens: 800,
      store: false
    });
    const reply = (response.output_text || '').trim();
    if (!reply) return res.status(502).json({ error: 'AI se khaali jawab aaya. Dobara try karo.' });
    return res.json({ reply });
  } catch (err) {
    const status = err?.status === 429 ? 429 : 502;
    console.error('OpenAI request failed:', err?.status || '', err?.message || 'unknown error');
    return res.status(status).json({ error: status === 429 ? 'API limit ya quota poora ho sakta hai. API billing/limits check karo.' : 'AI service se abhi jawab nahi mila. API key, model access, billing aur internet check karo.' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, '0.0.0.0', () => console.log(`Harsh AI running on port ${PORT}`));
