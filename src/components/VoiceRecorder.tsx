import React from "react";
import { Mic, Trash2, Check, AlertCircle, RefreshCw } from "lucide-react";
import { VoiceNote } from "../types";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";

interface VoiceRecorderProps {
  onVoiceNoteCreated: (note: VoiceNote) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function VoiceRecorder({
  onVoiceNoteCreated,
  onCancel,
  compact = false
}: VoiceRecorderProps) {
  const {
    isRecording,
    recordSeconds,
    hasPermissionError,
    errorMessage,
    startRecording,
    stopAndSaveRecording,
    cancelRecording,
    formatTime
  } = useVoiceRecorder({ onVoiceNoteCreated });

  return (
    <div className={`bg-[#161618] border border-white/10 rounded-xl ${compact ? "p-2.5 space-y-2" : "p-3 space-y-2.5"}`}>
      {hasPermissionError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2 rounded-lg text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-[11px]">{errorMessage}</p>
            <button
              type="button"
              onClick={startRecording}
              className="text-[10px] font-bold text-white underline hover:no-underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-2.5 h-2.5" /> Спробувати знову
            </button>
          </div>
        </div>
      )}

      {!isRecording ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs w-full sm:w-auto"
          >
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span>Записати голос</span>
          </button>
          <span className="text-[10px] text-gray-500 italic hidden sm:inline truncate">
            Надиктуйте нотатку
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 bg-red-500/5 border border-red-500/20 p-2.5 rounded-lg animate-pulse-subtle">
          {/* Recording Status & Wave Animation */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
                Запис...
              </span>
              <span className="font-mono text-xs font-bold text-white bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                {formatTime(recordSeconds)}
              </span>
            </div>

            {/* Simulated Live Sound Bars */}
            <div className="flex items-center gap-0.5 h-3.5">
              {[50, 90, 35, 75, 45, 85, 65, 30].map((h, i) => (
                <span
                  key={i}
                  className="w-0.5 bg-red-500/80 rounded-full transition-all duration-150 animate-pulse"
                  style={{
                    height: `${Math.max(3, Math.sin((recordSeconds + i) * 1.5) * 10 + 4)}px`
                  }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 justify-end pt-1">
            <button
              type="button"
              onClick={() => cancelRecording(onCancel)}
              className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Скасувати</span>
            </button>
            <button
              type="button"
              onClick={stopAndSaveRecording}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Check className="w-3 h-3" />
              <span>Зберегти</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
