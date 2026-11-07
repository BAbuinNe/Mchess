import { useEffect, useState } from "react";

type Announcement = { id: string; title: string; body: string; createdAt: number };
const TELEGRAM_URL = "https://t.me/WebIluxa";

export default function NewsCenter({ apiUrl, introVisible }: { apiUrl: string; introVisible: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(() => !localStorage.getItem("mchess.telegramInviteDismissed"));
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (!/^https?:\/\//.test(apiUrl)) return;
    let active = true;
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    const receive = (item: Announcement) => {
      if (!active) return;
      setItems(previous => [item, ...previous.filter(existing => existing.id !== item.id)].slice(0, 20));
      if (localStorage.getItem("mchess.lastAnnouncementSeen") !== item.id) {
        setUnread(true);
        setOpen(true);
      }
    };
    const load = async () => {
      try {
        const response = await fetch(apiUrl + "/api/announcements");
        if (!response.ok) return;
        const list = await response.json() as Announcement[];
        if (!active || !Array.isArray(list)) return;
        setItems(list);
        if (list[0] && localStorage.getItem("mchess.lastAnnouncementSeen") !== list[0].id) {
          setUnread(true);
          setOpen(true);
        }
      } catch { /* offline: announcements reload on reconnect */ }
    };
    const connect = () => {
      if (!active) return;
      socket = new WebSocket(apiUrl.replace(/^http/, "ws") + "/ws/announcements");
      socket.onopen = () => { void load(); };
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as { type: string; item: Announcement };
          if (message.type === "announcement" && message.item?.id) receive(message.item);
        } catch { /* ignore malformed message */ }
      };
      socket.onclose = () => { if (active) retry = window.setTimeout(connect, 5000); };
    };
    void load();
    if (apiUrl.includes(".vercel.app")) {
      const poll = window.setInterval(() => void load(), 30000);
      return () => { active = false; window.clearInterval(poll); };
    }
    connect();
    return () => { active = false; socket?.close(); window.clearTimeout(retry); };
  }, [apiUrl]);

  function closeNews() {
    if (items[0]) localStorage.setItem("mchess.lastAnnouncementSeen", items[0].id);
    setUnread(false);
    setOpen(false);
  }
  function closeInvite() {
    localStorage.setItem("mchess.telegramInviteDismissed", "1");
    setInvite(false);
  }

  return <>
    <button className="header-action news-button" type="button" onClick={() => setOpen(true)} aria-label="Новости и уведомления"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>{unread && <span className="news-dot" />}</button>
    {!introVisible && invite && <div className="news-overlay" role="dialog" aria-label="Новости MChess в Telegram"><div className="news-dialog">
      <span className="news-emblem">♞</span><h2>Новости MChess</h2>
      <p>Обновления, новые функции и новости игры публикуются в Telegram-канале. Подпишитесь, чтобы ничего не пропустить.</p>
      <a className="news-primary" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" onClick={closeInvite}>Открыть @WebIluxa</a>
      <button type="button" onClick={closeInvite}>Не сейчас</button>
    </div></div>}
    {!introVisible && !invite && open && <div className="news-overlay" role="dialog" aria-label="Новости и уведомления"><div className="news-dialog news-list">
      <div className="news-title"><h2>Новости MChess</h2><button type="button" onClick={closeNews} aria-label="Закрыть новости">×</button></div>
      {items.length ? items.map(item => <article key={item.id}><time>{new Date(item.createdAt).toLocaleString("ru-RU")}</time><h3>{item.title}</h3><p>{item.body}</p></article>) : <p>Пока нет объявлений.</p>}
      <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">Наш Telegram-канал</a>
    </div></div>}
  </>;
}

