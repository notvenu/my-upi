import ShareLoader from '@/components/ShareLoader';

// A split link someone shared: a public read-only page, no sign-in and no local data.
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShareLoader id={id} />;
}
