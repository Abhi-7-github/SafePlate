// India (scheduled languages) + English fallback.
// List includes: Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri,
// Konkani, Maithili, Malayalam, Manipuri (Meitei), Marathi, Nepali, Odia,
// Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, Urdu.
const SUPPORTED = [
  'en',
  'as',
  'bn',
  'brx',
  'doi',
  'gu',
  'hi',
  'kn',
  'ks',
  'kok',
  'mai',
  'ml',
  'mni-Mtei',
  'mr',
  'ne',
  'or',
  'pa',
  'sa',
  'sat',
  'sd',
  'ta',
  'te',
  'ur'
];

export function normalizeLanguage(lang) {
  if (typeof lang !== 'string') return 'en';
  const t = lang.trim();
  if (!t) return 'en';
  // Prefer exact match first (e.g., mni-Mtei).
  const exact = SUPPORTED.find((x) => x.toLowerCase() === t.toLowerCase());
  if (exact) return exact;

  // Otherwise try base language (e.g., hi-IN -> hi).
  const base = t.split(/[-_]/)[0].toLowerCase();
  return SUPPORTED.includes(base) ? base : 'en';
}

const UI = {
  en: {
    decisionCard: 'DECISION CARD',
    verdict: 'Verdict:',
    whyThisMatters: 'Why this matters:',
    whyYouMightCare: 'Why you might care:',
    confidence: 'Confidence:',
    uncertainty: 'Uncertainty:',
    betterChoiceHint: 'Better choice hint (optional, non-pushy):',
    closure: 'Closure:'
  },
  hi: {
    decisionCard: 'निर्णय कार्ड',
    verdict: 'निर्णय:',
    whyThisMatters: 'यह क्यों मायने रखता है:',
    whyYouMightCare: 'आपको क्यों परवाह हो सकती है:',
    confidence: 'विश्वास:',
    uncertainty: 'अनिश्चितता:',
    betterChoiceHint: 'बेहतर विकल्प संकेत (वैकल्पिक, बिना दबाव):',
    closure: 'समापन:'
  }
};

export function getUiLabels(language) {
  const lang = normalizeLanguage(language);
  return UI[lang] || UI.en;
}

const VERDICT = {
  en: {
    Safe: 'Safe',
    'Okay Occasionally': 'Okay Occasionally',
    'Better to Avoid': 'Better to Avoid'
  },
  hi: {
    Safe: 'ठीक है',
    'Okay Occasionally': 'कभी-कभी ठीक',
    'Better to Avoid': 'बेहतर है बचें'
  },
  // For other Indian languages, we currently keep the verdict in English unless we add
  // explicit translations. This avoids incorrect translations.
};

function ensureArray(a) {
  return Array.isArray(a) ? a : [];
}

export function localizeDecisionCard({ decisionCard, language, labelsOverride }) {
  const lang = normalizeLanguage(language);
  const labels = labelsOverride || UI[lang] || UI.en;
  const translateVerdict = decisionCard?.translateVerdict !== false;

  if (!decisionCard || typeof decisionCard !== 'object') {
    return { language: lang, labels };
  }

  const verdictRaw = typeof decisionCard.verdict === 'string' ? decisionCard.verdict : '';
  const verdict = translateVerdict ? (VERDICT[lang] && VERDICT[lang][verdictRaw]) || verdictRaw : verdictRaw;

  // For AI-generated content, we keep the explanation lines as-is (English)
  // because they are freeform and we avoid unsafe/incorrect translations without a translation service.
  // For heuristic decisions, lines are already safe and small; still keep as-is for now.
  const card = {
    verdict,
    whyThisMatters: ensureArray(decisionCard.whyThisMatters),
    whyYouMightCare: ensureArray(decisionCard.whyYouMightCare),
    confidence: decisionCard.confidence,
    uncertainty: decisionCard.uncertainty,
    betterChoiceHint: decisionCard.betterChoiceHint,
    closure: decisionCard.closure
  };

  return { language: lang, labels, decisionCard: card };
}

export function formatLocalizedDecisionCardText({ localized }) {
  const labels = localized?.labels || UI.en;
  const card = localized?.decisionCard;
  if (!card) return '';

  const lines = [];
  lines.push('--------------------------------------------------');
  lines.push(labels.decisionCard);
  lines.push('');
  lines.push(`${labels.verdict} ${card.verdict}`);
  lines.push('');
  lines.push(labels.whyThisMatters);
  for (const reason of ensureArray(card.whyThisMatters).slice(0, 2)) {
    lines.push(`• ${reason}`);
  }
  lines.push('');
  lines.push(labels.whyYouMightCare);
  for (const line of ensureArray(card.whyYouMightCare).slice(0, 1)) {
    lines.push(`• ${line}`);
  }
  lines.push('');
  lines.push(labels.confidence);
  lines.push(`${card.confidence}%`);
  lines.push('');
  lines.push(labels.uncertainty);
  lines.push(`• ${card.uncertainty}`);

  if (Array.isArray(card.betterChoiceHint) && card.betterChoiceHint.length > 0) {
    lines.push('');
    lines.push(labels.betterChoiceHint);
    lines.push(`• ${card.betterChoiceHint[0]}`);
  }

  lines.push('');
  lines.push(labels.closure);
  lines.push(`• ${card.closure}`);
  lines.push('--------------------------------------------------');
  return lines.join('\n');
}
