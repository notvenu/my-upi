import Link from 'next/link';

// Any URL that isn't a page. The body is locked for the app, so this centres itself in a fixed box.
export default function NotFound() {
  return (
    <main className="center" style={{ position: 'fixed', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 10, padding: 24 }}>
      <p className="num" style={{ fontSize: 88, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--lime)' }}>404</p>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Nothing to pay here</h1>
      <p className="sub" style={{ maxWidth: 320 }}>This page doesn&apos;t exist. If someone sent you a split link, ask them for a fresh one.</p>
      <Link href="/" className="btn lime" style={{ marginTop: 14, textDecoration: 'none' }}>Open MyUPI</Link>
    </main>
  );
}
