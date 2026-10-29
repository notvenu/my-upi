import { BILL_SCHEMA, fromGemini } from '@/lib/receipt';

// Reads a bill photo, or a note typed in any shape ("tomatoes 70 onions 60, palak for me"), with Gemini and returns a Receipt.
// The key stays on the server.
// 501 when no key is set, so the client falls back to reading on the device.
// ponytail: open to anyone who finds the URL; gate on a Supabase session if the key's quota gets abused.
const PROMPT = 'This is a photo of a shop or restaurant bill from India. Fill the JSON from what is printed. '
  + 'Amounts are in rupees. Pick the category that fits what was bought.';
const NOTE = (today: string) => `Today is ${today}. Below is a note someone in India wrote about money they spent, in any format: `
  + 'a chat message, a notepad list, shorthand, Hinglish. Fill the JSON with it. Amounts are in rupees. '
  + 'shop is who was paid, if said. total is the sum of the items unless a different total is stated. '
  + 'date is the day it was spent if said ("yesterday" counts), else null. '
  + 'For each item, "for" says who it is for: "me" for the writer, "all" for everyone sharing, or names. '
  + '"Rest for all" means every item not given to someone else is "all". Leave "for" empty if the note never says. '
  + '"with" lists who it is shared with (people or groups like "roommates"), from phrases like "split with", "for the flat", "with Ravi".\n\n';

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 501 });
  const type = req.headers.get('content-type') ?? '';
  let parts;
  if (type.startsWith('application/json')) {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 5000) return Response.json({ error: 'Send up to 5000 characters' }, { status: 413 });
    const names = (Array.isArray(body.names) ? body.names : []).filter((n: unknown) => typeof n === 'string').slice(0, 300).map((n: string) => n.slice(0, 60));
    const known = names.length ? `Saved people and groups: ${names.join(', ')}. When the note means one of them, even misspelt, `
      + 'shortened or as a nickname, use that exact saved name in "for" and "with".\n\n' : '';
    parts = [{ text: NOTE(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) + known + 'Note:\n' + text }];
  } else if (type.startsWith('image/')) {
    const img = await req.arrayBuffer();
    if (img.byteLength > 8e6) return Response.json({ error: 'Image too large' }, { status: 413 });
    parts = [{ inline_data: { mime_type: type, data: Buffer.from(img).toString('base64') } }, { text: PROMPT }];
  } else return Response.json({ error: 'Send an image or text' }, { status: 415 });

  // pinned: gemini-flash-latest was 503ing (overloaded) and 2.5 is retired for new keys
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const ask = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts }],
      // thinking is most of the wait: minimal answers a typed note in ~2s instead of 10–20s; a photo gets a little more
      generationConfig: { responseMimeType: 'application/json', responseSchema: BILL_SCHEMA, temperature: 0,
        thinkingConfig: { thinkingLevel: 'text' in parts[0] ? 'minimal' : 'low' } },
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => new Response(null, { status: 504 }));
  let res = await ask();
  if (res.status === 503) res = await ask(); // overloaded: usually clears on a second try
  if (!res.ok) {
    console.error('Gemini', res.status, (await res.text()).slice(0, 300));
    return Response.json({ error: `Gemini ${res.status}` }, { status: res.status === 429 ? 429 : 502 }); // 429: free tier's per-minute limit
  }
  const out = await res.json();
  try {
    return Response.json(fromGemini(JSON.parse(out.candidates?.[0]?.content?.parts?.[0]?.text ?? '')));
  } catch {
    return Response.json({ error: 'Gemini returned no bill' }, { status: 502 });
  }
}
