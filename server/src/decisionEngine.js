function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeInput(scannedText) {
  if (typeof scannedText !== 'string') return '';
  return scannedText
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function countMatches(text, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) count += 1;
  }
  return count;
}

function hasAny(text, patterns) {
  return patterns.some((p) => p.test(text));
}

export function formatDecisionCardText(decision) {
  const lines = [];
  lines.push('--------------------------------------------------');
  lines.push('DECISION CARD');
  lines.push('');
  lines.push(`Verdict: ${decision.verdict}`);
  lines.push('');
  lines.push('Why this matters:');
  for (const reason of (decision.whyThisMatters ?? []).slice(0, 2)) {
    lines.push(`• ${reason}`);
  }
  lines.push('');
  lines.push('Why you might care:');
  const careLine = (decision.whyYouMightCare ?? [])[0];
  if (careLine) lines.push(`• ${careLine}`);
  lines.push('');
  lines.push('Confidence:');
  lines.push(`${decision.confidence}%`);
  lines.push('');
  lines.push('Uncertainty:');
  lines.push(`• ${decision.uncertainty}`);

  if (Array.isArray(decision.betterChoiceHint) && decision.betterChoiceHint.length > 0) {
    lines.push('');
    lines.push('Better choice hint (optional, non-pushy):');
    lines.push(`• ${decision.betterChoiceHint[0]}`);
  }

  lines.push('');
  lines.push('Closure:');
  lines.push(`• ${decision.closure}`);
  lines.push('--------------------------------------------------');
  return lines.join('\n');
}

// This is a pragmatic heuristic engine.
// It must never echo ingredient lists or nutrition tables back to the user.
export function decideFromScan({ scannedText }) {
  const text = normalizeInput(scannedText);

  const uncertaintyLine = text
    ? 'Scan may be incomplete or misread.'
    : 'No readable label text detected.';

  if (!text) {
    return {
      verdict: 'Okay Occasionally',
      whyThisMatters: [
        "I can't reliably screen what's in this without a readable scan.",
        'Treating it as occasional is the calm default when details are missing.'
      ],
      whyYouMightCare: ['Small differences matter most when you eat something often.'],
      confidence: 55,
      uncertainty: uncertaintyLine,
      betterChoiceHint: ['For everyday picks, choose simpler, less processed options.'],
      closure: 'This is fine to have once in a while.'
    };
  }

  // NOTE: Avoid listing ingredients. We only use broad category signals.
  const ultraProcessedSignals = [
    /artificial\s+flavou?r/i,
    /artificial\s+sweeten/i,
    /flavou?r\s+enhancer/i,
    /emulsifier/i,
    /stabilizer/i,
    /thickener/i,
    /preservative/i,
    /colour|color/i,
    /hydrogenated/i
  ];

  const highSweetnessSignals = [
    /sugar/i,
    /syrup/i,
    /glucose/i,
    /fructose/i,
    /maltodextrin/i,
    /honey/i
  ];

  const highSaltSignals = [/salt/i, /sodium/i];

  const friedOrRefinedFatSignals = [
    /palm\s+oil/i,
    /vegetable\s+oil/i,
    /shortening/i
  ];

  const maybeSensitiveSignals = [
    /milk|dairy/i,
    /soy/i,
    /wheat|gluten/i,
    /nuts?|peanut/i,
    /egg/i,
    /fish|shellfish/i
  ];

  const upCount = countMatches(text, ultraProcessedSignals);
  const sweetCount = countMatches(text, highSweetnessSignals);
  const saltCount = countMatches(text, highSaltSignals);
  const fatCount = countMatches(text, friedOrRefinedFatSignals);

  const hasAllergenInfo = hasAny(text, [/contains/i, /allergen/i, /may\s+contain/i]);
  const hasSensitiveItems = hasAny(text, maybeSensitiveSignals);

  // Scoring: simple, interpretable.
  let score = 0;
  score += upCount * 2;
  score += sweetCount * 2;
  score += saltCount * 1;
  score += fatCount * 1;

  // If label explicitly flags allergens and we see common allergens, we increase uncertainty,
  // but we do NOT make medical claims or ask user questions.
  const sensitiveNote = hasAllergenInfo && hasSensitiveItems;

  let verdict = 'Safe';
  let confidence = 78;

  if (score >= 7) {
    verdict = 'Better to Avoid';
    confidence = 74;
  } else if (score >= 3) {
    verdict = 'Okay Occasionally';
    confidence = 76;
  }

  // Build reasons without naming specific ingredients.
  const why = [];

  if (upCount >= 2) {
    why.push('It reads like a more processed packaged item, which is usually best kept occasional.');
  }
  if (sweetCount >= 2) {
    why.push('It likely leans sweeter than an everyday choice.');
  } else if (saltCount >= 2) {
    why.push('It likely leans saltier than an everyday choice.');
  }
  if (why.length === 0) {
    why.push("Nothing obvious in the scan suggests it's a frequent-limit kind of item.");
  }

  const whyYouMightCare = [
    verdict === 'Safe'
      ? "If you're trying to keep everyday choices simple, this looks compatible."
      : "If you're choosing something often, picking a less processed option usually feels better."
  ];

  const uncertaintyBits = [];
  uncertaintyBits.push('Scan may be incomplete or misread.');
  if (sensitiveNote) uncertaintyBits.push('Label appears to mention common allergen categories.');

  const uncertainty = uncertaintyBits[0];

  let betterChoiceHint;
  if (verdict !== 'Safe') {
    betterChoiceHint = ['For regular use, pick options that are less sweet/salty and less processed.'];
  }

  let closure = "You're okay enjoying this occasionally.";
  if (verdict === 'Safe') closure = 'Go ahead and enjoy it.';
  if (verdict === 'Better to Avoid') closure = "You might want to skip this if you're choosing often.";

  return {
    verdict,
    whyThisMatters: why.slice(0, 2),
    whyYouMightCare,
    confidence: clamp(confidence, 50, 90),
    uncertainty,
    betterChoiceHint,
    closure
  };
}
