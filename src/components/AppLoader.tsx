'use client';
import dynamic from 'next/dynamic';

// Client only: the app reads localStorage and browser APIs as soon as it loads.
const App = dynamic(() => import('@/screens/App'), { ssr: false });
export default function AppLoader() { return <App />; }
