import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { decideFromScan, formatDecisionCardText } from './decisionEngine.js';
import { connectMongoIfConfigured } from './mongo.js';
import { decideWithAI, translateDecisionCardWithAI, translateUiLabelsWithAI } from './aiDecision.js';
import { ocrFromImageDataUrl } from './ocr.js';
import { formatLocalizedDecisionCardText, getUiLabels, localizeDecisionCard, normalizeLanguage } from './localize.js';
import detectIndianLanguageFromText from './langDetect.js';

const labelCache = new Map();

async function resolveLabels(language) {
  const lang = normalizeLanguage(language);
  const base = getUiLabels(lang);
  // If we have explicit labels (en/hi), use them.
  if (lang === 'en' || lang === 'hi') return base;
  // For other Indian languages, try cached AI-translated labels.
  if (labelCache.has(lang)) return labelCache.get(lang);
  const translated = await translateUiLabelsWithAI({ labels: getUiLabels('en'), language: lang });
  if (translated.ok) {
    labelCache.set(lang, translated.labels);
    return translated.labels;
  }
  return base;
}

let aiCooldownUntil = 0;

const app = express();

const corsOriginRaw = (process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || '').trim();
const corsOrigin = corsOriginRaw
  ? corsOriginRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : true;

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'safeplate-server' });
});

app.post('/api/ocr', async (req, res) => {
  const imageDataUrl = req.body?.imageDataUrl;
  const options = req.body?.options;

  try {
    const out = await ocrFromImageDataUrl({ imageDataUrl, options });
    if (!out.ok) {
      return res.status(out.status || 400).json({ ok: false, error: out.error || 'Invalid request' });
    }
    return res.json({ ok: true, text: out.text || '' });
  } catch {
    return res.status(503).json({ ok: false, error: 'OCR service unavailable' });
  }
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
  const requested = req.body?.language;
  const resolvedLanguage =
    !requested || String(requested).toLowerCase() === 'auto'
      ? detectIndianLanguageFromText(typeof scannedText === 'string' ? scannedText : '')
      : normalizeLanguage(requested);

  const labels = await resolveLabels(resolvedLanguage);

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
        let card = ai.decisionCard;
        if (resolvedLanguage !== 'en') {
          const translated = await translateDecisionCardWithAI({ decisionCard: ai.decisionCard, language: resolvedLanguage });
          if (translated.ok) card = translated.decisionCard;
        }

        const localized = localizeDecisionCard({
          decisionCard: { ...card, translateVerdict: false },
          language: resolvedLanguage,
          labelsOverride: labels
        });
        return res.json({
          decisionCard: localized.decisionCard,
          decisionCardText: formatLocalizedDecisionCardText({ localized }) || ai.decisionCardText,
          source: 'ai',
          resolvedLanguage
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
  let card = {
    verdict: decision.verdict,
    whyThisMatters: decision.whyThisMatters,
    whyYouMightCare: decision.whyYouMightCare,
    confidence: decision.confidence,
    uncertainty: decision.uncertainty,
    betterChoiceHint: decision.betterChoiceHint,
    closure: decision.closure
  };

  if (resolvedLanguage !== 'en') {
    const translated = await translateDecisionCardWithAI({ decisionCard: card, language: resolvedLanguage });
    if (translated.ok) card = translated.decisionCard;
  }

  const localized = localizeDecisionCard({
    decisionCard: { ...card, translateVerdict: false },
    language: resolvedLanguage,
    labelsOverride: labels
  });

  const decisionCardText = formatLocalizedDecisionCardText({ localized }) || formatDecisionCardText(decision);

  // IMPORTANT: never include ingredient lists or nutrition tables.
  res.json({
    decisionCard: localized.decisionCard,
    decisionCardText,
    source: 'heuristic',
    resolvedLanguage
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
