import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { decideFromScan, formatDecisionCardText } from './decisionEngine.js';
import { connectMongoIfConfigured } from './mongo.js';
import { decideWithAI } from './aiDecision.js';

let aiCooldownUntil = 0;

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'safeplate-server' });
});

app.get('/api/debug/ai', (_req, res) => {
  const useAI = String(process.env.USE_AI || '').toLowerCase() === 'true';
  const aiOnly = String(process.env.AI_ONLY || '').toLowerCase() === 'true';
  const provider = String(process.env.AI_PROVIDER || 'openai').toLowerCase();

  res.json({
    useAI,
    aiOnly,
    provider,
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    },
    openaiCompatible: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '')
    }
  });
});

app.post('/api/debug/ai-decision', async (req, res) => {
  const scannedText = req.body?.scannedText;

  try {
    const ai = await decideWithAI({ scannedText });
    if (ai.ok) {
      return res.json({ ok: true, source: 'ai', verdict: ai.decisionCard?.verdict });
    }
    return res.status(503).json({ ok: false, source: 'ai', reason: ai.reason });
  } catch {
    return res.status(503).json({ ok: false, source: 'ai', reason: 'AI request failed' });
  }
});

app.post('/api/decision', async (req, res) => {
  const scannedText = req.body?.scannedText;

  // Prefer AI when configured; fall back to heuristic if unavailable/invalid.
  const useAI = String(process.env.USE_AI || '').toLowerCase() === 'true';
  const aiOnly = String(process.env.AI_ONLY || '').toLowerCase() === 'true';

  if (useAI) {
    const now = Date.now();
    if (aiOnly && aiCooldownUntil && now < aiCooldownUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((aiCooldownUntil - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: `AI is busy right now. Try again in about ${retryAfterSeconds} seconds.`,
        reason: 'Rate limit cooldown',
        retryAfterSeconds,
        source: 'ai'
      });
    }

    try {
      const ai = await decideWithAI({ scannedText });
      if (ai.ok) {
        return res.json({
          decisionCard: ai.decisionCard,
          decisionCardText: ai.decisionCardText,
          source: 'ai'
        });
      }
      if (aiOnly) {
        if (ai.status === 429) {
          const retryAfterSeconds = ai.retryAfterSeconds || 30;
          aiCooldownUntil = Date.now() + retryAfterSeconds * 1000;
          res.setHeader('Retry-After', String(retryAfterSeconds));
          return res.status(429).json({
            error: `AI is busy right now. Try again in about ${retryAfterSeconds} seconds.`,
            reason: ai.reason,
            retryAfterSeconds,
            source: 'ai'
          });
        }

        return res.status(503).json({
          error: 'AI decision is not available right now.',
          reason: ai.reason,
          source: 'ai'
        });
      }
    } catch {
      if (aiOnly) {
        return res.status(503).json({
          error: 'AI decision is not available right now.',
          reason: 'AI request failed',
          source: 'ai'
        });
      }
      // fall through to heuristic
    }
  }

  const decision = decideFromScan({ scannedText });
  const decisionCardText = formatDecisionCardText(decision);

  // IMPORTANT: never include ingredient lists or nutrition tables.
  res.json({
    decisionCard: {
      verdict: decision.verdict,
      whyThisMatters: decision.whyThisMatters,
      whyYouMightCare: decision.whyYouMightCare,
      confidence: decision.confidence,
      uncertainty: decision.uncertainty,
      betterChoiceHint: decision.betterChoiceHint,
      closure: decision.closure
    },
    decisionCardText,
    source: 'heuristic'
  });
});

const port = Number(process.env.PORT || 5050);

async function start() {
  try {
    await connectMongoIfConfigured();
  } catch {
    // Mongo is optional; keep server usable without it.
  }

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`safeplate-server listening on http://localhost:${port}`);
  });
}

start();
