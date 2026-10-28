'use client';
import dynamic from 'next/dynamic';

const SharePage = dynamic(() => import('@/screens/SharePage'), { ssr: false });
export default function ShareLoader({ id }: { id: string }) { return <SharePage id={id} />; }
