import { useRef, useState, useEffect, useCallback } from "react";
import { VoiceNote } from "../types";
import { generateId } from "../utils";

interface UseVoiceRecorderOptions {
  onVoiceNoteCreated: (note: VoiceNote) => void;
}

/**
 * Shared microphone recording logic (was duplicated across VoiceRecorder.tsx
 * and TelegramTaskInput.tsx). Records audio via MediaRecorder, encodes the
 * result as a base64 data URL, and hands a VoiceNote back to the caller.
 */
export function useVoiceRecorder({ onVoiceNoteCreated }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [hasPermissionError, setHasPermissionError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordSecondsRef = useRef(0);

  useEffect(() => {
    recordSecondsRef.current = recordSeconds;
  }, [recordSeconds]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = () => {
    setRecordSeconds(0);
    timerIntervalRef.current = window.setInterval(() => {
      setRecordSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    setHasPermissionError(false);
    setErrorMessage("");

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Ваш браузер не підтримує запис аудіо або доступ заборонено.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopTimer();
        stopStream();

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;
            const finalDuration = Math.max(recordSecondsRef.current, 1);
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

            const newNote: VoiceNote = {
              id: generateId("voice"),
              audioUrl: base64Audio,
              duration: finalDuration,
              createdAt: now.toISOString(),
              name: `Голосове (${timeStr}, ${finalDuration}с)`
            };

            onVoiceNoteCreated(newNote);
          };
          reader.readAsDataURL(audioBlob);
        }
        setIsRecording(false);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      startTimer();
    } catch (err: any) {
      console.error("Microphone recording error:", err);
      setHasPermissionError(true);
      setErrorMessage(
        err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
          ? "Доступ до мікрофону заблоковано в браузері. Будь ласка, дозвольте доступ до мікрофону у налаштуваннях сторінки."
          : "Не вдалося отримати доступ до мікрофону. Перевірте підключення мікрофону."
      );
      setIsRecording(false);
      stopTimer();
      stopStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onVoiceNoteCreated]);

  const stopAndSaveRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback((onCancel?: () => void) => {
    stopTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopStream();
    setIsRecording(false);
    setRecordSeconds(0);
    if (onCancel) onCancel();
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return {
    isRecording,
    recordSeconds,
    hasPermissionError,
    errorMessage,
    startRecording,
    stopAndSaveRecording,
    cancelRecording,
    formatTime
  };
}
