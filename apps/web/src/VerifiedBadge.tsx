import { useEffect, useState } from "react";

export default function VerifiedBadge({ self = false }: { self?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), 4000);
    return () => window.clearTimeout(timer);
  }, [open]);
  return <span className="verified-wrap">
    <button className="verified-badge" type="button" aria-label="Информация о разработчике" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 28 28" role="img" aria-hidden="true"><defs><linearGradient id="verified-gold" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffe9ac" /><stop offset="1" stopColor="#bb8642" /></linearGradient></defs><path d="M14 1.8 17 4l3.7-.2 1.4 3.3 3.2 1.8-.5 3.7 1.5 3.4-2.5 2.8-.4 3.7-3.6.9L17 26l-3-1.3-3 1.3-2.8-2.6-3.6-.9-.4-3.7-2.5-2.8 1.5-3.4-.5-3.7 3.2-1.8 1.4-3.3L11 4Z" fill="url(#verified-gold)" stroke="#fff2d0" strokeWidth=".8"/><path d="m8.4 14.2 3.7 3.7 7.5-8" fill="none" stroke="#332817" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    {open && <span className="verified-popover" role="tooltip">{self ? "Вы — разработчик MChess" : "Вы играете с разработчиком этой игры"}</span>}
  </span>;
}

