import type { ReactNode } from "react";

type IconName = "home" | "play" | "puzzles" | "learn" | "profile" | "friends" | "bot" | "coach" | "board" | "settings";

export default function UIIcon({ name, size = 25 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-7h6v7" /></>,
    play: <><path d="M6 3 18 18M18 3 6 18" /><path d="m4 17 3 3M17 20l3-3" /><path d="M8 5 5 8M16 5l3 3" /></>,
    puzzles: <><path d="M4 4h5c-.6 2.1.3 3.2 2 3.2S13.6 6.1 13 4h7v6c-2.1-.6-3.2.3-3.2 2s1.1 2.6 3.2 2v6h-7c.6-2.1-.3-3.2-2-3.2S8.4 17.9 9 20H4v-6c2.1.6 3.2-.3 3.2-2S6.1 9.4 4 10Z" /></>,
    learn: <><path d="m2 9 10-5 10 5-10 5Z" /><path d="M6 11v6c3.6 2.7 8.4 2.7 12 0v-6M22 9v8" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21v-2c0-3.3 3.2-5 7.5-5s7.5 1.7 7.5 5v2Z" /></>,
    friends: <><circle cx="9" cy="8" r="3" /><path d="M2.5 20v-2c0-3.1 2.6-4.8 6.5-4.8s6.5 1.7 6.5 4.8v2Z" /><path d="M17 5a3 3 0 0 1 0 6M19 14c2 .6 2.5 2 2.5 4v2" /></>,
    bot: <><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 3v4M9 3h6M8 13h.01M16 13h.01M9 17h6" strokeLinecap="round" strokeWidth="2.4" /></>,
    coach: <><circle cx="12" cy="7" r="3" /><path d="M6 21v-3a6 6 0 0 1 12 0v3M8 15l4 3 4-3" /></>,
    board: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m10 2-.5 2.1-1.8.8L5.8 4 4 5.8l.9 1.9-.8 1.8L2 10v4l2.1.5.8 1.8-.9 1.9L5.8 20l1.9-.9 1.8.8L10 22h4l.5-2.1 1.8-.8 1.9.9 1.8-1.8-.9-1.9.8-1.8L22 14v-4l-2.1-.5-.8-1.8.9-1.9L18.2 4l-1.9.9-1.8-.8L14 2Z" /></>
  };
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

