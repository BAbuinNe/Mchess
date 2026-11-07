import { useRef } from "react";

export default function ResultAnimation({ outcome }: { outcome: "victory" | "defeat" }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return <video
    ref={videoRef}
    className="result-video"
    src={`/assets/results/${outcome}.mp4`}
    autoPlay
    muted
    playsInline
    preload="auto"
    aria-label={outcome === "victory" ? "Анимация победы" : "Анимация поражения"}
    onLoadedMetadata={() => {
      const video = videoRef.current;
      if (video && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        video.pause();
        video.currentTime = Math.max(0, video.duration - 0.06);
      }
    }}
    onTimeUpdate={() => {
      const video = videoRef.current;
      if (video && video.duration && video.currentTime >= video.duration - 0.06) {
        video.pause();
        video.currentTime = Math.max(0, video.duration - 0.06);
      }
    }}
    onEnded={() => {
      const video = videoRef.current;
      if (video) video.currentTime = Math.max(0, video.duration - 0.06);
    }}
  />;
}
