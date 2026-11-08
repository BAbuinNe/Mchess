import { useRef, useState } from "react";

function ReactionPlayer({ clip, muted, onClose, onPlayed, unskippable }: { clip: string; muted: boolean; onClose: () => void; onPlayed?: () => void; unskippable: boolean }) {
  const [ready, setReady] = useState(false);
  const [manual, setManual] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  async function ensurePlayback() {
    const video = videoRef.current;
    if (!video || !video.paused) return;
    try { await video.play(); }
    catch {
      // Browsers may reject delayed autoplay with sound after Stockfish finishes.
      video.muted = true;
      try { await video.play(); } catch { if (unskippable) setManual(true); else onClose(); }
    }
  }
  return <div className={"coach-reaction" + (ready || manual ? " ready" : "") + (clip.endsWith(".webm") ? " transparent" : "")} role="status" aria-label="Видео-реакция">
    {!unskippable && <button className="reaction-close" onClick={onClose} aria-label="Закрыть реакцию">×</button>}
    <video ref={videoRef} src={clip} autoPlay muted={muted} playsInline preload="auto" onLoadedData={() => { void ensurePlayback(); }} onCanPlay={() => { void ensurePlayback(); }} onPlaying={() => { setManual(false); setReady(true); onPlayed?.(); }} onEnded={onClose} onError={() => { if (unskippable) setManual(true); else onClose(); }} />
    {manual && <button className="reaction-play" type="button" onClick={() => { videoRef.current?.load(); void ensurePlayback(); }}>Включить видео ▶</button>}
  </div>;
}

export default function CoachReaction({ clip, muted = false, onClose, onPlayed, unskippable = false }: { clip: string | null; muted?: boolean; onClose: () => void; onPlayed?: () => void; unskippable?: boolean }) {
  return clip ? <ReactionPlayer key={clip} clip={clip} muted={muted} onClose={onClose} onPlayed={onPlayed} unskippable={unskippable} /> : null;
}

