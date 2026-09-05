import React, { useRef } from "react";
import { 
  Mic, 
  Image as ImageIcon, 
  Paperclip, 
  Trash2, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Maximize2, 
  FileText, 
  File, 
  X,
  Volume2
} from "lucide-react";
import { TaskImage, VoiceNote } from "../types";
import { generateId } from "../utils";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import VoicePlayer from "./VoicePlayer";

interface TelegramTaskInputProps {
  description: string;
  onChangeDescription: (desc: string) => void;
  voiceNotes: VoiceNote[];
  onChangeVoiceNotes: (notes: VoiceNote[]) => void;
  images: TaskImage[];
  onChangeImages: (images: TaskImage[]) => void;
  onOpenLightbox?: (images: TaskImage[], index: number) => void;
  placeholder?: string;
  label?: string;
}

export default function TelegramTaskInput({
  description,
  onChangeDescription,
  voiceNotes,
  onChangeVoiceNotes,
  images,
  onChangeImages,
  onOpenLightbox,
  placeholder = "Введіть опис або деталі завдання...",
  label = "Опис / Деталі"
}: TelegramTaskInputProps) {
  // Hidden File Inputs
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleVoiceNoteCreated = (note: VoiceNote) => {
    onChangeVoiceNotes([...voiceNotes, note]);
  };

  const {
    isRecording,
    recordSeconds,
    hasPermissionError,
    errorMessage,
    startRecording,
    stopAndSaveRecording,
    cancelRecording: cancelRecordingBase,
    formatTime
  } = useVoiceRecorder({ onVoiceNoteCreated: handleVoiceNoteCreated });

  const cancelRecording = () => cancelRecordingBase();


  // Handling file selections
  const processSelectedFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: TaskImage[] = [];
    const maxFiles = 10;
    const filesToProcess = Array.from(files).slice(0, maxFiles);

    filesToProcess.forEach((file) => {
      const reader = new FileReader();
      const isImg = file.type.startsWith("image/");
      const isDoc = file.type.includes("pdf") || file.type.includes("document") || file.type.includes("sheet") || file.type.includes("text");

      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          const item: TaskImage = {
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: result,
            name: file.name,
            createdAt: new Date().toISOString(),
            size: file.size,
            fileType: isImg ? "image" : (isDoc ? "document" : "file")
          };
          newItems.push(item);
          if (newItems.length === filesToProcess.length) {
            onChangeImages([...images, ...newItems]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Clipboard Paste (Ctrl+V) handler
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (clipboardData && clipboardData.items) {
      const items: DataTransferItem[] = Array.from(clipboardData.items);
      const imageItems = items.filter(item => item.type && item.type.indexOf("image") !== -1);

      if (imageItems.length > 0) {
        e.preventDefault();
        imageItems.forEach(item => {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                const pastedImg: TaskImage = {
                  id: `img-paste-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                  url: base64,
                  name: `Скріншот (${timeStr})`,
                  createdAt: now.toISOString(),
                  size: blob.size,
                  fileType: "image"
                };
                onChangeImages([...images, pastedImg]);
              }
            };
            reader.readAsDataURL(blob);
          }
        });
      }
    }
  };

  const removeImage = (id: string) => {
    onChangeImages(images.filter(img => img.id !== id));
  };

  const removeVoiceNote = (id: string) => {
    onChangeVoiceNotes(voiceNotes.filter(v => v.id !== id));
  };

  const totalAttachments = voiceNotes.length + images.length;

  return (
    <div className="space-y-2.5">
      {/* Label and Telegram-style helper header */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
        </label>
        <span className="text-[10px] text-gray-500 hidden sm:inline">
          Прикріплюйте файли, фото або записуйте голосове
        </span>
      </div>

      {/* Main Telegram-Style Input Container */}
      <div className="relative bg-[#161618] border border-white/10 hover:border-white/20 focus-within:border-emerald-500/60 rounded-xl transition-all shadow-xs group">
        {/* Hidden inputs for images & general files */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            processSelectedFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => {
            processSelectedFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={3}
          value={description}
          onChange={(e) => onChangeDescription(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="w-full px-3.5 pt-2.5 pb-8 text-xs text-white bg-transparent resize-none focus:outline-hidden placeholder-gray-500 leading-relaxed font-sans"
        />

        {/* Bottom Actions Bar (Telegram Style: Inside bottom-right of field) */}
        <div className="absolute bottom-1.5 right-2 flex items-center gap-1 bg-[#161618]/90 backdrop-blur-xs px-1.5 py-0.5 rounded-lg border border-white/5">
          {/* Paperclip / Any Document */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-white/5 rounded-md transition-all cursor-pointer"
            title="Прикріпити файл або документ"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>

          {/* Image / Screenshot */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-white/5 rounded-md transition-all cursor-pointer"
            title="Прикріпити фото / скріншот (або Ctrl+V)"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>

          {/* Voice Microphone (Like Telegram) */}
          <button
            type="button"
            onClick={() => {
              if (isRecording) {
                stopAndSaveRecording();
              } else {
                startRecording();
              }
            }}
            className={`p-1.5 rounded-md transition-all cursor-pointer ${
              isRecording
                ? "bg-red-500 text-white animate-pulse shadow-xs"
                : "text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10"
            }`}
            title={isRecording ? "Зупинити та зберегти запис" : "Записати голосове (як в Telegram)"}
          >
            <Mic className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Permission Error notification if mic access was blocked */}
      {hasPermissionError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded-xl text-xs flex items-start gap-2 animate-fadeIn">
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

      {/* ACTIVE VOICE RECORDING BAR (Appears directly beneath the description field) */}
      {isRecording && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 p-2.5 rounded-xl animate-fadeIn shadow-xs">
          {/* Live Frequency & Timer */}
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
              Запис голосу
            </span>
            <span className="font-mono text-xs font-bold text-white bg-black/50 px-2 py-0.5 rounded border border-white/10">
              {formatTime(recordSeconds)}
            </span>

            {/* Live sound bars */}
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

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cancelRecording}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Скасувати</span>
            </button>
            <button
              type="button"
              onClick={stopAndSaveRecording}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Check className="w-3 h-3" />
              <span>Готово</span>
            </button>
          </div>
        </div>
      )}

      {/* ALL ATTACHMENTS ADDED BENEATH THE DESCRIPTION FIELD */}
      {totalAttachments > 0 && (
        <div className="bg-[#161618] border border-white/10 rounded-xl p-3 space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium px-0.5">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span>Додані вкладення ({totalAttachments})</span>
            </span>
            <span className="text-[10px] text-gray-500">Клікніть для перегляду</span>
          </div>

          {/* 1. Voice Notes Player List */}
          {voiceNotes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-emerald-400" />
                <span>Голосові нотатки ({voiceNotes.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {voiceNotes.map((vn) => (
                  <VoicePlayer
                    key={vn.id}
                    voiceNote={vn}
                    compact={true}
                    onDelete={(id) => removeVoiceNote(id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2. Images & Screenshots Grid */}
          {images.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-white/5">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-emerald-400" />
                  <span>Фото та файли ({images.length})</span>
                </span>
                <span className="text-[9px] text-gray-500 font-mono">
                  {images.filter(i => !i.fileType || i.fileType === "image").length} фото
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {images.map((img, idx) => {
                  const isImage = !img.fileType || img.fileType === "image";

                  if (isImage) {
                    return (
                      <div
                        key={img.id || idx}
                        onClick={() => onOpenLightbox && onOpenLightbox(images, idx)}
                        className="group relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40 hover:border-emerald-500/50 transition-all shadow-xs cursor-pointer"
                      >
                        <img
                          src={img.url}
                          alt={img.name || `Зображення ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          referrerPolicy="no-referrer"
                        />
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="p-1 rounded-full bg-emerald-500/90 text-black">
                            <Maximize2 className="w-3 h-3" />
                          </span>
                        </div>
                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(img.id);
                          }}
                          className="absolute top-1 right-1 p-1 bg-black/80 hover:bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          title="Видалити"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 bg-black/75 text-[8px] font-mono text-gray-300 px-1 rounded truncate max-w-[80%]">
                          #{idx + 1}
                        </span>
                      </div>
                    );
                  } else {
                    // Document / non-image file card
                    return (
                      <div
                        key={img.id || idx}
                        className="relative p-2 rounded-lg border border-white/10 bg-black/40 hover:border-emerald-500/40 transition-all flex flex-col justify-between aspect-square group"
                      >
                        <div className="flex items-center justify-between">
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <button
                            type="button"
                            onClick={() => removeImage(img.id)}
                            className="text-gray-500 hover:text-red-400 p-0.5 cursor-pointer"
                            title="Видалити"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div>
                          <p className="text-[10px] text-white font-medium truncate" title={img.name}>
                            {img.name}
                          </p>
                          {img.size && (
                            <span className="text-[8px] text-gray-500 font-mono">
                              {Math.round(img.size / 1024)} KB
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
