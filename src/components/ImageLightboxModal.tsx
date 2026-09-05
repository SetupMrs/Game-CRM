import React, { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCcw, FileImage } from "lucide-react";
import { TaskImage } from "../types";

interface ImageLightboxModalProps {
  images: TaskImage[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ImageLightboxModal({
  images,
  initialIndex = 0,
  onClose
}: ImageLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  const currentImage = images[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
        setScale(1);
      } else if (e.key === "ArrowRight" && currentIndex < images.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setScale(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images.length, onClose]);

  if (!currentImage) return null;

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setScale(1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setScale(1);
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = currentImage.url;
    link.download = currentImage.name || `task_image_${currentIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between items-center p-4 select-none animate-fadeIn"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="w-full max-w-6xl flex justify-between items-center bg-[#161618]/80 px-4 py-2.5 rounded-xl border border-white/10 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0 text-white">
          <FileImage className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold truncate max-w-xs md:max-w-md">
            {currentImage.name || `Зображення #${currentIndex + 1}`}
          </span>
          {images.length > 1 && (
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-gray-400 font-mono">
              {currentIndex + 1} / {images.length}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleZoomIn}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Збільшити"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Зменшити"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {scale !== 1 && (
            <button
              onClick={handleResetZoom}
              className="p-1.5 text-emerald-400 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1"
              title="Скинути масштаб"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[10px]">{Math.round(scale * 100)}%</span>
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Завантажити зображення"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors cursor-pointer ml-2"
            title="Закрити (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        className="relative flex-1 w-full max-w-6xl flex items-center justify-center overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Button */}
        {images.length > 1 && (
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`absolute left-2 md:left-6 z-20 p-3 rounded-full bg-black/60 border border-white/10 text-white transition-all backdrop-blur-xs cursor-pointer ${
              currentIndex === 0
                ? "opacity-20 cursor-not-allowed"
                : "hover:bg-emerald-600/80 hover:scale-105"
            }`}
            title="Попереднє зображення (Стрілка вліво)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image */}
        <div className="max-w-full max-h-full flex items-center justify-center p-2 transition-transform duration-150">
          <img
            src={currentImage.url}
            alt={currentImage.name || "Task attachment"}
            style={{ transform: `scale(${scale})` }}
            className="max-h-[75vh] max-w-[88vw] object-contain rounded-lg shadow-2xl border border-white/10 transition-transform origin-center"
          />
        </div>

        {/* Next Button */}
        {images.length > 1 && (
          <button
            onClick={handleNext}
            disabled={currentIndex === images.length - 1}
            className={`absolute right-2 md:right-6 z-20 p-3 rounded-full bg-black/60 border border-white/10 text-white transition-all backdrop-blur-xs cursor-pointer ${
              currentIndex === images.length - 1
                ? "opacity-20 cursor-not-allowed"
                : "hover:bg-emerald-600/80 hover:scale-105"
            }`}
            title="Наступне зображення (Стрілка вправо)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if multiple images) */}
      {images.length > 1 && (
        <div
          className="flex items-center gap-2 max-w-2xl overflow-x-auto p-2 bg-[#161618]/80 rounded-xl border border-white/10 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => (
            <button
              key={img.id || idx}
              onClick={() => {
                setCurrentIndex(idx);
                setScale(1);
              }}
              className={`relative rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                idx === currentIndex
                  ? "border-emerald-500 ring-2 ring-emerald-500/30 scale-105"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={img.url}
                alt={img.name}
                className="w-12 h-12 object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
