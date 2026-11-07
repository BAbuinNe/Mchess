import { useEffect, useRef, useState } from "react";

export default function IntroScreen({ onFinish }: { onFinish: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(onFinish, 2600);
    const video = videoRef.current;
    if (video) void video.play().catch(() => {});
    return () => window.clearTimeout(timeout);
  }, [onFinish]);
  return <div className={"intro-overlay" + (playing ? " playing" : "")} role="dialog" aria-label="Заставка MChess">
    <div className="intro-fallback"><img src="/icon-192.png" alt="" /><span>MChess</span></div>
    <video ref={videoRef} src="/assets/intro/intro.mp4" autoPlay muted playsInline preload="auto" controls={false} disablePictureInPicture onPlaying={() => setPlaying(true)} onEnded={onFinish} onError={() => setPlaying(false)} />
    <button type="button" onClick={onFinish}>Пропустить</button>
  </div>;
}

