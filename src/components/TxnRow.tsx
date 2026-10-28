import { Paperclip } from 'lucide-react';
import type { Txn } from '@/lib/db';
import { methodLabel, shortDate, statusWord, time12 } from '@/lib/ui';
import { rupees } from '@/lib/upi';
import CatIcon from './CatIcon';

export default function TxnRow({ t, onClick, showDate = false }: { t: Txn; onClick: () => void; showDate?: boolean }) {
  const title = t.note || t.payee_name || t.payee_vpa || t.subcategory || t.category;
  const word = statusWord(t.status);
  const meta = [
    showDate ? `${shortDate(t.created_at)}, ${time12(t.created_at)}` : time12(t.created_at),
    methodLabel(t), t.trip, t.subcategory ?? t.category, t.note && t.payee_name,
  ].filter(Boolean).join(' · ');
  const failed = t.status === 'FAILURE';
  return (
    <button className="item" onClick={onClick}>
      <CatIcon cat={t.category} status={t.status} size={40} />
      <span className="grow">
        <span className="ellipsis" style={{ display: 'block' }}>{title}</span>
        <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>{meta}</span>
      </span>
      {t.bill_uri && <Paperclip size={15} className="faint" aria-label="Bill attached" />}
      <span style={{ textAlign: 'right' }}>
        <span className={`num txn-amt${t.direction === 'credit' ? ' credit' : ''}${failed ? ' failed' : ''}`}>{t.direction === 'credit' ? '+' : ''}{rupees(t.amount)}</span>
        {word && <span className={`txn-status${failed ? ' failed' : ''}`}>{word}</span>}
      </span>
    </button>
  );
}
