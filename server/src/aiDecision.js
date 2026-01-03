import fetch from 'node-fetch';

function languageNameFromCode(code) {
  const c = String(code || '').trim();
  const map = {
    as: 'Assamese',
    bn: 'Bengali',
    brx: 'Bodo',
    doi: 'Dogri',
    gu: 'Gujarati',
    hi: 'Hindi',
    kn: 'Kannada',
    ks: 'Kashmiri',
    kok: 'Konkani',
    mai: 'Maithili',
    ml: 'Malayalam',
    'mni-Mtei': 'Meitei (Manipuri)',
    mr: 'Marathi',
    ne: 'Nepali',
    or: 'Odia',
    pa: 'Punjabi',
    sa: 'Sanskrit',
    sat: 'Santali',
    sd: 'Sindhi',
    ta: 'Tamil',
    te: 'Telugu',
    ur: 'Urdu',
    en: 'English'
  };
  return map[c] || 'the selected language';
}

function extractFirstJsonObject(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;

  const start = t.indexOf('{');
  if (start < 0) return null;
  // Very small heuristic to find a matching closing brace.
  let depth = 0;
  for (let i = start; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) {
      const candidate = t.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function containsDigitsOrQuestionMarks(value) {
  if (typeof value !== 'string') return false;
  // No questions; no numbers.
  return /\d/.test(value) || /\?/.test(value);
}

function validateTranslatedDecisionCard(card, confidence) {
  if (!card || typeof card !== 'object') return false;
  if (typeof card.verdict !== 'string' || !card.verdict.trim()) return false;
  if (!Array.isArray(card.whyThisMatters) || card.whyThisMatters.length === 0) return false;
  if (!Array.isArray(card.whyYouMightCare) || card.whyYouMightCare.length === 0) return false;
  if (typeof card.uncertainty !== 'string' || !card.uncertainty.trim()) return false;
  if (typeof card.closure !== 'string' || !card.closure.trim()) return false;

  const allStrings = [
    card.verdict,
    ...card.whyThisMatters,
    ...card.whyYouMightCare,
    card.uncertainty,
    ...(Array.isArray(card.betterChoiceHint) ? card.betterChoiceHint : []),
    card.closure
  ];

  if (allStrings.some((s) => typeof s !== 'string')) return false;
  if (allStrings.some((s) => containsDigitsOrQuestionMarks(s))) return false;

  // Confidence must be carried over exactly.
  if (card.confidence !== confidence) return false;
  return true;
}

export async function translateDecisionCardWithAI({ decisionCard, language }) {
  if (!decisionCard || typeof decisionCard !== 'object') return { ok: false, reason: 'No decisionCard provided' };
  const langCode = String(language || 'en');
  if (langCode.toLowerCase() === 'en') return { ok: true, decisionCard };

  const confidence = decisionCard.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return { ok: false, reason: 'Invalid confidence' };
  }

  const targetName = languageNameFromCode(langCode);

  const payload = {
    verdict: decisionCard.verdict,
    whyThisMatters: Array.isArray(decisionCard.whyThisMatters) ? decisionCard.whyThisMatters.slice(0, 2) : [],
    whyYouMightCare: Array.isArray(decisionCard.whyYouMightCare) ? decisionCard.whyYouMightCare.slice(0, 1) : [],
    uncertainty: decisionCard.uncertainty,
    betterChoiceHint: Array.isArray(decisionCard.betterChoiceHint) ? decisionCard.betterChoiceHint.slice(0, 1) : [],
    closure: decisionCard.closure
  };

  const system = `You are a careful translator for SafePlate.

Translate ONLY the meaning of the decision card fields into ${targetName}.

Strict rules:
- Output MUST be valid JSON only. No markdown.
- Keep the same JSON keys.
- Keep arrays the same length (do not add/remove items).
- Do NOT add any numbers anywhere.
- Do NOT add any question marks.
- Do NOT add ingredients, nutrition facts, codes, or percentages.
- Keep wording calm and simple.`;

  const user = `Translate this JSON into ${targetName}:
${JSON.stringify(payload)}`;

  const provider = String(process.env.AI_PROVIDER || 'openai').toLowerCase();
  let text = '';

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const model = normalizeGeminiModelName(process.env.GEMINI_MODEL || 'gemini-1.5-flash');
    if (!apiKey) return { ok: false, reason: 'GEMINI_API_KEY not set' };

    async function callGeminiJson(promptText, systemText) {
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });
      const data = await safeJson(res);
      return { res, data };
    }

    const firstCall = await callGeminiJson(user, system);
    if (!firstCall.res.ok) {
      const msg = extractGoogleErrorMessage(firstCall.data);
      return {
        ok: false,
        reason: `AI translation failed (${firstCall.res.status})${msg ? `: ${msg}` : ''}`
      };
    }

    text =
      firstCall.data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        .filter(Boolean)
        .join('') ?? '';

    // If Gemini still didn't return clean JSON, try one strict retry.
    if (!extractFirstJsonObject(text)) {
      const strictSystem = `${system}\n\nOutput MUST be a single JSON object, nothing else.`;
      const retry = await callGeminiJson(user, strictSystem);
      if (retry.res.ok) {
        text =
          retry.data?.candidates?.[0]?.content?.parts
            ?.map((p) => p?.text)
            .filter(Boolean)
            .join('') ?? text;
      }
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) return { ok: false, reason: 'OPENAI_API_KEY not set' };

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    const data = await safeJson(res);
    if (!res.ok) {
      return { ok: false, reason: `AI translation failed (${res.status})` };
    }
    text = data?.choices?.[0]?.message?.content ?? '';
  }

  const parsed = extractFirstJsonObject(text);
  if (!parsed) return { ok: false, reason: 'AI translation was not valid JSON' };

  const translated = {
    verdict: parsed.verdict,
    whyThisMatters: parsed.whyThisMatters,
    whyYouMightCare: parsed.whyYouMightCare,
    uncertainty: parsed.uncertainty,
    betterChoiceHint: parsed.betterChoiceHint,
    closure: parsed.closure,
    confidence
  };

  if (!validateTranslatedDecisionCard(translated, confidence)) {
    return { ok: false, reason: 'AI translation failed validation' };
  }

  return { ok: true, decisionCard: translated };
}

function validateTranslatedLabels(obj) {
  const required = [
    'decisionCard',
    'verdict',
    'whyThisMatters',
    'whyYouMightCare',
    'confidence',
    'uncertainty',
    'betterChoiceHint',
    'closure'
  ];
  if (!obj || typeof obj !== 'object') return false;
  for (const k of required) {
    if (typeof obj[k] !== 'string' || !obj[k].trim()) return false;
    if (/\d/.test(obj[k])) return false;
  }
  return true;
}

export async function translateUiLabelsWithAI({ labels, language }) {
  const langCode = String(language || 'en');
  if (langCode.toLowerCase() === 'en') return { ok: true, labels };

  const targetName = languageNameFromCode(langCode);
  const base = labels && typeof labels === 'object' ? labels : null;
  if (!base) return { ok: false, reason: 'No labels provided' };

  const system = `You translate short UI labels for SafePlate into ${targetName}.

Strict rules:
- Output MUST be valid JSON only. No markdown.
- Keep the same JSON keys.
- Do NOT add numbers.
- Keep wording short.`;

  const user = `Translate this JSON into ${targetName}:
${JSON.stringify(base)}`;

  const provider = String(process.env.AI_PROVIDER || 'openai').toLowerCase();
  let text = '';

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const model = normalizeGeminiModelName(process.env.GEMINI_MODEL || 'gemini-1.5-flash');
    if (!apiKey) return { ok: false, reason: 'GEMINI_API_KEY not set' };

    async function callGeminiJson(promptText, systemText) {
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });
      const data = await safeJson(res);
      return { res, data };
    }

    const firstCall = await callGeminiJson(user, system);
    if (!firstCall.res.ok) {
      const msg = extractGoogleErrorMessage(firstCall.data);
      return { ok: false, reason: `AI label translation failed (${firstCall.res.status})${msg ? `: ${msg}` : ''}` };
    }

    text =
      firstCall.data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        .filter(Boolean)
        .join('') ?? '';

    if (!extractFirstJsonObject(text)) {
      const strictSystem = `${system}\n\nOutput MUST be a single JSON object, nothing else.`;
      const retry = await callGeminiJson(user, strictSystem);
      if (retry.res.ok) {
        text =
          retry.data?.candidates?.[0]?.content?.parts
            ?.map((p) => p?.text)
            .filter(Boolean)
            .join('') ?? text;
      }
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) return { ok: false, reason: 'OPENAI_API_KEY not set' };

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    const data = await safeJson(res);
    if (!res.ok) return { ok: false, reason: `AI label translation failed (${res.status})` };
    text = data?.choices?.[0]?.message?.content ?? '';
  }

  const parsed = extractFirstJsonObject(text);
  if (!parsed) return { ok: false, reason: 'AI label translation was not valid JSON' };
  if (!validateTranslatedLabels(parsed)) return { ok: false, reason: 'AI label translation failed validation' };
  return { ok: true, labels: parsed };
}

function normalizeGeminiModelName(model) {
  if (typeof model !== 'string' || !model.trim()) return 'gemini-1.5-flash';
  // Gemini Developer API expects model ids like "gemini-1.5-flash" (without "models/")
  return model.trim().replace(/^models\//i, '');
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractGoogleErrorMessage(json) {
  const msg = json?.error?.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return null;
}

function extractRetryAfterSeconds(message) {
  if (typeof message !== 'string') return null;
  const m = message.match(/retry\s+in\s+([0-9]+(?:\.[0-9]+)?)\s*s/i);
  if (!m) return null;
  const seconds = Number(m[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

async function listGeminiModels({ apiKey, baseUrl }) {
  const url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'GET' });
  const json = await safeJson(res);
  if (!res.ok) {
    return { ok: false, reason: `Model list failed (${res.status})${extractGoogleErrorMessage(json) ? `: ${extractGoogleErrorMessage(json)}` : ''}` };
  }
  const models = Array.isArray(json?.models) ? json.models : [];
  // Return names like "models/gemini-1.5-flash"; we normalize later.
  return {
    ok: true,
    models: models
      .map((m) => ({
        name: m?.name,
        supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : []
      }))
      .filter((m) => typeof m.name === 'string' && m.name.startsWith('models/'))
  };
}

function buildSafePlateSystemPrompt() {
  // This is the product behavior contract.
  // Keep it strict and decision-focused.
  return `You are SafePlate, an AI-native food decision co-pilot.

Your job is NOT to list ingredients or educate users about food science.
Your job is to help users DECIDE quickly and calmly whether a food product is suitable.

Context:
- The user has scanned the back label of a packaged food product.
- Ingredient data may be incomplete, noisy, or partially incorrect.
- You must reason with limited information.
- The user expects a clear decision, not raw data.

Core Intent:
When a label is scanned, assume the user's intent is:
"Is this okay to eat?"

Strict Rules:
1. NEVER show:
   - Full ingredient lists
   - Nutrition tables
   - Chemical codes (INS numbers, E-numbers)
   - Percentages or exact quantities
2. NEVER ask the user questions.
3. NEVER ask the user to configure goals, diets, or preferences.
4. NEVER use fear-based language (e.g., "dangerous", "toxic", "harmful").
5. Be honest about uncertainty when information is missing.
6. Keep output short, calm, and decision-focused.

Your Output MUST follow this exact structure:

--------------------------------------------------
DECISION CARD

Verdict: [Safe / Okay Occasionally / Better to Avoid]

Why this matters:
• [Reason 1 written in plain human language]
• [Reason 2 if relevant, otherwise omit]
• [Reason 3 in rare cases, otherwise omit]



Why you might care:
• [Two intent-inferred reason that applies to most people]

Confidence:
[Number between 50% and 90%]%

Uncertainty:
• [One short line explaining what is unknown or assumed]

Better choice hint (optional, non-pushy):
• [General advice without naming brands or products]

Closure:
• [One calm sentence that helps the user move on]
--------------------------------------------------

Tone Guidelines:
- Calm, neutral, supportive
- No alarmist wording
- No moral judgment
- No medical claims

Clarity Guidelines (VERY IMPORTANT):
- Use everyday words a typical person would use.
- Do NOT use chemical or technical additive names.
- If something seems like an additive, describe it as a broad category (e.g., "preservatives", "added sweeteners", "flavorings") without naming specific compounds.
- Keep each bullet short (aim for 8–14 words).
- Avoid parentheses and jargon.

Number/Quantity Rules (VERY IMPORTANT):
- Do NOT include any exact numbers, units, calories, grams, milligrams, or serving amounts.
- Do NOT repeat any nutrition-facts numbers from the scan.
- The ONLY allowed number is the Confidence percent in the Confidence section.

Reasoning Guidelines:
- Group ingredients into human concepts (e.g., "added sugars", "preservatives", "refined oils")
- Focus on what typically affects daily consumption decisions
- Prefer practical reasoning over technical accuracy
- Use uncertainty as a feature, not a weakness

Return ONLY the Decision Card text. Do not include anything before or after it.`;
}

function stripCodeFences(text) {
  if (typeof text !== 'string') return '';
  // Remove common markdown fences (``` / ```text / ```json)
  return text.replace(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/g, '$1');
}

function extractDecisionCardBlock(rawText) {
  const text = stripCodeFences(rawText).trim();
  if (!text) return '';

  // Prefer extracting the exact block between dashed separators.
  const start = text.indexOf('--------------------------------------------------');
  if (start >= 0) {
    const end = text.lastIndexOf('--------------------------------------------------');
    if (end > start) {
      const block = text.slice(start, end + '--------------------------------------------------'.length);
      return block.trim();
    }
    return text.slice(start).trim();
  }

  // Fallback: if model forgot separators, try to extract from DECISION CARD onward.
  const dc = text.toLowerCase().indexOf('decision card');
  if (dc >= 0) return text.slice(dc).trim();
  return text;
}

function normalizeBullets(text) {
  // Convert '-', '*', '•' variants to the required "• " bullet.
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s+/, '• '))
    .join('\n');
}

function normalizeDecisionCardText(rawText) {
  const block = extractDecisionCardBlock(rawText);
  if (!block) return '';
  return normalizeBullets(block).trim();
}

function looksLikeFullIngredientsList(text) {
  // We do not want an explicit ingredient list echoed.
  // Only treat it as such when it looks like a label header.
  return /\bingredients\b\s*:/i.test(text);
}

function stripConfidencePercent(text) {
  // The SafePlate format requires a percent in the Confidence block.
  // Strip it before scanning for disallowed percentages elsewhere.
  return text.replace(/\nConfidence:\n\s*(?:[5-8]\d|90)%\s*\n/i, '\nConfidence:\n[redacted]\n');
}

function containsBannedCodesOrQuantities(text) {
  const hasENumbers = /\bE\s?\d{3,4}\b/i.test(text);
  const hasINS = /\bINS\s?\d{3,4}\b/i.test(text);
  const withoutConfidence = stripConfidencePercent(text);
  const hasPercentElsewhere = /\b\d{1,3}\s*%\b/.test(withoutConfidence);

  // Ban exact quantities (numbers/decimals/units) anywhere outside Confidence.
  // This includes kcal/kj, g/mg, and bare numbers.
  const hasUnits = /\b\d+(?:\.\d+)?\s*(?:kcal|kj|g|mg|mcg|μg|ug|ml|l)\b/i.test(withoutConfidence);
  const hasAnyNumber = /\b\d+(?:\.\d+)?\b/.test(withoutConfidence);

  return hasENumbers || hasINS || hasPercentElsewhere || hasUnits || hasAnyNumber;
}

export function isValidDecisionCardText(text) {
  if (typeof text !== 'string') return false;
  const trimmed = normalizeDecisionCardText(text);
  if (!trimmed) return false;

  if (!trimmed.startsWith('--------------------------------------------------')) return false;
  if (!trimmed.includes('\nDECISION CARD\n')) return false;
  if (!/\nVerdict:\s*(Safe|Okay Occasionally|Better to Avoid)\s*\n/i.test(trimmed)) return false;
  if (!/\nWhy this matters:\n/i.test(trimmed)) return false;
  if (!/\nWhy you might care:\n/i.test(trimmed)) return false;
  if (!/\nConfidence:\n\s*(?:[5-8]\d|90)%\s*\n/i.test(trimmed)) return false;
  if (!/\nUncertainty:\n/i.test(trimmed)) return false;
  if (!/\nClosure:\n/i.test(trimmed)) return false;
  if (!trimmed.endsWith('--------------------------------------------------')) return false;

  if (looksLikeFullIngredientsList(trimmed)) return false;
  if (containsBannedCodesOrQuantities(trimmed)) return false;

  // Must not ask questions.
  if (/\?\s*$|\?\n|\?\r\n/.test(trimmed)) return false;

  return true;
}

export function parseDecisionCardText(text) {
  // Parses the strict card format into structured fields.
  // If parsing fails, return null.
  const normalized = normalizeDecisionCardText(text);
  if (!isValidDecisionCardText(normalized)) return null;

  const verdictMatch = normalized.match(/\nVerdict:\s*(Safe|Okay Occasionally|Better to Avoid)\s*\n/i);
  const confidenceMatch = normalized.match(/\nConfidence:\n\s*([5-8]\d|90)%\s*\n/i);

  const section = (title) => {
    const re = new RegExp(`\\n${title}:\\n([\\s\\S]*?)(?=\\n[A-Za-z ].*?:\\n|\\n--------------------------------------------------)`, 'i');
    const m = normalized.match(re);
    return m ? m[1].trim() : '';
  };

  const bulletLines = (block) =>
    block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('• '))
      .map((l) => l.replace(/^•\s+/, '').trim());

  const whyThisMatters = bulletLines(section('Why this matters')).slice(0, 2);
  const whyYouMightCare = bulletLines(section('Why you might care')).slice(0, 1);
  const uncertainty = bulletLines(section('Uncertainty'))[0] ?? '';
  const betterChoiceHint = bulletLines(
    section('Better choice hint (optional, non-pushy)') || section('Better choice hint')
  ).slice(0, 1);
  const closure = bulletLines(section('Closure'))[0] ?? '';

  const verdict = verdictMatch?.[1] ?? null;
  const confidence = confidenceMatch ? Number(confidenceMatch[1]) : null;

  if (!verdict || !confidence || !uncertainty || !closure || whyThisMatters.length === 0 || whyYouMightCare.length === 0) {
    return null;
  }

  return {
    verdict,
    whyThisMatters,
    whyYouMightCare,
    confidence,
    uncertainty,
    betterChoiceHint: betterChoiceHint.length ? betterChoiceHint : undefined,
    closure
  };
}

function buildRepairPrompt(previousText) {
  return `Rewrite the text below into the EXACT SafePlate Decision Card format.

Rules:
- Output ONLY the Decision Card block.
- Do NOT include any ingredient list, nutrition table, chemical codes, or percentages anywhere EXCEPT the required Confidence percent line.
- Do NOT ask questions.
- Keep it calm, short, decision-focused.
- Use very simple everyday language; avoid chemical/technical names.
- Keep bullets short.
- Do NOT include any numbers or units anywhere except Confidence.
- Use the bullet character "• " for every bullet line.

Text to rewrite:
"""
${previousText}
"""`;
}

function buildSimplifyPrompt(validCardText) {
  return `Simplify the language in the Decision Card below.

Constraints:
- Preserve the EXACT structure and headings.
- Preserve the dashed separators.
- Keep the same verdict.
- Keep confidence as a single percent between 50% and 90%.
- Use everyday words only. Do NOT use chemical or technical additive names.
- Keep bullets short (aim for 8–14 words). No parentheses.
- Do NOT include any numbers or units anywhere except Confidence.
- Do NOT add ingredients, nutrition tables, codes, or extra percentages.
- Do NOT ask questions.

Decision Card:
"""
${validCardText}
"""`;
}

function complexityScore(text) {
  if (typeof text !== 'string') return 0;
  const t = text;
  let score = 0;
  if (/[()\[\]{}]/.test(t)) score += 2;
  // Long tokens often indicate technical terms.
  const longTokens = (t.match(/\b[A-Za-z]{15,}\b/g) || []).length;
  score += Math.min(6, longTokens);
  // Common technical-ish suffixes (heuristic).
  const techy = (t.match(/\b[A-Za-z]+(?:ate|ite|ide|ose|one|ium|ate)\b/gi) || []).length;
  score += Math.min(4, techy);
  return score;
}

function finalizeDecision(text) {
  const normalized = normalizeDecisionCardText(text);
  if (!isValidDecisionCardText(normalized)) {
    return { ok: false, reason: 'AI returned invalid format or disallowed content' };
  }

  const parsed = parseDecisionCardText(normalized);
  if (!parsed) {
    return { ok: false, reason: 'AI response could not be parsed' };
  }

  return { ok: true, decisionCardText: normalized.trim(), decisionCard: parsed };
}

export async function decideWithAI({ scannedText }) {
  const system = buildSafePlateSystemPrompt();
  const user = `Scanned label text (may be incomplete/noisy):\n\n${typeof scannedText === 'string' ? scannedText : ''}\n\nRemember: do not quote or repeat the scan; output only the Decision Card.`;

  const provider = String(process.env.AI_PROVIDER || 'openai').toLowerCase();

  let text;
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const model = normalizeGeminiModelName(process.env.GEMINI_MODEL || 'gemini-1.5-flash');
    if (!apiKey) return { ok: false, reason: 'GEMINI_API_KEY not set' };

    async function callGemini(modelName, userText) {
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(
        normalizeGeminiModelName(modelName)
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.2 }
      })
    });

      const data = await safeJson(res);
      return { res, data, url };
    }

    // First try the configured model. Track the model we end up using.
    let selectedModel = model;
    let { res, data } = await callGemini(selectedModel, user);

    // If the model is not found, try to auto-discover and retry with a close match.
    if (res.status === 404) {
      const listed = await listGeminiModels({ apiKey, baseUrl });
      if (listed.ok) {
        const supported = listed.models
          .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
          .map((m) => normalizeGeminiModelName(m.name));

        const normalized = supported.length ? supported : listed.models.map((m) => normalizeGeminiModelName(m.name));
        const desired = normalizeGeminiModelName(model);
        const fallback =
          normalized.find((n) => n.toLowerCase() === desired.toLowerCase()) ||
          normalized.find((n) => /flash/i.test(n)) ||
          normalized.find((n) => /gemini/i.test(n)) ||
          null;

        if (fallback) {
          selectedModel = fallback;
          const retry = await callGemini(selectedModel, user);
          res = retry.res;
          data = retry.data;
        }
      }
    }

    if (!res.ok) {
      const msg = extractGoogleErrorMessage(data);
      const reason = `AI request failed (${res.status})${msg ? `: ${msg}` : ''}`;
      const retryAfterSeconds = extractRetryAfterSeconds(msg);
      return { ok: false, reason, status: res.status, retryAfterSeconds };
    }

    text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        .filter(Boolean)
        .join('') ?? '';

    // If validation/parsing fails, try a strict repair pass.
    const first = finalizeDecision(text);
    if (!first.ok && typeof text === 'string' && text.trim()) {
      const repairUser = buildRepairPrompt(text);
      const repaired = await callGemini(selectedModel, repairUser);
      if (repaired.res.ok) {
        const repairedText =
          repaired.data?.candidates?.[0]?.content?.parts
            ?.map((p) => p?.text)
            .filter(Boolean)
            .join('') ?? '';
        const repairedFinal = finalizeDecision(repairedText);
        if (repairedFinal.ok && complexityScore(repairedFinal.decisionCardText) >= 3) {
          const simplified = await callGemini(selectedModel, buildSimplifyPrompt(repairedFinal.decisionCardText));
          if (simplified.res.ok) {
            const simplifiedText =
              simplified.data?.candidates?.[0]?.content?.parts
                ?.map((p) => p?.text)
                .filter(Boolean)
                .join('') ?? '';
            const simplifiedFinal = finalizeDecision(simplifiedText);
            if (simplifiedFinal.ok) return simplifiedFinal;
          }
        }
        return repairedFinal;
      }
      const msg = extractGoogleErrorMessage(repaired.data);
      const reason = `AI request failed (${repaired.res.status})${msg ? `: ${msg}` : ''}`;
      const retryAfterSeconds = extractRetryAfterSeconds(msg);
      return { ok: false, reason, status: repaired.res.status, retryAfterSeconds };
    }

    if (first.ok && complexityScore(first.decisionCardText) >= 3) {
      const simplified = await callGemini(selectedModel, buildSimplifyPrompt(first.decisionCardText));
      if (simplified.res.ok) {
        const simplifiedText =
          simplified.data?.candidates?.[0]?.content?.parts
            ?.map((p) => p?.text)
            .filter(Boolean)
            .join('') ?? '';
        const simplifiedFinal = finalizeDecision(simplifiedText);
        if (simplifiedFinal.ok) return simplifiedFinal;
      }
    }

    return first;
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) return { ok: false, reason: 'OPENAI_API_KEY not set' };

    async function callOpenAI(userText) {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText }
        ]
      })
      });

      const data = await safeJson(res);
      return { res, data };
    }

    const firstCall = await callOpenAI(user);
    if (!firstCall.res.ok) {
      return { ok: false, reason: `AI request failed (${firstCall.res.status})`, status: firstCall.res.status };
    }

    text = firstCall.data?.choices?.[0]?.message?.content;

    const first = finalizeDecision(text);
    if (!first.ok && typeof text === 'string' && text.trim()) {
      const repairedCall = await callOpenAI(buildRepairPrompt(text));
      if (!repairedCall.res.ok) {
        return { ok: false, reason: `AI request failed (${repairedCall.res.status})`, status: repairedCall.res.status };
      }
      const repairedText = repairedCall.data?.choices?.[0]?.message?.content;
      const repairedFinal = finalizeDecision(repairedText);
      if (repairedFinal.ok && complexityScore(repairedFinal.decisionCardText) >= 3) {
        const simplifiedCall = await callOpenAI(buildSimplifyPrompt(repairedFinal.decisionCardText));
        if (simplifiedCall.res.ok) {
          const simplifiedText = simplifiedCall.data?.choices?.[0]?.message?.content;
          const simplifiedFinal = finalizeDecision(simplifiedText);
          if (simplifiedFinal.ok) return simplifiedFinal;
        }
      }
      return repairedFinal;
    }

    if (first.ok && complexityScore(first.decisionCardText) >= 3) {
      const simplifiedCall = await callOpenAI(buildSimplifyPrompt(first.decisionCardText));
      if (simplifiedCall.res.ok) {
        const simplifiedText = simplifiedCall.data?.choices?.[0]?.message?.content;
        const simplifiedFinal = finalizeDecision(simplifiedText);
        if (simplifiedFinal.ok) return simplifiedFinal;
      }
    }

    return first;
  }
}
