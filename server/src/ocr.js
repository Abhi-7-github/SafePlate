import { createWorker } from 'tesseract.js';

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return workerPromise;
}

function parseImageDataUrl(imageDataUrl) {
  if (typeof imageDataUrl !== 'string') return null;
  const trimmed = imageDataUrl.trim();
  const m = trimmed.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!m) return null;

  const base64 = m[2];
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer || buffer.length === 0) return null;
    return buffer;
  } catch {
    return null;
  }
}

function normalizePsm(psm) {
  const n = Number(psm);
  if (!Number.isFinite(n)) return 6;
  // Keep this intentionally narrow to avoid weird modes.
  if (n === 6) return 6; // single uniform block of text
  if (n === 11) return 11; // sparse text
  return 6;
}

export async function ocrFromImageDataUrl({ imageDataUrl, options }) {
  const buffer = parseImageDataUrl(imageDataUrl);
  if (!buffer) {
    return { ok: false, status: 400, error: 'Invalid imageDataUrl. Expected a base64 data URL.' };
  }

  const worker = await getWorker();

  try {
    // Page Segmentation Mode (PSM):
    // 6 = Assume a single uniform block of text (often good for labels)
    // 11 = Sparse text
    // We default to 6, but allow override via options.psm.
    // Note: tesseract.js accepts string values for parameters.
    // https://github.com/naptha/tesseract.js
    const psm = normalizePsm(options?.psm);
    await worker.setParameters({
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1'
    });

    const result = await worker.recognize(buffer);
    const text = typeof result?.data?.text === 'string' ? result.data.text : '';
    return { ok: true, text: text.trim() };
  } catch {
    return { ok: false, status: 503, error: 'OCR failed' };
  }
}
