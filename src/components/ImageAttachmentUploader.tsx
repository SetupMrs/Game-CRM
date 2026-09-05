import React, { useRef, useState, useEffect, useCallback } from "react";
import { Image, Upload, Trash2, Maximize2, FileImage, Plus } from "lucide-react";
import { TaskImage } from "../types";
import { generateId } from "../utils";

interface ImageAttachmentUploaderProps {
  images: TaskImage[];
  onAddImages: (newImages: TaskImage[]) => void;
  onRemoveImage: (id: string) => void;
  onImageClick: (image: TaskImage, index: number) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export default function ImageAttachmentUploader({
  images,
  onAddImages,
  onRemoveImage,
  onImageClick,
  readOnly = false,
  compact = false
}: ImageAttachmentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Resize and optimize image to Base64 data URL
  const processImageFile = (file: File): Promise<TaskImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const maxWidth = 1600;
          const maxHeight = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({
              id: generateId("img"),
              url: e.target?.result as string,
              name: file.name || "screenshot.png",
              createdAt: new Date().toISOString(),
              size: file.size
            });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

          resolve({
            id: generateId("img"),
            url: dataUrl,
            name: file.name || "screenshot.png",
            createdAt: new Date().toISOString(),
            size: file.size
          });
        };
        img.onerror = () => {
          resolve({
            id: generateId("img"),
            url: e.target?.result as string,
            name: file.name || "screenshot.png",
            createdAt: new Date().toISOString(),
            size: file.size
          });
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const validImageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));
    if (validImageFiles.length === 0) return;

    try {
      const processed = await Promise.all(validImageFiles.map(processImageFile));
      onAddImages(processed);
    } catch (err) {
      console.error("Error processing attached images:", err);
    }
  }, [onAddImages]);

  // Global & component clipboard paste listener for screenshots (Ctrl+V)
  useEffect(() => {
    if (readOnly) return;

    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            const timestamp = new Date().toLocaleTimeString().replace(/:/g, "-");
            const namedFile = new File([file], `screenshot_${timestamp}.png`, { type: file.type });
            imageFiles.push(namedFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        handleFiles(imageFiles);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleFiles, readOnly]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readOnly) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (readOnly) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-2.5"}>
      {/* Upload Zone */}
      {!readOnly && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-xl ${compact ? "p-2.5" : "p-3"} flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? "border-emerald-500 bg-emerald-500/10 scale-[0.99]"
              : "border-white/10 hover:border-emerald-500/40 bg-[#161618] hover:bg-white/[0.02]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleInputChange}
            className="hidden"
          />
          <div className="flex items-center gap-1.5 text-emerald-400 mb-0.5">
            <Image className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">Додати фото / скріншот</span>
          </div>
          <p className="text-[10px] text-gray-400">
            Вибрати файл або <kbd className="px-1 py-0.5 bg-white/10 rounded text-[9px] text-gray-300 font-mono">Ctrl+V</kbd>
          </p>
        </div>
      )}

      {/* Thumbnails Grid (Маленькі зображення) */}
      {images.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium px-0.5">
            <span className="flex items-center gap-1">
              <FileImage className="w-3 h-3 text-emerald-400" />
              <span>Зображення ({images.length})</span>
            </span>
            <span className="text-[9px] text-gray-500">Клік для перегляду</span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 p-1.5 bg-[#161618] rounded-xl border border-white/5 max-h-[100px] overflow-y-auto">
            {images.map((img, idx) => (
              <div
                key={img.id || idx}
                className="group relative aspect-square rounded-md overflow-hidden border border-white/10 bg-black/40 hover:border-emerald-500/50 transition-all shadow-xs cursor-pointer"
                onClick={() => onImageClick(img, idx)}
              >
                {/* Thumbnail Image */}
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  loading="lazy"
                />

                {/* Hover Overlay with Magnify Icon */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <span className="p-0.5 rounded-full bg-emerald-500/80 text-black">
                    <Maximize2 className="w-2.5 h-2.5" />
                  </span>
                </div>

                {/* Delete Button (if not readOnly) */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveImage(img.id);
                    }}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/80 hover:bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Видалити зображення"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}

                {/* Badge for index */}
                <span className="absolute bottom-0.5 left-0.5 bg-black/70 text-[8px] font-mono text-gray-300 px-1 rounded">
                  #{idx + 1}
                </span>
              </div>
            ))}

            {/* Quick add button in grid */}
            {!readOnly && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-md border border-dashed border-white/10 hover:border-emerald-500/40 bg-white/[0.01] hover:bg-white/[0.03] flex flex-col items-center justify-center text-gray-400 hover:text-emerald-400 transition-all cursor-pointer"
                title="Додати ще одне зображення"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[8px] font-medium">+ Фото</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
