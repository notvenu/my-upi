import { parseReceipt, type Receipt } from './receipt.ts';

// Reads a bill photo on this device with Tesseract (the English model downloads once, then it's cached).
// The photo is shrunk and turned grey and high-contrast first, which reads thermal receipts noticeably better.
export async function readBill(img: ImageBitmap, onProgress: (p: number) => void): Promise<Receipt> {
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
