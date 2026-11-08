import { useRef, useState } from "react";

function ReactionPlayer({ clip, muted, onClose }: { clip: string; muted: boolean; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  async function ensurePlayback() {
    const video = videoRef.current;
    if (!video || !video.paused) return;
    try { await video.play(); }
    catch {
      // Browsers may reject delayed autoplay with sound after Stockfish finishes.
      video.muted = true;
      try { await video.play(); } catch { onClose(); }
    }
  }
  return <div className={"coach-reaction" + (ready ? " ready" : "") + (clip.endsWith(".webm") ? " transparent" : "")} role="status" aria-label="Видео-реакция">
    <button className="reaction-close" onClick={onClose} aria-label="Закрыть реакцию">×</button>
    <video ref={videoRef} src={clip} autoPlay muted={muted} playsInline preload="auto" onLoadedData={() => { void ensurePlayback(); }} onPlaying={() => setReady(true)} onEnded={onClose} onError={onClose} />
  </div>;
}

export default function CoachReaction({ clip, muted = false, onClose }: { clip: string | null; muted?: boolean; onClose: () => void }) {
  return clip ? <ReactionPlayer key={clip} clip={clip} muted={muted} onClose={onClose} /> : null;
}