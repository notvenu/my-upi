import { parseReceipt, type Receipt } from './receipt.ts';

// Reads a bill photo: Gemini first (api/bill, when the server has a key), else on this device with Tesseract.
export async function readBill(img: ImageBitmap, onProgress: (p: number) => void): Promise<Receipt> {
  return (await viaGemini(img, onProgress)) ?? viaTesseract(img, onProgress);
}

// null when Gemini isn't set up, offline, or failed; the caller falls back to Tesseract.
async function viaGemini(img: ImageBitmap, onProgress: (p: number) => void): Promise<Receipt | null> {
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)); // plenty for a bill, keeps the upload small
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const jpeg = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  if (!jpeg) return null;
  onProgress(0.3);
  const res = await fetch('/api/bill', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: jpeg }).catch(() => null);
  if (!res?.ok) return null;
  onProgress(1);
  return res.json();
}

// A note typed in any shape → a Receipt, through Gemini. names: saved people and groups, so "pri" or "the flat" come back as the saved name.
// Throws a message fit for a toast.
export async function readNote(text: string, names: string[]): Promise<Receipt> {
  const res = await fetch('/api/bill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, names }) }).catch(() => null);
  if (!res) throw new Error('Reading a note needs internet');
  if (res.status === 501) throw new Error('Reading notes needs GEMINI_API_KEY on the server');
  if (res.status === 429) throw new Error('Too many notes in a minute. Wait a few seconds and send it again.');
  if (!res.ok) throw new Error("Couldn't read that note. Try again, or add it by hand.");
  return res.json();
}

// The English model downloads once, then it's cached.
// The photo is shrunk and turned grey and high-contrast first, which reads thermal receipts noticeably better.
async function viaTesseract(img: ImageBitmap, onProgress: (p: number) => void): Promise<Receipt> {
  onProgress(0);
  const { createWorker } = await import('tesseract.js');
  const k = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d')!;
  ctx.filter = 'grayscale(1) contrast(1.5)';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const worker = await createWorker('eng', 1, {
    logger: (m) => { if (m.status === 'recognizing text') onProgress(m.progress); },
  });
  try {
    const { data } = await worker.recognize(c);
    return parseReceipt(data.text);
  } finally {
    await worker.terminate();
  }
}
