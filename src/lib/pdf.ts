import type { Cell } from './statement';

// A statement PDF as lines of positioned text runs, read on this device with pdf.js.
// Bank statements are often password-protected (the password is in the bank's email): a wrong or missing one throws 'password'.
export async function pdfLines(data: ArrayBuffer, password?: string): Promise<Cell[][]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  let doc;
  try { doc = await pdfjs.getDocument({ data, password }).promise; }
  catch (e) { if ((e as Error).name === 'PasswordException') throw new Error('password'); throw e; }
  const lines: Cell[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    // runs on the same baseline (±3pt) form a line, top to bottom, left to right
    const rows = new Map<number, Cell[]>();
    for (const it of items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      const row = rows.get(y) ?? rows.get(y - 1) ?? rows.get(y + 1) ?? [];
      if (!row.length) rows.set(y, row);
      row.push({ x: it.transform[4], w: it.width, text: it.str.trim() });
    }
    for (const [, row] of [...rows].sort((a, b) => b[0] - a[0])) {
      row.sort((a, b) => a.x - b.x);
      // runs closer than a few points are one cell (pdf.js often splits a word or number)
      const cells: Cell[] = [];
      for (const c of row) {
        const last = cells[cells.length - 1];
        if (last && c.x - (last.x + last.w) < 4) { last.text += (c.x - (last.x + last.w) > 1 ? ' ' : '') + c.text; last.w = c.x + c.w - last.x; }
        else cells.push({ ...c });
      }
      lines.push(cells);
    }
  }
  await doc.destroy();
  return lines;
}
