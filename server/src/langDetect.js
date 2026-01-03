const SCRIPT_RANGES = [
  // Devanagari (Hindi, Marathi, Sanskrit, Maithili, Dogri)
  { code: 'hi', re: /[\u0900-\u097F]/g },
  // Bengali-Assamese (Bengali, Assamese)
  { code: 'bn', re: /[\u0980-\u09FF]/g },
  // Gurmukhi (Punjabi)
  { code: 'pa', re: /[\u0A00-\u0A7F]/g },
  // Gujarati
  { code: 'gu', re: /[\u0A80-\u0AFF]/g },
  // Odia
  { code: 'or', re: /[\u0B00-\u0B7F]/g },
  // Tamil
  { code: 'ta', re: /[\u0B80-\u0BFF]/g },
  // Telugu
  { code: 'te', re: /[\u0C00-\u0C7F]/g },
  // Kannada
  { code: 'kn', re: /[\u0C80-\u0CFF]/g },
  // Malayalam
  { code: 'ml', re: /[\u0D00-\u0D7F]/g },
  // Arabic script (Urdu, Sindhi, Kashmiri)
  { code: 'ur', re: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g },
  // Meitei Mayek (Manipuri)
  { code: 'mni-Mtei', re: /[\uABC0-\uABFF]/g },
  // Ol Chiki (Santali)
  { code: 'sat', re: /[\u1C50-\u1C7F]/g }
];

function countMatches(text, re) {
  if (typeof text !== 'string' || !text) return 0;
  const m = text.match(re);
  return m ? m.length : 0;
}

export default function detectIndianLanguageFromText(text) {
  if (typeof text !== 'string') return 'en';
  const t = text.trim();
  if (!t) return 'en';

  // If it contains any strong-script signal, pick the max.
  let best = { code: 'en', count: 0 };
  for (const r of SCRIPT_RANGES) {
    const c = countMatches(t, r.re);
    if (c > best.count) best = { code: r.code, count: c };
  }

  // Threshold: a few script chars to avoid false positives.
  if (best.count >= 6) return best.code;

  // Default: English/Latin.
  return 'en';
}

// Back-compat named export
export { detectIndianLanguageFromText };
