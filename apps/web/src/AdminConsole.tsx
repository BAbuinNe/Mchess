import { useState, type FormEvent } from "react";

export default function AdminConsole() {
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, body }) });
      if (!response.ok) throw new Error(response.status === 401 ? "Неверный ключ администратора." : response.status === 503 ? "Ключ администратора не настроен на сервере." : "Не удалось отправить объявление.");
      setStatus("Объявление отправлено всем подключённым пользователям и сохранено для остальных.");
      setTitle("");
      setBody("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Ошибка соединения."); }
    finally { setBusy(false); }
  }

  return <main className="admin-console"><a href="/">← MChess</a><h1>Объявление для игроков</h1>
    <p>Новость появится в приложении сразу у подключённых игроков и при следующем входе у остальных. Ключ хранится только в этой вкладке.</p>
    <form onSubmit={event => void publish(event)}>
      <label>Ключ администратора<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} required /></label>
      <label>Заголовок<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} required /></label>
      <label>Текст<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={2000} required /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Отправка…" : "Отправить всем"}</button>
    </form>
    {status && <p role="status">{status}</p>}
  </main>;
}
