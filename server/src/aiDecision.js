import fetch from 'node-fetch';

/* =========================================================
   LANGUAGE HELPERS
========================================================= */

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

/* =========================================================
   JSON SAFETY
========================================================= */

function extractFirstJsonObject(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function containsDigitsOrQuestionMarks(v) {
  return typeof v === 'string' && (/\d/.test(v) || /\?/.test(v));
}

/* =========================================================
   VALIDATION
========================================================= */

function validateTranslatedDecisionCard(card, confidence) {
  if (!card || typeof card !== 'object') return false;

  const fields = [
    card.verdict,
    ...(card.whyThisMatters || []),
    ...(card.whyYouMightCare || []),
    card.uncertainty,
    ...(card.betterChoiceHint || []),
    card.closure
  ];

  if (fields.some(v => typeof v !== 'string' || !v.trim())) return false;
  if (fields.some(containsDigitsOrQuestionMarks)) return false;
  if (card.confidence !== confidence) return false;

  return true;
}

/* =========================================================
   TRANSLATE DECISION CARD
========================================================= */

export async function translateDecisionCardWithAI({ decisionCard, language }) {
  if (!decisionCard || typeof decisionCard !== 'object') {
    return { ok: false, reason: 'Invalid decision card' };
  }

  const lang = String(language || 'en');
  if (lang.toLowerCase() === 'en') {
    return { ok: true, decisionCard };
  }

  const confidence = decisionCard.confidence;
  if (typeof confidence !== 'number') {
    return { ok: false, reason: 'Invalid confidence value' };
  }

  const target = languageNameFromCode(lang);

  const payload = {
    verdict: decisionCard.verdict,
    whyThisMatters: decisionCard.whyThisMatters.slice(0, 2),
    whyYouMightCare: decisionCard.whyYouMightCare.slice(0, 1),
    uncertainty: decisionCard.uncertainty,
    betterChoiceHint: decisionCard.betterChoiceHint?.slice(0, 1) || [],
    closure: decisionCard.closure
  };

  const system = `
You are SafePlate’s translation engine.

Your task:
Translate meaning only into ${target}.

STRICT RULES:
- Output JSON only
- Keep the same keys
- Keep array lengths identical
- No numbers
- No question marks
- No new ideas
- No food facts
- Calm, simple language
`;

  const user = `Translate this JSON:\n${JSON.stringify(payload)}`;

  const { text, error } = await callOpenAI(system, user);
  if (error) return error;

  const parsed = extractFirstJsonObject(text);
  if (!parsed) return { ok: false, reason: 'Invalid JSON from AI' };

  const translated = { ...parsed, confidence };

  if (!validateTranslatedDecisionCard(translated, confidence)) {
    return { ok: false, reason: 'Validation failed' };
  }

  return { ok: true, decisionCard: translated };
}

/* =========================================================
   SAFEPLATE CORE PROMPT (IMPROVED)
========================================================= */

function buildSafePlateSystemPrompt() {
  return `
You are SafePlate — an AI food decision co-pilot.

PRIMARY GOAL:
Help the user decide quickly:
"Is this okay to eat?"

YOU MUST:
- Think for the user
- Be calm and neutral
- Give a clear verdict

YOU MUST NEVER:
- List ingredients
- Show nutrition values
- Use chemical or additive names
- Show codes, units, or quantities
- Ask questions
- Use fear language
- Give medical advice

ASSUME:
- Label data may be wrong or incomplete
- User wants clarity, not education

OUTPUT FORMAT (MANDATORY):

--------------------------------------------------
DECISION CARD

Verdict: Safe | Okay Occasionally | Better to Avoid

Why this matters:
• Reason one
• Reason two

Why you might care:
• One common reason

Confidence:
[number]% 

Uncertainty:
• What is assumed or missing

Better choice hint (optional, non-pushy):
• Simple general advice

Closure:
• One calm closing sentence
--------------------------------------------------

RULES:
- Bullets must start with "• "
- No numbers anywhere except Confidence
- No percentages except Confidence
- Use everyday language only
- Output ONLY the Decision Card
`;
}

/* =========================================================
   DECISION CALL
========================================================= */

export async function decideWithAI({ scannedText }) {
  const system = buildSafePlateSystemPrompt();
  const user = `
Scanned label text:
${scannedText || ''}

Remember:
- Do not quote the scan
- Output ONLY the Decision Card
`;

  const { text, error } = await callOpenAI(system, user);
  if (error) return error;

  return finalizeDecision(text);
}

/* =========================================================
   OPENAI CALL
========================================================= */

async function callOpenAI(system, user) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: { ok: false, reason: 'OPENAI_API_KEY missing' } };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  const data = await safeJson(res);
  if (!res.ok) {
    return { error: { ok: false, reason: 'AI request failed', status: res.status } };
  }

  return { text: data?.choices?.[0]?.message?.content || '' };
}

/* =========================================================
   FINAL VALIDATION
========================================================= */

function finalizeDecision(text) {
  if (!isValidDecisionCardText(text)) {
    return { ok: false, reason: 'Invalid decision card format' };
  }
  const parsed = parseDecisionCardText(text);
  if (!parsed) {
    return { ok: false, reason: 'Parsing failed' };
  }
  return { ok: true, decisionCardText: text.trim(), decisionCard: parsed };
}
