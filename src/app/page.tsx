import AppLoader from '@/components/AppLoader';

// The app keeps its data in the browser (and Supabase), so it renders on the client only.
export default function Home() {
  return <AppLoader />;
}
