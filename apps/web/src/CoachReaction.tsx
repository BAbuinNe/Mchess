import { useRef, useState } from "react";

function ReactionPlayer({ clip, muted, onClose, onPlayed, unskippable, fullScreen }: { clip: string; muted: boolean; onClose: () => void; onPlayed?: () => void; unskippable: boolean; fullScreen: boolean }) {
  const [ready, setReady] = useState(false);
  const [manual, setManual] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  async function ensurePlayback() {
    const video = videoRef.current;
    if (!video || !video.paused) return;
    try { await video.play(); }
    catch {
      if (unskippable) { setManual(true); return; }
      // Browsers may reject delayed autoplay with sound after Stockfish finishes.
      video.muted = true;
      try { await video.play(); } catch { onClose(); }
    }
  }
  return <div className={"coach-reaction" + (ready || manual || fullScreen ? " ready" : "") + (clip.includes(".webm") ? " transparent" : "") + (fullScreen ? " fullscreen-reaction" : "")} role={fullScreen ? "dialog" : "status"} aria-modal={fullScreen || undefined} aria-label={fullScreen ? "Вступительное видео перед партией" : "Видео-реакция"}>
    {!unskippable && <button className="reaction-close" onClick={onClose} aria-label="Закрыть реакцию">×</button>}
    <video ref={videoRef} src={clip} autoPlay muted={muted} playsInline preload="auto" controls={false} disablePictureInPicture onLoadedData={() => { void ensurePlayback(); }} onCanPlay={() => { void ensurePlayback(); }} onPlaying={() => { setManual(false); setReady(true); onPlayed?.(); }} onEnded={onClose} onError={() => { if (unskippable) setManual(true); else onClose(); }} />
    {fullScreen && !ready && !manual && <div className="reaction-loading">Загружаем видео · часы партии остановлены</div>}
    {manual && <button className="reaction-play" type="button" onClick={() => { videoRef.current?.load(); void ensurePlayback(); }}>Включить видео ▶</button>}
  </div>;
}

export default function CoachReaction({ clip, muted = false, onClose, onPlayed, unskippable = false, fullScreen = false }: { clip: string | null; muted?: boolean; onClose: () => void; onPlayed?: () => void; unskippable?: boolean; fullScreen?: boolean }) {
  return clip ? <ReactionPlayer key={clip} clip={clip} muted={muted} onClose={onClose} onPlayed={onPlayed} unskippable={unskippable} fullScreen={fullScreen} /> : null;
}

