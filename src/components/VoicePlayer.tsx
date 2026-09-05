import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Trash2, Mic } from "lucide-react";
import { VoiceNote } from "../types";

interface VoicePlayerProps {
  key?: React.Key;
  voiceNote: VoiceNote;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

export default function VoicePlayer({
  voiceNote,
  onDelete,
  compact = false
}: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(voiceNote.duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Audio playback error:", err);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`bg-[#161618] border border-white/10 rounded-xl transition-all ${
        compact ? "p-2 gap-2" : "p-2.5 gap-3"
      } flex items-center justify-between group/player hover:border-emerald-500/30`}
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={voiceNote.audioUrl} preload="metadata" />

      {/* Play / Pause button */}
      <button
        type="button"
        onClick={togglePlayPause}
        className={`shrink-0 rounded-full flex items-center justify-center transition-all cursor-pointer ${
          compact ? "w-7 h-7" : "w-8 h-8"
        } ${
          isPlaying
            ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
            : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
        }`}
        title={isPlaying ? "Пауза" : "Відтворити голосове"}
      >
        {isPlaying ? (
          <Pause className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        ) : (
          <Play className={`${compact ? "w-3.5 h-3.5 ml-0.5" : "w-4 h-4 ml-0.5"}`} />
        )}
      </button>

      {/* Waveform & Scrubber */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold truncate">
            <Mic className="w-3 h-3 shrink-0" />
            <span className="truncate">{voiceNote.name || "Голосовий запис"}</span>
          </span>
          <span className="shrink-0 text-gray-500">
            {formatSeconds(currentTime)} / {formatSeconds(duration || voiceNote.duration || 0)}
          </span>
        </div>

        {/* Progress Bar with soundwave effect */}
        <div className="relative flex items-center h-4">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Optional Delete Action */}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(voiceNote.id)}
          className="shrink-0 p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
          title="Видалити голосове"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
