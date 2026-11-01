'use client';
import { ChevronRight, FileUp, HandCoins, Link2, Luggage, PiggyBank, Repeat, Settings, Tags } from 'lucide-react';
import Sheet from '@/components/Sheet';
import { setNav, type Tab } from '@/lib/nav';

// Every page in one place, so nothing hides behind the You tab.
export default function MoreMenu({ goTab, onClose }: { goTab: (t: Tab) => void; onClose: () => void }) {
  const go = (fn: () => void) => () => { onClose(); fn(); };
  const pages = [
    { icon: HandCoins, title: 'Debts', sub: 'Money you owe, to pay later', open: () => setNav({ debts: true }) },
    { icon: PiggyBank, title: 'Investments and savings', sub: 'Funds, FDs, stocks, savings goals', open: () => setNav({ investing: true }) },
    { icon: Luggage, title: 'Trips and events', sub: 'Split everything on a trip in one place', open: () => { setNav({ peopleView: 'trips' }); goTab('people'); } },
    { icon: Link2, title: 'Groups and split links', sub: 'Roommates, and links that show who owes what', open: () => { setNav({ peopleView: 'groups' }); goTab('people'); } },
    { icon: Repeat, title: 'Autopays', sub: 'Subscriptions, EMIs, mandates', open: () => setNav({ subs: true }) },
    { icon: Tags, title: 'Categories', sub: 'Add, rename or delete categories', open: () => setNav({ categories: true }) },
    { icon: FileUp, title: 'Upload a statement', sub: 'Bank, PhonePe or super.money', open: () => setNav({ importing: true }) },
    { icon: Settings, title: 'You and settings', sub: 'Your UPI ID, sync, backups', open: () => goTab('me') },
  ];
  return (
    <Sheet title="More" onClose={onClose}>
      <div className="list">
        {pages.map(({ icon: Icon, title, sub, open }) => (
          <button key={title} className="item" onClick={go(open)}>
            <span className="mini-icon"><Icon size={17} /></span>
            <span className="grow">{title}<br /><span className="sub">{sub}</span></span>
            <ChevronRight size={18} strokeWidth={2.5} className="chev" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
