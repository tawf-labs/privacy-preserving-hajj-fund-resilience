import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-card p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function Badge({ tone, children }: { tone: 'ok' | 'bad' | 'neutral' | 'gold'; children: ReactNode }) {
  const styles = {
    ok: 'bg-ok-bg text-ok',
    bad: 'bg-bad-bg text-bad',
    neutral: 'bg-line text-muted',
    gold: 'bg-[color-mix(in_srgb,var(--gold)_22%,transparent)] text-green',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

export function Button({ className = '', variant = 'primary', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const v =
    variant === 'primary'
      ? 'bg-green text-sand hover:bg-green-light disabled:opacity-60'
      : 'border border-line text-green hover:bg-line disabled:opacity-60';
  return <button className={`inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${v} ${className}`} {...p} />;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-gold">{children}</p>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="font-serif text-3xl text-green">{value}</div>
      <div className="text-sm text-ink">{label}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
