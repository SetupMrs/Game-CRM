import React, { useState, useRef, useEffect } from "react";
import { 
  MessageSquare, 
  Send, 
  Mic, 
  Image as ImageIcon, 
  Paperclip, 
  Trash2, 
  Pin, 
  Check, 
  X, 
  AlertCircle, 
  RefreshCw, 
  Maximize2, 
  FileText, 
  User, 
  Shield, 
  Code, 
  Briefcase, 
  Clock, 
  ChevronDown,
  Calendar,
  Sparkles,
  Volume2
} from "lucide-react";
import { Task, TaskChatMessage, VoiceNote, TaskImage, TaskStatus, TASK_STATUS_CONFIGS, AssignableUser } from "../types";
import { generateId, getAvatarColor } from "../utils";
import VoicePlayer from "./VoicePlayer";

interface TaskDiscussionChatProps {
  task: Task;
  onUpdateTask: (updatedTask: Task) => void;
  onClose?: () => void;
  onOpenLightbox?: (images: TaskImage[], index: number) => void;
  isModal?: boolean;
  assignableUsers?: AssignableUser[];
  currentUserId?: string | null;
}

const DEFAULT_SENDER_ROLES = [
  { name: "Керівник", role: "Адміністратор", icon: Briefcase, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { name: "Модератор", role: "Модератор", icon: Shield, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { name: "Розробник", role: "Розробник", icon: Code, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { name: "Виконавець", role: "Виконавець", icon: User, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" }
];

export default function TaskDiscussionChat({
  task,
  onUpdateTask,
  onClose,
  onOpenLightbox,
  isModal = true,
  assignableUsers = [],
  currentUserId = null
}: TaskDiscussionChatProps) {
  const messages = task.chatMessages || [];

  const memberById = React.useMemo(() => {
    const map: Record<string, AssignableUser> = {};
    assignableUsers.forEach(m => { map[m.id] = m; });
    return map;
  }, [assignableUsers]);

  const currentTeamMember = currentUserId ? memberById[currentUserId] : null;

  // Active Sender State (saved in localStorage for seamless experience).
  // Defaults to the logged-in account when one is set.
  const [senderName, setSenderName] = useState(() => {
    return currentTeamMember?.username || localStorage.getItem("game_crm_chat_sender_name") || "Керівник";
  });
  const [senderRole, setSenderRole] = useState(() => {
    return localStorage.getItem("game_crm_chat_sender_role") || "Адміністратор";
  });
  const [senderTeamMemberId, setSenderTeamMemberId] = useState<string | undefined>(() => {
    return currentTeamMember?.id || undefined;
  });
  const [isRolePickerOpen, setIsRolePickerOpen] = useState(false);

  // New Message Input State
  const [inputText, setInputText] = useState("");
  const [pendingImages, setPendingImages] = useState<TaskImage[]>([]);
  const [pendingVoiceNote, setPendingVoiceNote] = useState<VoiceNote | null>(null);

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [hasPermissionError, setHasPermissionError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom on messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, pendingVoiceNote, pendingImages.length]);

  // Clean up recording stream on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
    };
  }, []);

  const handleSelectRole = (name: string, role: string) => {
    setSenderName(name);
    setSenderRole(role);
    setSenderTeamMemberId(undefined);
    localStorage.setItem("game_crm_chat_sender_name", name);
    localStorage.setItem("game_crm_chat_sender_role", role);
    setIsRolePickerOpen(false);
  };

  const handleSelectTeamMember = (member: AssignableUser) => {
    setSenderName(member.username);
    setSenderTeamMemberId(member.id);
    localStorage.setItem("game_crm_chat_sender_name", member.username);
    setIsRolePickerOpen(false);
  };

  // Voice Recording Methods
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

  const startRecording = async () => {
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
            const finalDuration = Math.max(recordSeconds, 1);
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

            const newNote: VoiceNote = {
              id: generateId("voice-msg"),
              audioUrl: base64Audio,
              duration: finalDuration,
              createdAt: now.toISOString(),
              name: `Голосове (${timeStr}, ${finalDuration}с)`
            };

            setPendingVoiceNote(newNote);
          };
          reader.readAsDataURL(audioBlob);
        }
        setIsRecording(false);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      startTimer();
    } catch (err: any) {
      console.error("Microphone error:", err);
      setHasPermissionError(true);
      setErrorMessage(
        err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
          ? "Доступ до мікрофону заблоковано в браузері. Дозвольте доступ у налаштуваннях."
          : "Не вдалося отримати доступ до мікрофону."
      );
      setIsRecording(false);
      stopTimer();
      stopStream();
    }
  };

  const stopAndSaveRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    stopTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopStream();
    setIsRecording(false);
    setRecordSeconds(0);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

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
            id: `msg-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: result,
            name: file.name,
            createdAt: new Date().toISOString(),
            size: file.size,
            fileType: isImg ? "image" : (isDoc ? "document" : "file")
          };
          newItems.push(item);
          if (newItems.length === filesToProcess.length) {
            setPendingImages(prev => [...prev, ...newItems]);
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
                  id: `msg-paste-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                  url: base64,
                  name: `Скріншот (${timeStr})`,
                  createdAt: now.toISOString(),
                  size: blob.size,
                  fileType: "image"
                };
                setPendingImages(prev => [...prev, pastedImg]);
              }
            };
            reader.readAsDataURL(blob);
          }
        });
      }
    }
  };

  // Send Message handler
  const handleSendMessage = () => {
    const textTrimmed = inputText.trim();
    if (!textTrimmed && !pendingVoiceNote && pendingImages.length === 0) {
      return;
    }

    const newMessage: TaskChatMessage = {
      id: generateId("msg"),
      senderName: senderName.trim() || "Користувач",
      senderRole: senderRole.trim() || undefined,
      text: textTrimmed || undefined,
      createdAt: new Date().toISOString(),
      voiceNote: pendingVoiceNote || undefined,
      images: pendingImages.length > 0 ? pendingImages : undefined,
      teamMemberId: senderTeamMemberId
    };

    const updatedMessages = [...(task.chatMessages || []), newMessage];
    onUpdateTask({
      ...task,
      chatMessages: updatedMessages
    });

    // Reset input fields
    setInputText("");
    setPendingVoiceNote(null);
    setPendingImages([]);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Delete message
  const handleDeleteMessage = (msgId: string) => {
    const updatedMessages = (task.chatMessages || []).filter(m => m.id !== msgId);
    onUpdateTask({
      ...task,
      chatMessages: updatedMessages
    });
  };

  // Toggle Pin message
  const handleTogglePinMessage = (msgId: string) => {
    const updatedMessages = (task.chatMessages || []).map(m => {
      if (m.id === msgId) {
        return { ...m, isPinned: !m.isPinned };
      }
      return m;
    });
    onUpdateTask({
      ...task,
      chatMessages: updatedMessages
    });
  };

  const formatMessageTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  };

  const formatMessageDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        return "Сьогодні";
      }
      return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
    } catch {
      return "";
    }
  };

  const pinnedMessages = messages.filter(m => m.isPinned);
  const statusCfg = TASK_STATUS_CONFIGS[task.status] || TASK_STATUS_CONFIGS["Pending"];

  return (
    <div className={`flex flex-col bg-[#0f0f11] text-white border border-white/10 ${
      isModal ? "rounded-2xl max-h-[85vh] h-[750px] w-full shadow-2xl overflow-hidden" : "rounded-xl h-[550px] overflow-hidden"
    }`}>
      {/* 1. CHAT HEADER */}
      <div className="px-4 py-3 bg-[#161618] border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate max-w-[280px] sm:max-w-[450px]">
                {task.title}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${statusCfg.badgeClass}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5 truncate">
              <span>Чат обговорення справи</span>
              <span>•</span>
              <span className="text-emerald-400 font-mono font-semibold">{messages.length} повідомлень</span>
              {task.counterparty && (
                <>
                  <span>•</span>
                  <span className="text-gray-300">Контрагент: {task.counterparty}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Identity role selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRolePickerOpen(!isRolePickerOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-gray-300 hover:text-white transition-all cursor-pointer"
              title="Змінити профіль відправника"
            >
              <span className="text-[10px] text-gray-400 hidden sm:inline">Я:</span>
              <span className="font-bold text-white text-[11px] truncate max-w-[90px]">{senderName}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isRolePickerOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#18181b] border border-white/15 rounded-xl shadow-2xl p-2 z-50 animate-fadeIn space-y-1">
                {assignableUsers.length > 0 && (
                  <>
                    <div className="text-[10px] font-bold text-gray-400 uppercase px-2 py-1">
                      Команда:
                    </div>
                    {assignableUsers.map((member) => {
                      const isSelected = senderTeamMemberId === member.id;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => handleSelectTeamMember(member)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            isSelected ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-gray-300 hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                              style={{ backgroundColor: getAvatarColor(member.id) }}
                            >
                              {member.username.trim().charAt(0).toUpperCase()}
                            </span>
                            <span>{member.username}</span>
                          </div>
                        </button>
                      );
                    })}
                    <div className="border-t border-white/5 my-1"></div>
                  </>
                )}
                <div className="text-[10px] font-bold text-gray-400 uppercase px-2 py-1">
                  Виберіть від імені кого писати:
                </div>
                {DEFAULT_SENDER_ROLES.map((r) => {
                  const Icon = r.icon;
                  const isSelected = senderName === r.name;
                  return (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() => handleSelectRole(r.name, r.role)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isSelected ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-gray-300 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{r.name}</span>
                      </div>
                      <span className="text-[10px] text-gray-500">{r.role}</span>
                    </button>
                  );
                })}
                <div className="pt-1 border-t border-white/5">
                  <div className="text-[10px] text-gray-500 px-2 mb-1">Або введіть власне ім'я:</div>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => {
                      setSenderName(e.target.value);
                      setSenderTeamMemberId(undefined);
                      localStorage.setItem("game_crm_chat_sender_name", e.target.value);
                    }}
                    placeholder="Введіть ваше ім'я..."
                    className="w-full px-2 py-1 text-xs bg-black/40 border border-white/10 rounded text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Закрити чат"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* PINNED MESSAGES BANNER (if any) */}
      {pinnedMessages.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2 truncate">
            <Pin className="w-3.5 h-3.5 shrink-0 text-amber-400 rotate-45" />
            <span className="font-bold text-[11px] uppercase tracking-wider text-amber-400 shrink-0">
              Закріплено ({pinnedMessages.length}):
            </span>
            <span className="truncate text-gray-300 text-[11px]">
              {pinnedMessages[pinnedMessages.length - 1].text || "Вкладення (голосове/файл)"}
            </span>
          </div>
          <span className="text-[10px] text-gray-500 shrink-0 font-mono">
            {formatMessageTime(pinnedMessages[pinnedMessages.length - 1].createdAt)}
          </span>
        </div>
      )}

      {/* 2. MESSAGES TIMELINE */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gradient-to-b from-[#0f0f11] to-[#121214]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h4 className="text-sm font-bold text-white">Обговорення ще не розпочато</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Напишіть перше повідомлення, запишіть голосову нотатку або надішліть скріншоти до цього завдання.
              </p>
            </div>
            {/* Quick Prompt Ideas */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
              {[
                "Завдання взято в роботу 👍",
                "Уточніть, будь ласка, деталі 📋",
                "Готово до перевірки! 🚀"
              ].map((quickText) => (
                <button
                  key={quickText}
                  type="button"
                  onClick={() => {
                    setInputText(quickText);
                    if (textareaRef.current) textareaRef.current.focus();
                  }}
                  className="px-2.5 py-1 bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 text-gray-300 hover:text-emerald-400 rounded-lg text-xs transition-all cursor-pointer"
                >
                  {quickText}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderName === senderName;
            const msgDate = formatMessageDate(msg.createdAt);
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const prevDate = prevMsg ? formatMessageDate(prevMsg.createdAt) : null;
            const showDateHeader = msgDate !== prevDate;

            return (
              <React.Fragment key={msg.id || idx}>
                {/* Date separator */}
                {showDateHeader && (
                  <div className="flex justify-center my-2">
                    <span className="bg-white/5 border border-white/10 text-gray-400 text-[10px] px-2.5 py-0.5 rounded-full font-mono">
                      {msgDate}
                    </span>
                  </div>
                )}

                {/* Message Bubble Container */}
                <div className={`flex gap-2.5 group ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Sender Avatar */}
                  <div className="shrink-0 pt-0.5">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold border shadow-xs ${
                        msg.teamMemberId && memberById[msg.teamMemberId]
                          ? "text-white border-white/10"
                          : isMe
                          ? "bg-emerald-500 text-black border-emerald-400"
                          : "bg-white/10 text-gray-200 border-white/10"
                      }`}
                      style={
                        msg.teamMemberId && memberById[msg.teamMemberId]
                          ? { backgroundColor: getAvatarColor(msg.teamMemberId) }
                          : undefined
                      }
                    >
                      {msg.senderName.slice(0, 1).toUpperCase()}
                    </div>
                  </div>

                  {/* Bubble Content */}
                  <div className={`max-w-[85%] sm:max-w-[70%] space-y-1.5 ${isMe ? "items-end" : "items-start"}`}>
                    {/* Sender Meta Line */}
                    <div className={`flex items-center gap-1.5 text-[10px] ${isMe ? "justify-end text-emerald-400" : "text-gray-400"}`}>
                      <span className="font-bold text-white">{msg.senderName}</span>
                      {msg.senderRole && (
                        <span className="px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-gray-400 text-[9px]">
                          {msg.senderRole}
                        </span>
                      )}
                      <span className="text-gray-500 font-mono">{formatMessageTime(msg.createdAt)}</span>
                      {msg.isPinned && (
                        <Pin className="w-2.5 h-2.5 text-amber-400 rotate-45 shrink-0" />
                      )}
                    </div>

                    {/* Main Bubble */}
                    <div className={`relative p-3 rounded-2xl transition-all shadow-md ${
                      isMe
                        ? "bg-emerald-600/20 border border-emerald-500/30 text-emerald-50 rounded-tr-xs"
                        : "bg-[#18181b] border border-white/10 text-gray-200 rounded-tl-xs"
                    }`}>
                      {/* Message Text */}
                      {msg.text && (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap font-sans select-text">
                          {msg.text}
                        </p>
                      )}

                      {/* Voice Note Player inside message */}
                      {msg.voiceNote && (
                        <div className="mt-2 pt-1">
                          <VoicePlayer voiceNote={msg.voiceNote} compact={true} />
                        </div>
                      )}

                      {/* Attached Images / Files inside message */}
                      {msg.images && msg.images.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {/* Images Grid */}
                          {msg.images.filter(i => !i.fileType || i.fileType === "image").length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {msg.images
                                .filter(i => !i.fileType || i.fileType === "image")
                                .map((img, imgIdx) => (
                                  <div
                                    key={img.id || imgIdx}
                                    onClick={() => onOpenLightbox && onOpenLightbox(msg.images || [], imgIdx)}
                                    className="group/img relative aspect-video rounded-lg overflow-hidden border border-white/10 bg-black/40 hover:border-emerald-500 cursor-pointer shadow-xs"
                                  >
                                    <img
                                      src={img.url}
                                      alt={img.name}
                                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                      <Maximize2 className="w-3.5 h-3.5 text-white" />
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}

                          {/* Documents List */}
                          {msg.images.filter(i => i.fileType && i.fileType !== "image").map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/10 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="truncate text-white font-medium">{doc.name}</span>
                              </div>
                              {doc.size && (
                                <span className="text-[10px] text-gray-500 font-mono shrink-0 ml-2">
                                  {Math.round(doc.size / 1024)} KB
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Quick Action buttons on hover (Pin, Delete) */}
                      <div className={`absolute -top-2 ${isMe ? "-left-14" : "-right-14"} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-[#161618] border border-white/15 px-1 py-0.5 rounded-lg shadow-lg`}>
                        <button
                          type="button"
                          onClick={() => handleTogglePinMessage(msg.id)}
                          className={`p-1 rounded hover:bg-white/10 transition-colors cursor-pointer ${
                            msg.isPinned ? "text-amber-400" : "text-gray-400 hover:text-white"
                          }`}
                          title={msg.isPinned ? "Відкріпити" : "Закріпити"}
                        >
                          <Pin className="w-3 h-3 rotate-45" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                          title="Видалити повідомлення"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. PENDING ATTACHMENTS PREVIEW (Above input if any prepared) */}
      {(pendingVoiceNote || pendingImages.length > 0) && (
        <div className="px-4 py-2 bg-[#141416] border-t border-white/10 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span className="font-bold text-emerald-400">Підготовлені вкладення до відправки:</span>
            <button
              type="button"
              onClick={() => {
                setPendingVoiceNote(null);
                setPendingImages([]);
              }}
              className="text-[10px] text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
            >
              Очистити все
            </button>
          </div>

          {/* Voice Preview */}
          {pendingVoiceNote && (
            <div className="flex items-center justify-between bg-black/40 border border-emerald-500/30 p-2 rounded-xl">
              <VoicePlayer voiceNote={pendingVoiceNote} compact={true} />
              <button
                type="button"
                onClick={() => setPendingVoiceNote(null)}
                className="p-1 text-gray-400 hover:text-red-400 cursor-pointer ml-2"
                title="Видалити голосове"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Images/Files Preview */}
          {pendingImages.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {pendingImages.map((img, idx) => (
                <div key={img.id || idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/15 bg-black/40 shrink-0 group">
                  {img.fileType === "document" || img.fileType === "file" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="text-[8px] text-gray-300 truncate w-full">{img.name}</span>
                    </div>
                  ) : (
                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingImages(prev => prev.filter(i => i.id !== img.id))}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/80 hover:bg-red-500 text-white rounded cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. ACTIVE RECORDING BAR */}
      {isRecording && (
        <div className="px-4 py-2.5 bg-red-500/10 border-t border-red-500/30 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
              Запис голосу...
            </span>
            <span className="font-mono text-xs font-bold text-white bg-black/60 px-2 py-0.5 rounded border border-white/10">
              {formatTime(recordSeconds)}
            </span>
          </div>

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
              <span>Прикріпити</span>
            </button>
          </div>
        </div>
      )}

      {/* Permission Error Notification */}
      {hasPermissionError && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px]">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={startRecording}
            className="text-[10px] font-bold text-white underline hover:no-underline cursor-pointer"
          >
            Спробувати знову
          </button>
        </div>
      )}

      {/* 5. TELEGRAM-STYLE MESSAGE INPUT BAR */}
      <div className="p-3 bg-[#161618] border-t border-white/10 shrink-0">
        <div className="relative bg-[#0f0f11] border border-white/15 focus-within:border-emerald-500 rounded-xl transition-all shadow-inner group">
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

          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Напишіть повідомлення до задачі... (Enter - надіслати, Shift+Enter - новий рядок)"
            className="w-full px-3.5 pt-2.5 pb-9 text-xs text-white bg-transparent resize-none focus:outline-hidden placeholder-gray-500 leading-relaxed font-sans"
          />

          {/* Action buttons inside bottom row of input */}
          <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
            {/* Left media tools */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-white/5 rounded-md transition-all cursor-pointer"
                title="Прикріпити документ чи файл"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-white/5 rounded-md transition-all cursor-pointer"
                title="Прикріпити фото / скріншот (або Ctrl+V)"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>

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
                    ? "bg-red-500 text-white animate-pulse"
                    : "text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                }`}
                title={isRecording ? "Зупинити запис" : "Записати голосове повідомлення"}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right send button */}
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!inputText.trim() && !pendingVoiceNote && pendingImages.length === 0}
              className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                inputText.trim() || pendingVoiceNote || pendingImages.length > 0
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20"
                  : "bg-white/5 text-gray-500 cursor-not-allowed"
              }`}
            >
              <span>Надіслати</span>
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
