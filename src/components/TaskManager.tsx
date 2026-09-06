import React, { useState, useMemo, useRef } from "react";
import { 
  CheckSquare, 
  Trash2, 
  Plus, 
  Search, 
  Calendar, 
  User, 
  ArrowRight, 
  ListTodo, 
  ChevronDown, 
  ChevronUp, 
  Edit2, 
  Bookmark, 
  AlertCircle, 
  Mic, 
  Image as ImageIcon, 
  FileImage, 
  Maximize2, 
  Tag, 
  Users, 
  X, 
  Filter,
  Clock,
  CheckCircle2,
  Check,
  PlayCircle,
  Eye,
  XCircle,
  Sparkles,
  ChevronRight,
  MessageSquare,
  Repeat,
  LayoutTemplate,
  CheckSquare as CheckSquareIcon,
  Package,
  AlertTriangle
} from "lucide-react";
import { 
  Task, 
  SubTask, 
  PriorityLevel, 
  TaskStatus, 
  TaskImage, 
  VoiceNote, 
  AssignableUser,
  TaskTemplate,
  TaskLinkedProduct,
  Supplier,
  RecurrenceFrequency,
  TASK_STATUS_CONFIGS, 
  TASK_STATUS_LIST 
} from "../types";
import { formatDate, generateId, getAvatarColor } from "../utils";
import VoiceRecorder from "./VoiceRecorder";
import VoicePlayer from "./VoicePlayer";
import ImageAttachmentUploader from "./ImageAttachmentUploader";
import ImageLightboxModal from "./ImageLightboxModal";
import TaskTagSelector, { getTagStyle } from "./TaskTagSelector";
import TelegramTaskInput from "./TelegramTaskInput";
import TaskDiscussionChat from "./TaskDiscussionChat";
import TaskCalendarView from "./TaskCalendarView";
import TaskProductLinker from "./TaskProductLinker";

const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
  none: "Не повторюється",
  daily: "Щодня",
  weekly: "Щотижня",
  monthly: "Щомісяця"
};

// Shared "what's the next workflow step" helper — used both on the compact
// task card and in the modal's execution tab, so the two stay in sync.
function getNextStatusAction(status: TaskStatus): { label: string; nextStatus: TaskStatus } | null {
  switch (status) {
    case "Pending":
      return { label: "Прийняти", nextStatus: "Accepted" };
    case "Accepted":
      return { label: "Почати роботу", nextStatus: "In Progress" };
    case "In Progress":
      return { label: "На перевірку", nextStatus: "Review" };
    case "Review":
      return { label: "Завершити", nextStatus: "Completed" };
    case "Completed":
      return { label: "Повернути в роботу", nextStatus: "In Progress" };
    case "Cancelled":
      return { label: "Відновити", nextStatus: "Pending" };
    default:
      return null;
  }
}

const EXECUTION_STEPS: TaskStatus[] = ["Pending", "Accepted", "In Progress", "Review", "Completed"];

interface TaskManagerProps {
  tasks: Task[];
  assignableUsers: AssignableUser[];
  currentUserId: string | null;
  taskTemplates: TaskTemplate[];
  suppliers: Supplier[];
  onAddTask: (task: Omit<Task, "id">) => void;
  onToggleTaskStatus: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, newStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (task: Task) => void;
  onBulkSetStatus: (taskIds: string[], newStatus: TaskStatus) => void;
  onBulkSetAssignee: (taskIds: string[], assigneeId: string | undefined) => void;
  onBulkDeleteTasks: (taskIds: string[]) => void;
  onAddTemplate: (data: Omit<TaskTemplate, "id">) => void;
  onDeleteTemplate: (id: string) => void;
}

// Reusable Date Picker component that forces opening calendar immediately
function DatePickerInput({
  value,
  onChange,
  required = false,
  label,
  className = ""
}: {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenCalendar = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      try {
        inputRef.current.showPicker?.();
      } catch (e) {
        // Fallback for browsers that do not support showPicker
      }
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          {label}
        </label>
      )}
      <div 
        onClick={handleOpenCalendar}
        className="relative flex items-center bg-[#161618] border border-white/10 hover:border-emerald-500/50 rounded-lg transition-colors cursor-pointer group"
      >
        <input
          ref={inputRef}
          type="date"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => {
            try { e.currentTarget.showPicker?.(); } catch(err) {}
          }}
          onFocus={(e) => {
            try { e.currentTarget.showPicker?.(); } catch(err) {}
          }}
          className="w-full px-3 py-2 pr-9 text-xs bg-transparent text-white font-mono cursor-pointer focus:outline-hidden [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenCalendar();
          }}
          className="absolute right-2.5 p-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
          title="Відкрити календар"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function TaskManager({
  tasks,
  assignableUsers,
  currentUserId,
  taskTemplates,
  suppliers,
  onAddTask,
  onToggleTaskStatus,
  onSetTaskStatus,
  onDeleteTask,
  onUpdateTask,
  onBulkSetStatus,
  onBulkSetAssignee,
  onBulkDeleteTasks,
  onAddTemplate,
  onDeleteTemplate
}: TaskManagerProps) {
  // Search, priority, status, assignee and role tag filters
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Templates modal state
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const toggleTaskSelected = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
  };

  const memberById = useMemo(() => {
    const map: Record<string, AssignableUser> = {};
    assignableUsers.forEach(m => { map[m.id] = m; });
    return map;
  }, [assignableUsers]);

  // Collect all unique tags currently existing in tasks for dynamic filtering
  const allAvailableTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      t.tags?.forEach(tag => {
        if (tag.trim()) set.add(tag.trim());
      });
    });
    // Add common preset tags if not present
    ["Модератор", "Розробник", "Дизайнер", "Підтримка"].forEach(preset => set.add(preset));
    return Array.from(set);
  }, [tasks]);

  // Lightbox Modal State
  const [lightboxData, setLightboxData] = useState<{
    images: TaskImage[];
    initialIndex: number;
  } | null>(null);

  // Create Task Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [isCancelledExpanded, setIsCancelledExpanded] = useState(false);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    dueDate: new Date().toISOString().split("T")[0],
    priority: "Medium" as PriorityLevel,
    status: "Pending" as TaskStatus,
    counterparty: "",
    initialSubTasks: [] as string[],
    images: [] as TaskImage[],
    voiceNotes: [] as VoiceNote[],
    tags: [] as string[],
    assigneeId: currentUserId || "",
    recurrence: "none" as RecurrenceFrequency,
    linkedProducts: [] as TaskLinkedProduct[]
  });
  const [newSubTaskInput, setNewSubTaskInput] = useState("");

  // Edit / Details Modal State
  const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<Task | null>(null);
  const [editModalTab, setEditModalTab] = useState<"execute" | "details" | "chat">("execute");
  const [editSubTaskInput, setEditSubTaskInput] = useState("");

  // Standalone Chat Modal State
  const [chatTask, setChatTask] = useState<Task | null>(null);

  // Chat handlers
  const handleOpenChat = (task: Task) => {
    setChatTask(task);
  };

  const handleUpdateTaskFromChat = (updatedTask: Task) => {
    onUpdateTask(updatedTask);
    if (chatTask && chatTask.id === updatedTask.id) {
      setChatTask(updatedTask);
    }
    if (selectedTaskForEdit && selectedTaskForEdit.id === updatedTask.id) {
      setSelectedTaskForEdit(updatedTask);
    }
  };

  // Task Stats & Tracking Analytics Computations
  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === "Pending").length;
    const accepted = tasks.filter(t => t.status === "Accepted").length;
    const inProgress = tasks.filter(t => t.status === "In Progress").length;
    const review = tasks.filter(t => t.status === "Review").length;
    const completed = tasks.filter(t => t.status === "Completed").length;
    const cancelled = tasks.filter(t => t.status === "Cancelled").length;

    // Overdue count
    const todayStr = new Date().toISOString().split("T")[0];
    const overdue = tasks.filter(t => t.status !== "Completed" && t.status !== "Cancelled" && t.dueDate < todayStr).length;

    // Subtasks total and completed
    let totalSubTasks = 0;
    let completedSubTasks = 0;
    tasks.forEach(t => {
      if (t.subTasks) {
        totalSubTasks += t.subTasks.length;
        completedSubTasks += t.subTasks.filter(st => st.completed).length;
      }
    });

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const subtaskCompletionRate = totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0;

    return {
      total,
      pending,
      accepted,
      inProgress,
      review,
      completed,
      cancelled,
      overdue,
      totalSubTasks,
      completedSubTasks,
      completionRate,
      subtaskCompletionRate
    };
  }, [tasks]);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    // Map initial subtasks strings to SubTask objects
    const mappedSubTasks: SubTask[] = newTask.initialSubTasks.map((title, idx) => ({
      id: `sub-${Date.now()}-${idx}`,
      title,
      completed: false
    }));

    onAddTask({
      title: newTask.title.trim(),
      description: newTask.description.trim() || undefined,
      dueDate: newTask.dueDate,
      status: newTask.status || "Pending",
      priority: newTask.priority,
      counterparty: newTask.counterparty.trim() || undefined,
      subTasks: mappedSubTasks.length > 0 ? mappedSubTasks : undefined,
      images: newTask.images.length > 0 ? newTask.images : undefined,
      voiceNotes: newTask.voiceNotes.length > 0 ? newTask.voiceNotes : undefined,
      tags: newTask.tags.length > 0 ? newTask.tags : undefined,
      assigneeId: newTask.assigneeId || undefined,
      recurrence: newTask.recurrence !== "none" ? newTask.recurrence : undefined,
      linkedProducts: newTask.linkedProducts.length > 0 ? newTask.linkedProducts : undefined
    });

    // Reset Form
    setNewTask({
      title: "",
      description: "",
      dueDate: new Date().toISOString().split("T")[0],
      priority: "Medium",
      status: "Pending",
      counterparty: "",
      initialSubTasks: [],
      images: [],
      voiceNotes: [],
      tags: [],
      assigneeId: currentUserId || "",
      recurrence: "none",
      linkedProducts: []
    });
    setNewSubTaskInput("");
    setIsFormOpen(false);
  };

  const addInitialSubTask = () => {
    if (!newSubTaskInput.trim()) return;
    setNewTask(prev => ({
      ...prev,
      initialSubTasks: [...prev.initialSubTasks, newSubTaskInput.trim()]
    }));
    setNewSubTaskInput("");
  };

  const removeInitialSubTask = (idx: number) => {
    setNewTask(prev => ({
      ...prev,
      initialSubTasks: prev.initialSubTasks.filter((_, i) => i !== idx)
    }));
  };

  // TEMPLATES
  const applyTemplate = (template: TaskTemplate) => {
    setNewTask({
      title: template.title,
      description: template.description || "",
      dueDate: new Date().toISOString().split("T")[0],
      priority: template.priority,
      status: "Pending",
      counterparty: "",
      initialSubTasks: [...template.subTaskTitles],
      images: [],
      voiceNotes: [],
      tags: template.tags ? [...template.tags] : [],
      assigneeId: currentUserId || "",
      recurrence: "none",
      linkedProducts: []
    });
    setIsTemplatesModalOpen(false);
    setIsFormOpen(true);
  };

  const handleSaveCurrentAsTemplate = () => {
    if (!newTemplateName.trim() || !newTask.title.trim()) return;
    onAddTemplate({
      name: newTemplateName.trim(),
      title: newTask.title.trim(),
      description: newTask.description.trim() || undefined,
      priority: newTask.priority,
      subTaskTitles: [...newTask.initialSubTasks],
      tags: newTask.tags.length > 0 ? [...newTask.tags] : undefined
    });
    setNewTemplateName("");
    setIsSaveTemplateOpen(false);
  };

  // Direct status update handler
  const handleDirectSetStatus = (taskId: string, newStatus: TaskStatus) => {
    if (onSetTaskStatus) {
      onSetTaskStatus(taskId, newStatus);
    } else {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        onUpdateTask({ ...task, status: newStatus });
      }
    }
  };

  // Filtered task items for the board
  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // Search query (title, description, counterparty, or matching tag)
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(t => 
        t.title.toLowerCase().includes(query) || 
        (t.description && t.description.toLowerCase().includes(query)) ||
        (t.counterparty && t.counterparty.toLowerCase().includes(query)) ||
        (t.tags && t.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    // Status filter
    if (statusFilter !== "All") {
      result = result.filter(t => t.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== "All") {
      result = result.filter(t => t.priority === priorityFilter);
    }

    // Role / Tag filter
    if (tagFilter !== "All") {
      result = result.filter(t => 
        t.tags && t.tags.some(tag => tag.toLowerCase() === tagFilter.toLowerCase())
      );
    }

    // Assignee filter
    if (assigneeFilter !== "All") {
      if (assigneeFilter === "Unassigned") {
        result = result.filter(t => !t.assigneeId);
      } else {
        result = result.filter(t => t.assigneeId === assigneeFilter);
      }
    }

    return result;
  }, [tasks, searchQuery, statusFilter, priorityFilter, tagFilter, assigneeFilter]);

  // Divide into groups for stages
  const completedTasks = filteredTasks.filter(t => t.status === "Completed");
  const cancelledTasks = filteredTasks.filter(t => t.status === "Cancelled");


  // Unified list shown in the main section (status shown as a badge per task,
  // not split into columns). When no specific status filter is chosen, hide
  // Completed/Cancelled here since they already have their own collapsible
  // sections below — avoids showing the same task twice.
  const activeListTasks = statusFilter === "All"
    ? filteredTasks.filter(t => t.status !== "Completed" && t.status !== "Cancelled")
    : filteredTasks;

  // EDIT MODAL ACTIONS
  const handleOpenEditModal = (task: Task) => {
    setEditModalTab("execute");
    setSelectedTaskForEdit({
      ...task,
      subTasks: task.subTasks || [],
      description: task.description || "",
      counterparty: task.counterparty || "",
      images: task.images || [],
      voiceNotes: task.voiceNotes || [],
      tags: task.tags || []
    });
  };

  const handleSaveTaskEdit = () => {
    if (!selectedTaskForEdit) return;
    
    onUpdateTask({
      ...selectedTaskForEdit,
      counterparty: selectedTaskForEdit.counterparty?.trim() || undefined,
      images: selectedTaskForEdit.images && selectedTaskForEdit.images.length > 0 ? selectedTaskForEdit.images : undefined,
      voiceNotes: selectedTaskForEdit.voiceNotes && selectedTaskForEdit.voiceNotes.length > 0 ? selectedTaskForEdit.voiceNotes : undefined,
      tags: selectedTaskForEdit.tags && selectedTaskForEdit.tags.length > 0 ? selectedTaskForEdit.tags : undefined
    });
    setSelectedTaskForEdit(null);
  };

  const addSubTaskInEdit = () => {
    if (!selectedTaskForEdit || !editSubTaskInput.trim()) return;
    
    const newSub: SubTask = {
      id: generateId("sub"),
      title: editSubTaskInput.trim(),
      completed: false
    };

    const updatedSubtasks = [...(selectedTaskForEdit.subTasks || []), newSub];
    const updated = { ...selectedTaskForEdit, subTasks: updatedSubtasks };
    setSelectedTaskForEdit(updated);
    onUpdateTask(updated);
    setEditSubTaskInput("");
  };

  const toggleSubTaskInEdit = (subId: string) => {
    if (!selectedTaskForEdit || !selectedTaskForEdit.subTasks) return;
    
    const updatedSubtasks = selectedTaskForEdit.subTasks.map(st => 
      st.id === subId ? { ...st, completed: !st.completed } : st
    );

    const updated = { ...selectedTaskForEdit, subTasks: updatedSubtasks };
    setSelectedTaskForEdit(updated);
    onUpdateTask(updated);
  };

  const removeSubTaskInEdit = (subId: string) => {
    if (!selectedTaskForEdit || !selectedTaskForEdit.subTasks) return;
    
    const updated = { ...selectedTaskForEdit, subTasks: selectedTaskForEdit.subTasks.filter(st => st.id !== subId) };
    setSelectedTaskForEdit(updated);
    onUpdateTask(updated);
  };

  // Inline Subtask Add inside the Card
  const handleInlineAddSubTask = (taskId: string, title: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !title.trim()) return;

    const newSub: SubTask = {
      id: generateId("sub"),
      title: title.trim(),
      completed: false
    };

    const updatedSubtasks = [...(task.subTasks || []), newSub];
    onUpdateTask({
      ...task,
      subTasks: updatedSubtasks
    });
  };

  // Inline Subtask Toggle inside the Card
  const handleInlineToggleSubTask = (taskId: string, subId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.subTasks) return;

    const updatedSubTasks = task.subTasks.map(st => 
      st.id === subId ? { ...st, completed: !st.completed } : st
    );

    // Toggling a subtask only updates the checklist — it no longer changes
    // the task's own status. The task's status is a separate, deliberate
    // action (status badge / "В роботу" button), not an automatic side
    // effect of finishing a checklist.
    onUpdateTask({
      ...task,
      subTasks: updatedSubTasks
    });
  };

  const handleOpenLightbox = (images: TaskImage[], index: number = 0) => {
    setLightboxData({
      images,
      initialIndex: index
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Title & Command row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#111112] p-4 sm:p-5 rounded-xl border border-white/5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <CheckSquare className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-white text-lg">Завдання</h3>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setIsTemplatesModalOpen(true)}
            className="flex items-center gap-1.5 border border-white/10 hover:border-white/20 bg-white/[0.02] text-gray-300 hover:text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer justify-center"
          >
            <LayoutTemplate className="w-4 h-4" />
            Шаблони
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer w-full sm:w-auto justify-center shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            Нове завдання
          </button>
        </div>
      </div>

      {/* TRACKING CHARTS & STATUS METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total */}
        <div className="bg-[#111112] p-3.5 rounded-xl border border-white/5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Всього</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-white font-mono">{stats.total}</span>
            <span className="text-[10px] text-gray-500">справ</span>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-[#111112] p-3.5 rounded-xl border border-blue-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" /> Очікує
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-blue-400 font-mono">{stats.pending}</span>
          </div>
        </div>

        {/* Accepted */}
        <div className="bg-[#111112] p-3.5 rounded-xl border border-indigo-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Прийнято
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-indigo-400 font-mono">{stats.accepted}</span>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-[#111112] p-3.5 rounded-xl border border-amber-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <PlayCircle className="w-3 h-3" /> В роботі
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-amber-400 font-mono">{stats.inProgress}</span>
          </div>
        </div>

        {/* Review */}
        <div className="bg-[#111112] p-3.5 rounded-xl border border-purple-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
            <Eye className="w-3 h-3" /> На перевірці
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-purple-400 font-mono">{stats.review}</span>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-[#111112] p-3.5 rounded-xl border border-emerald-500/20 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <CheckSquare className="w-3 h-3" /> Виконано
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-emerald-400 font-mono">{stats.completed}</span>
            <span className="text-[10px] text-gray-500 font-mono">({stats.completionRate}%)</span>
          </div>
        </div>
      </div>

      {/* Filter Row & Workflow Tabs */}
      <div className="space-y-3 bg-[#111112] p-4 rounded-xl border border-white/5 shadow-xs">
        {/* Status Stage Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-gray-500 text-[11px] font-bold uppercase tracking-wider mr-1 hidden sm:inline">Статус:</span>
          <button
            onClick={() => setStatusFilter("All")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === "All"
                ? "bg-white/15 text-white shadow-xs"
                : "bg-white/[0.02] text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Всі ({stats.total})
          </button>
          {TASK_STATUS_LIST.map((st) => {
            const cfg = TASK_STATUS_CONFIGS[st];
            const count = tasks.filter(t => t.status === st).length;
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? `${cfg.badgeClass} shadow-xs font-bold`
                    : "bg-white/[0.02] text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`}></span>
                <span>{cfg.label}</span>
                <span className="text-[10px] opacity-75 font-mono">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-white/5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Пошук за назвою, тегом, контрагентом..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-gray-500 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Role / Assignee Tag Filter */}
          <div className="relative">
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white cursor-pointer"
            >
              <option value="All">Всі ролі та теги</option>
              {allAvailableTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white cursor-pointer"
            >
              <option value="All">Всі пріоритети</option>
              <option value="High">Високий пріоритет</option>
              <option value="Medium">Середній пріоритет</option>
              <option value="Low">Низький пріоритет</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-[#161618] text-white cursor-pointer"
            >
              <option value="All">Всі відповідальні</option>
              <option value="Unassigned">Без відповідального</option>
              {assignableUsers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View mode toggle: list vs calendar */}
        <div className="flex items-center justify-between gap-1.5 pt-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === "list" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              Список
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === "calendar" ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              Календар
            </button>
          </div>

          {viewMode === "list" && (
            <button
              onClick={() => {
                if (isSelectionMode) {
                  clearSelection();
                } else {
                  setIsSelectionMode(true);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isSelectionMode ? "bg-white/10 text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              <CheckSquareIcon className="w-3.5 h-3.5" />
              {isSelectionMode ? "Скасувати вибір" : "Вибрати кілька"}
            </button>
          )}
        </div>

        {/* Quick Active Tag Filter indicator */}
        {tagFilter !== "All" && (
          <div className="flex items-center gap-2 pt-1 text-xs">
            <span className="text-gray-400 text-[11px] flex items-center gap-1">
              <Filter className="w-3 h-3 text-emerald-400" />
              Активний фільтр за роллю:
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold border ${getTagStyle(tagFilter)}`}>
              <span>{tagFilter}</span>
              <button
                onClick={() => setTagFilter("All")}
                className="hover:text-white cursor-pointer"
                title="Скинути фільтр"
              >
                ✕
              </button>
            </span>
            <button
              onClick={() => setTagFilter("All")}
              className="text-[11px] text-gray-500 hover:text-white underline cursor-pointer"
            >
              Очистити
            </button>
          </div>
        )}
      </div>

      {viewMode === "calendar" && (
        <TaskCalendarView
          tasks={filteredTasks}
          assignableUsers={assignableUsers}
          onSelectTask={handleOpenEditModal}
        />
      )}

      {viewMode === "list" && (
      <>
      {/* Bulk actions bar, shown when in selection mode with items selected */}
      {isSelectionMode && selectedTaskIds.size > 0 && (
        <div className="sticky top-[68px] z-20 bg-[#161618] border border-emerald-500/30 rounded-xl p-3 flex flex-wrap items-center gap-2 shadow-lg">
          <span className="text-xs font-bold text-white px-2">
            Вибрано: {selectedTaskIds.size}
          </span>

          <select
            onChange={(e) => {
              if (e.target.value) {
                onBulkSetStatus(Array.from(selectedTaskIds), e.target.value as TaskStatus);
                e.target.value = "";
              }
            }}
            defaultValue=""
            className="px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-[#1A1A1C] text-white cursor-pointer"
          >
            <option value="" disabled>Змінити статус...</option>
            {TASK_STATUS_LIST.map(st => (
              <option key={st} value={st}>{TASK_STATUS_CONFIGS[st].label}</option>
            ))}
          </select>

          <select
            onChange={(e) => {
              onBulkSetAssignee(Array.from(selectedTaskIds), e.target.value || undefined);
              e.target.value = "";
            }}
            defaultValue=""
            className="px-2.5 py-1.5 text-xs border border-white/10 rounded-lg bg-[#1A1A1C] text-white cursor-pointer"
          >
            <option value="" disabled>Призначити відповідального...</option>
            <option value="">Не призначено</option>
            {assignableUsers.map(m => (
              <option key={m.id} value={m.id}>{m.username}</option>
            ))}
          </select>

          <button
            onClick={() => {
              if (window.confirm(`Видалити ${selectedTaskIds.size} завдань? Це незворотно.`)) {
                onBulkDeleteTasks(Array.from(selectedTaskIds));
                clearSelection();
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Видалити
          </button>

          <button
            onClick={clearSelection}
            className="ml-auto text-xs text-gray-500 hover:text-white underline cursor-pointer"
          >
            Скасувати
          </button>
        </div>
      )}

      {/* ACTIVE TASKS LIST (status shown as a badge on each card, not split into columns) */}
      <div className="bg-[#111112] rounded-xl border border-white/5 p-4 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            {statusFilter === "All" ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Активні завдання</span>
              </>
            ) : (
              <>
                <span className={`w-2.5 h-2.5 rounded-full ${TASK_STATUS_CONFIGS[statusFilter as TaskStatus]?.dotClass || "bg-emerald-500"}`}></span>
                <span>Статус: {TASK_STATUS_CONFIGS[statusFilter as TaskStatus]?.label || statusFilter}</span>
              </>
            )}
          </h4>
          <span className="text-xs font-mono text-gray-400">
            Знайдено: {activeListTasks.length} завдань
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeListTasks.length > 0 ? (
            activeListTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleStatus={onToggleTaskStatus}
                onSetStatus={handleDirectSetStatus}
                onDelete={onDeleteTask}
                onOpenEdit={handleOpenEditModal}
                onOpenChat={handleOpenChat}
                onInlineToggleSubtask={handleInlineToggleSubTask}
                onInlineAddSubtask={handleInlineAddSubTask}
                onOpenLightbox={handleOpenLightbox}
                onSelectTagFilter={(t) => setTagFilter(t)}
                assignee={task.assigneeId ? memberById[task.assigneeId] : undefined}
                isSelectionMode={isSelectionMode}
                isSelected={selectedTaskIds.has(task.id)}
                onToggleSelect={toggleTaskSelected}
              />
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-gray-500 text-xs">
              Немає завдань за вказаними фільтрами.
            </div>
          )}
        </div>
      </div>

      {/* COMPLETED TASKS SECTION (Collapsible) */}
      <div className="bg-[#111112] rounded-xl border border-white/5 overflow-hidden">
        <button
          onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/[0.01] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Завершені Завдання
              </h4>
              <p className="text-[11px] text-gray-500">
                {completedTasks.length} успішно виконаних справ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-emerald-400 font-bold px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">
              {completedTasks.length}
            </span>
            {isCompletedExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </div>
        </button>

        {isCompletedExpanded && (
          <div className="p-5 border-t border-white/5 space-y-4">
            {completedTasks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggleStatus={onToggleTaskStatus}
                    onSetStatus={handleDirectSetStatus}
                    onDelete={onDeleteTask}
                    onOpenEdit={handleOpenEditModal}
                    onOpenChat={handleOpenChat}
                    onInlineToggleSubtask={handleInlineToggleSubTask}
                    onInlineAddSubtask={handleInlineAddSubTask}
                    onOpenLightbox={handleOpenLightbox}
                    onSelectTagFilter={(t) => setTagFilter(t)}
                    assignee={task.assigneeId ? memberById[task.assigneeId] : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center py-6 text-gray-500 text-xs">
                Немає завершених завдань у поточному списку.
              </p>
            )}
          </div>
        )}
      </div>

      {/* CANCELLED TASKS SECTION (Collapsible) */}
      {cancelledTasks.length > 0 && (
        <div className="bg-[#111112] rounded-xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setIsCancelledExpanded(!isCancelledExpanded)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/[0.01] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Скасовані / Відхилені Завдання
                </h4>
                <p className="text-[11px] text-gray-500">
                  {cancelledTasks.length} скасованих справ
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-rose-400 font-bold px-2 py-0.5 bg-rose-500/10 rounded-md border border-rose-500/20">
                {cancelledTasks.length}
              </span>
              {isCancelledExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </div>
          </button>

          {isCancelledExpanded && (
            <div className="p-5 border-t border-white/5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cancelledTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggleStatus={onToggleTaskStatus}
                    onSetStatus={handleDirectSetStatus}
                    onDelete={onDeleteTask}
                    onOpenEdit={handleOpenEditModal}
                    onOpenChat={handleOpenChat}
                    onInlineToggleSubtask={handleInlineToggleSubTask}
                    onInlineAddSubtask={handleInlineAddSubTask}
                    onOpenLightbox={handleOpenLightbox}
                    onSelectTagFilter={(t) => setTagFilter(t)}
                    assignee={task.assigneeId ? memberById[task.assigneeId] : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* CREATE NEW TASK MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#111112] rounded-xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-[#161618] text-white flex justify-between items-center border-b border-white/5 shrink-0">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Нове завдання
              </h4>
              <button 
                onClick={() => setIsFormOpen(false)} 
                className="text-gray-400 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Title input */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Назва завдання *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Введіть назву завдання..."
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                />
              </div>

              {/* Due Date & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Due Date with immediate Calendar trigger */}
                <div className="sm:col-span-1">
                  <DatePickerInput
                    label="Кінцевий термін *"
                    required
                    value={newTask.dueDate}
                    onChange={(val) => setNewTask({ ...newTask, dueDate: val })}
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Пріоритет
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as PriorityLevel })}
                    className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg bg-[#161618] text-white focus:outline-hidden cursor-pointer"
                  >
                    <option value="Low">🟢 Низький</option>
                    <option value="Medium">🟡 Середній</option>
                    <option value="High">🔴 Високий</option>
                  </select>
                </div>

                {/* Initial Status */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Початковий статус
                  </label>
                  <select
                    value={newTask.status}
                    onChange={(e) => setNewTask({ ...newTask, status: e.target.value as TaskStatus })}
                    className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg bg-[#161618] text-white focus:outline-hidden cursor-pointer"
                  >
                    {TASK_STATUS_LIST.map((st) => (
                      <option key={st} value={st}>
                        {TASK_STATUS_CONFIGS[st].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Counterparty / Client */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Контрагент / Клієнт / Постачальник (опціонально)
                </label>
                <input
                  type="text"
                  placeholder="Вкажіть особу або компанію..."
                  value={newTask.counterparty}
                  onChange={(e) => setNewTask({ ...newTask, counterparty: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white"
                />
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Відповідальний (опціонально)
                </label>
                <select
                  value={newTask.assigneeId}
                  onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white cursor-pointer"
                >
                  <option value="">Не призначено</option>
                  {assignableUsers.map((m) => (
                    <option key={m.id} value={m.id}>{m.username}</option>
                  ))}
                </select>
              </div>

              {/* Recurrence */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Repeat className="w-3 h-3" />
                  Повторення
                </label>
                <select
                  value={newTask.recurrence}
                  onChange={(e) => setNewTask({ ...newTask, recurrence: e.target.value as RecurrenceFrequency })}
                  className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.02] text-white cursor-pointer"
                >
                  <option value="none">{RECURRENCE_LABELS.none}</option>
                  <option value="daily">{RECURRENCE_LABELS.daily}</option>
                  <option value="weekly">{RECURRENCE_LABELS.weekly}</option>
                  <option value="monthly">{RECURRENCE_LABELS.monthly}</option>
                </select>
                {newTask.recurrence !== "none" && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    Після завершення завдання автоматично створиться наступне на нову дату.
                  </p>
                )}
              </div>

              {/* Linked supplier products */}
              <TaskProductLinker
                suppliers={suppliers}
                linkedProducts={newTask.linkedProducts}
                onChange={(linkedProducts) => setNewTask({ ...newTask, linkedProducts })}
              />

              {/* Description + Telegram-style mini icons (Voice, Image, Files) and sub-attachments */}
              <TelegramTaskInput
                description={newTask.description}
                onChangeDescription={(desc) => setNewTask({ ...newTask, description: desc })}
                voiceNotes={newTask.voiceNotes}
                onChangeVoiceNotes={(voiceNotes) => setNewTask({ ...newTask, voiceNotes })}
                images={newTask.images}
                onChangeImages={(images) => setNewTask({ ...newTask, images })}
                onOpenLightbox={handleOpenLightbox}
                placeholder="Вкажіть супутні вимоги чи нотатки..."
                label="Опис / Деталі"
              />

              {/* ROLE / ASSIGNEE TAGS (Кого це стосується: Модератор, Розробник...) */}
              <div className="space-y-2 border border-white/5 bg-white/[0.01] p-3 rounded-xl">
                <TaskTagSelector
                  selectedTags={newTask.tags}
                  onChange={(tags) => setNewTask({ ...newTask, tags })}
                />
              </div>

              {/* SUBTASKS/CHECKLIST BUILDER */}
              <div className="space-y-2 border border-white/5 bg-white/[0.01] p-3 rounded-xl">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Розбити на підпункти (Чек-лист)
                </label>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubTaskInput}
                    onChange={(e) => setNewSubTaskInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInitialSubTask(); } }}
                    placeholder="напр. Написати листа, Підготувати скан..."
                    className="flex-1 px-3 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.01] text-white"
                  />
                  <button
                    type="button"
                    onClick={addInitialSubTask}
                    className="px-3 bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/50 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    + Додати
                  </button>
                </div>

                {newTask.initialSubTasks.length > 0 && (
                  <ul className="space-y-1.5 pt-1.5 max-h-[100px] overflow-y-auto">
                    {newTask.initialSubTasks.map((title, index) => (
                      <li key={index} className="flex justify-between items-center text-xs text-white bg-[#161618] px-2.5 py-1.5 rounded-lg border border-white/5">
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-4 h-4 rounded-full flex items-center justify-center font-mono">
                            {index + 1}
                          </span>
                          <span className="truncate">{title}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInitialSubTask(index)}
                          className="text-gray-500 hover:text-red-400 text-[10px] cursor-pointer"
                        >
                          Видалити
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsSaveTemplateOpen(true)}
                  disabled={!newTask.title.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-gray-400 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Зберегти поточну назву, опис, чек-лист та пріоритет як шаблон"
                >
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  Зберегти як шаблон
                </button>
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 border border-white/10 rounded-lg text-xs font-semibold hover:bg-white/5 text-gray-400 cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    Створити Завдання
                  </button>
                </div>
              </div>

              {/* Inline "save as template" name prompt */}
              {isSaveTemplateOpen && (
                <div className="bg-[#161618] border border-white/10 rounded-lg p-3 flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Назва шаблону, напр. «Прийняти партію товару»"
                    className="flex-1 px-3 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.02] text-white focus:outline-hidden focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCurrentAsTemplate}
                    disabled={!newTemplateName.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Зберегти
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsSaveTemplateOpen(false); setNewTemplateName(""); }}
                    className="px-2 py-1.5 text-gray-500 hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATES MODAL */}
      {isTemplatesModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#111112] rounded-xl border border-white/10 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 bg-[#161618] text-white flex justify-between items-center border-b border-white/5 shrink-0">
              <h4 className="font-bold text-sm flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-emerald-400" />
                Шаблони завдань
              </h4>
              <button
                onClick={() => setIsTemplatesModalOpen(false)}
                className="text-gray-400 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto flex-1">
              {taskTemplates.length > 0 ? (
                taskTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center gap-3 bg-[#161618] border border-white/5 rounded-lg px-3 py-2.5"
                  >
                    <button
                      onClick={() => applyTemplate(tpl)}
                      className="flex-1 text-left cursor-pointer"
                    >
                      <p className="text-xs font-bold text-white">{tpl.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {tpl.subTaskTitles.length > 0 ? `${tpl.subTaskTitles.length} пунктів чек-листа · ` : ""}
                        {tpl.priority === "High" ? "Високий" : tpl.priority === "Medium" ? "Середній" : "Низький"} пріоритет
                      </p>
                    </button>
                    <button
                      onClick={() => onDeleteTemplate(tpl.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer shrink-0"
                      title="Видалити шаблон"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-gray-500 text-xs space-y-1">
                  <p>Шаблонів ще немає.</p>
                  <p>Створіть завдання і натисніть «Зберегти як шаблон».</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADVANCED TASK EDIT & DETAILS MODAL */}
      {selectedTaskForEdit && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#111112] rounded-xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleIn">
            <div className="px-5 py-3 bg-[#161618] text-white flex justify-between items-center border-b border-white/5 shrink-0">
              {/* Tab Selector in Modal Header */}
              <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setEditModalTab("execute")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    editModalTab === "execute"
                      ? "bg-emerald-500 text-black shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Виконання</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditModalTab("details")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    editModalTab === "details"
                      ? "bg-emerald-500 text-black shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Редагувати</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditModalTab("chat")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    editModalTab === "chat"
                      ? "bg-emerald-500 text-black shadow-xs"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Чат справи</span>
                  {(selectedTaskForEdit.chatMessages?.length || 0) > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                      editModalTab === "chat" ? "bg-black text-white" : "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {selectedTaskForEdit.chatMessages?.length}
                    </span>
                  )}
                </button>
              </div>

              <button 
                onClick={() => setSelectedTaskForEdit(null)} 
                className="text-gray-400 hover:text-white text-lg p-1 hover:bg-white/5 rounded-lg cursor-pointer"
                title="Закрити"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Execution view, Details form, or Discussion Chat */}
            {editModalTab === "chat" ? (
              <div className="p-4 overflow-y-auto flex-1 h-full min-h-[500px] flex flex-col">
                <TaskDiscussionChat
                  task={selectedTaskForEdit}
                  onUpdateTask={handleUpdateTaskFromChat}
                  onOpenLightbox={handleOpenLightbox}
                  isModal={false}
                  assignableUsers={assignableUsers}
                  currentUserId={currentUserId}
                />
              </div>
            ) : editModalTab === "execute" ? (
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Task summary */}
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-white leading-snug">{selectedTaskForEdit.title}</h3>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md border ${
                      selectedTaskForEdit.priority === "High"
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : selectedTaskForEdit.priority === "Medium"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {selectedTaskForEdit.priority === "High" ? "Високий" : selectedTaskForEdit.priority === "Medium" ? "Середній" : "Низький"} пріоритет
                    </span>
                  </div>
                  {selectedTaskForEdit.description && (
                    <p className="text-xs text-gray-400 whitespace-pre-wrap">{selectedTaskForEdit.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 pt-1">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(selectedTaskForEdit.dueDate)}</span>
                    {selectedTaskForEdit.counterparty && (
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {selectedTaskForEdit.counterparty}</span>
                    )}
                    {selectedTaskForEdit.assigneeId && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {assignableUsers.find(u => u.id === selectedTaskForEdit.assigneeId)?.username || "Відповідальний"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status stepper */}
                <div className="bg-[#161618]/50 p-3.5 rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    {EXECUTION_STEPS.map((step, idx) => {
                      const currentIdx = EXECUTION_STEPS.indexOf(selectedTaskForEdit.status);
                      const isDone = selectedTaskForEdit.status !== "Cancelled" && idx < currentIdx;
                      const isCurrent = step === selectedTaskForEdit.status;
                      return (
                        <React.Fragment key={step}>
                          <div className="flex flex-col items-center gap-1 flex-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                              isCurrent
                                ? "bg-emerald-500 border-emerald-400 text-black"
                                : isDone
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                : "bg-white/5 border-white/10 text-gray-600"
                            }`}>
                              {isDone ? <Check className="w-3 h-3" /> : idx + 1}
                            </div>
                            <span className={`text-[9px] text-center leading-tight ${isCurrent ? "text-white font-bold" : "text-gray-600"}`}>
                              {TASK_STATUS_CONFIGS[step]?.label}
                            </span>
                          </div>
                          {idx < EXECUTION_STEPS.length - 1 && (
                            <div className={`h-0.5 flex-1 -mt-4 ${idx < currentIdx ? "bg-emerald-500/40" : "bg-white/5"}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {selectedTaskForEdit.status === "Cancelled" ? (
                    <div className="text-center text-xs text-gray-500 py-1">Це завдання скасовано.</div>
                  ) : (() => {
                    const action = getNextStatusAction(selectedTaskForEdit.status);
                    return action ? (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...selectedTaskForEdit, status: action.nextStatus };
                          setSelectedTaskForEdit(updated);
                          onSetTaskStatus?.(selectedTaskForEdit.id, action.nextStatus);
                        }}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold cursor-pointer shadow-md shadow-emerald-600/20"
                      >
                        {action.label} →
                      </button>
                    ) : null;
                  })()}
                </div>

                {/* Linked products — what the executor should pay attention to
                    (e.g. "this specific code — client says it doesn't work") */}
                {(selectedTaskForEdit.linkedProducts?.length || 0) > 0 && (
                  <div className="space-y-2 bg-[#161618]/50 p-3 rounded-xl border border-white/5">
                    <label className="block text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Прив'язані товари — на що звернути увагу</span>
                    </label>
                    <div className="space-y-1.5">
                      {selectedTaskForEdit.linkedProducts!.map((link) => (
                        <div
                          key={link.id}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs ${
                            link.issueNote
                              ? "bg-red-500/5 border-red-500/20"
                              : "bg-[#111112] border-white/5"
                          }`}
                        >
                          {link.issueNote ? (
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          ) : (
                            <Package className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-semibold">
                              {link.productTitle}
                              {link.itemCode && <span className="text-gray-400 font-mono"> · {link.itemCode}</span>}
                            </p>
                            <p className="text-[10px] text-gray-500">{link.supplierName}</p>
                            {link.issueNote && (
                              <p className="text-red-400 font-semibold mt-1">⚠ {link.issueNote}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Checklist — the actual work to do, independent of task status */}
                <div className="space-y-3 bg-[#161618]/50 p-3 rounded-xl border border-white/5">
                  <label className="block text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                    <span>Чек-лист Підпунктів Справи</span>
                    <span className="font-mono text-[10px] text-gray-500">
                      {selectedTaskForEdit.subTasks?.filter(s => s.completed).length || 0}/
                      {selectedTaskForEdit.subTasks?.length || 0} виконано
                    </span>
                  </label>

                  {/* Subtask inline adder */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editSubTaskInput}
                      onChange={(e) => setEditSubTaskInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubTaskInEdit(); } }}
                      placeholder="Створити наступний підпункт..."
                      className="flex-1 px-3 py-1.5 text-xs border border-white/10 rounded-lg bg-white/[0.01] text-white"
                    />
                    <button
                      type="button"
                      onClick={addSubTaskInEdit}
                      className="px-3 bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/50 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      + Додати
                    </button>
                  </div>

                  {/* Checklist lists */}
                  {selectedTaskForEdit.subTasks && selectedTaskForEdit.subTasks.length > 0 ? (
                    <ul className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                      {selectedTaskForEdit.subTasks.map(st => (
                        <li key={st.id} className="flex justify-between items-center bg-[#111112] border border-white/5 rounded-lg px-3 py-2 text-xs">
                          <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={st.completed}
                              onChange={() => toggleSubTaskInEdit(st.id)}
                              className="h-4 w-4 text-emerald-500 border-white/10 rounded-sm cursor-pointer"
                            />
                            <span className={`text-xs truncate ${st.completed ? "line-through text-gray-500" : "text-white"}`}>
                              {st.title}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeSubTaskInEdit(st.id)}
                            className="text-gray-500 hover:text-red-400 p-1 cursor-pointer shrink-0"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-center py-3 text-gray-500 text-xs">
                      Завдання ще не розділене на підпункти. Створіть перший вище.
                    </p>
                  )}
                  <p className="text-[10px] text-gray-600">
                    Відмітки в чек-листі не впливають на статус завдання — статус переключається окремо кнопкою вище.
                  </p>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditModalTab("details")}
                    className="text-xs text-gray-500 hover:text-white underline cursor-pointer"
                  >
                    Редагувати деталі завдання
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTaskForEdit(null)}
                    className="px-4 py-2 border border-white/10 rounded-lg text-xs font-semibold hover:bg-white/5 text-gray-400 cursor-pointer"
                  >
                    Закрити
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {/* Core Information edit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Назва завдання *
                    </label>
                    <input
                      type="text"
                      required
                      value={selectedTaskForEdit.title}
                      onChange={(e) => setSelectedTaskForEdit({ ...selectedTaskForEdit, title: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.01] text-white"
                    />
                  </div>

                  {/* Due Date with Calendar Trigger */}
                  <div>
                    <DatePickerInput
                      label="Кінцевий термін (Due Date) *"
                      required
                      value={selectedTaskForEdit.dueDate}
                      onChange={(val) => setSelectedTaskForEdit({ ...selectedTaskForEdit, dueDate: val })}
                    />
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Пріоритет справи
                    </label>
                    <select
                      value={selectedTaskForEdit.priority}
                      onChange={(e) => setSelectedTaskForEdit({ ...selectedTaskForEdit, priority: e.target.value as PriorityLevel })}
                      className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg bg-[#161618] text-white focus:outline-hidden cursor-pointer"
                    >
                      <option value="Low">🟢 Низький</option>
                      <option value="Medium">🟡 Середній</option>
                      <option value="High">🔴 Високий</option>
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Контрагент / Оплата за
                    </label>
                    <input
                      type="text"
                      value={selectedTaskForEdit.counterparty || ""}
                      onChange={(e) => setSelectedTaskForEdit({ ...selectedTaskForEdit, counterparty: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg focus:outline-hidden focus:border-emerald-500 bg-white/[0.01] text-white"
                      placeholder="Введіть контрагента..."
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Відповідальний
                    </label>
                    <select
                      value={selectedTaskForEdit.assigneeId || ""}
                      onChange={(e) => setSelectedTaskForEdit({ ...selectedTaskForEdit, assigneeId: e.target.value || undefined })}
                      className="w-full px-3 py-1.5 text-xs border border-white/10 rounded-lg bg-[#161618] text-white focus:outline-hidden cursor-pointer"
                    >
                      <option value="">Не призначено</option>
                      {assignableUsers.map((m) => (
                        <option key={m.id} value={m.id}>{m.username}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <TaskProductLinker
                      suppliers={suppliers}
                      linkedProducts={selectedTaskForEdit.linkedProducts || []}
                      onChange={(linkedProducts) => setSelectedTaskForEdit({ ...selectedTaskForEdit, linkedProducts })}
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-2">
                    <TelegramTaskInput
                      description={selectedTaskForEdit.description || ""}
                      onChangeDescription={(desc) => setSelectedTaskForEdit({ ...selectedTaskForEdit, description: desc })}
                      voiceNotes={selectedTaskForEdit.voiceNotes || []}
                      onChangeVoiceNotes={(voiceNotes) => setSelectedTaskForEdit({ ...selectedTaskForEdit, voiceNotes })}
                      images={selectedTaskForEdit.images || []}
                      onChangeImages={(images) => setSelectedTaskForEdit({ ...selectedTaskForEdit, images })}
                      onOpenLightbox={handleOpenLightbox}
                      placeholder="Напишіть нотатки та вказівки до справи..."
                      label="Опис / Деталі справи"
                    />
                  </div>
                </div>

                {/* Status Selector - All 6 statuses with visual badges */}
                <div className="space-y-2 bg-[#161618]/50 p-3 rounded-xl border border-white/5">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Стан виконання завдання (Статус)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TASK_STATUS_LIST.map(st => {
                      const cfg = TASK_STATUS_CONFIGS[st];
                      const isSelected = selectedTaskForEdit.status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSelectedTaskForEdit({ ...selectedTaskForEdit, status: st })}
                          className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? `${cfg.badgeClass} shadow-md scale-[1.02]`
                              : "bg-white/[0.02] border-white/5 text-gray-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`}></span>
                          <span>{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ROLE / ASSIGNEE TAGS (Кого це стосується: Модератор, Розробник...) */}
                <div className="space-y-2 bg-[#161618]/50 p-3 rounded-xl border border-white/5">
                  <TaskTagSelector
                    selectedTags={selectedTaskForEdit.tags || []}
                    onChange={(tags) => setSelectedTaskForEdit({ ...selectedTaskForEdit, tags })}
                  />
                </div>

                <p className="text-[10px] text-gray-600 text-center">
                  Чек-лист і зміна статусу — на вкладці «Виконання».
                </p>

                {/* Footer actions */}
                <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setSelectedTaskForEdit(null)}
                    className="px-4 py-2 border border-white/10 rounded-lg text-xs font-semibold hover:bg-white/5 text-gray-400 cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTaskEdit}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    Зберегти Зміни
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standalone Task Discussion Chat Modal */}
      {chatTask && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl animate-scaleIn">
            <TaskDiscussionChat
              task={chatTask}
              onUpdateTask={handleUpdateTaskFromChat}
              onClose={() => setChatTask(null)}
              onOpenLightbox={handleOpenLightbox}
              isModal={true}
              assignableUsers={assignableUsers}
              currentUserId={currentUserId}
            />
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {lightboxData && (
        <ImageLightboxModal
          images={lightboxData.images}
          initialIndex={lightboxData.initialIndex}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  );
}

// INNER HELPER COMPONENT: TASK CARD
interface TaskCardProps {
  key?: React.Key;
  task: Task;
  onToggleStatus: (id: string) => void;
  onSetStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onOpenEdit: (task: Task) => void;
  onOpenChat: (task: Task) => void;
  onInlineToggleSubtask: (taskId: string, subId: string) => void;
  onInlineAddSubtask: (taskId: string, title: string) => void;
  onOpenLightbox: (images: TaskImage[], index: number) => void;
  onSelectTagFilter?: (tag: string) => void;
  assignee?: AssignableUser;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function TaskCard({ 
  task, 
  onToggleStatus, 
  onSetStatus,
  onDelete, 
  onOpenEdit,
  onOpenChat,
  onInlineToggleSubtask,
  onInlineAddSubtask,
  onOpenLightbox,
  onSelectTagFilter,
  assignee,
  isSelectionMode,
  isSelected,
  onToggleSelect
}: TaskCardProps) {
  const isOverdue = task.status !== "Completed" && task.status !== "Cancelled" && new Date(task.dueDate).getTime() < new Date().setHours(0,0,0,0);
  const statusConfig = TASK_STATUS_CONFIGS[task.status] || TASK_STATUS_CONFIGS["Pending"];

  return (
    <div
      onClick={() => { if (!isSelectionMode) onOpenEdit(task); }}
      className={`bg-[#161618] p-3.5 rounded-xl border space-y-2 group transition-all hover:border-emerald-500/40 relative ${
        isSelectionMode ? "cursor-default" : "cursor-pointer"
      } ${
        isSelected ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : "border-white/5"
      } ${
        task.priority === "High" && task.status !== "Completed" && task.status !== "Cancelled" ? "border-l-3 border-l-red-500" : ""
      }`}
    >
      {isSelectionMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.id); }}
          className={`absolute -top-2 -left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer z-10 transition-colors ${
            isSelected
              ? "bg-emerald-600 border-emerald-500 text-white"
              : "bg-[#111112] border-white/20 text-transparent hover:border-emerald-500/50"
          }`}
          title={isSelected ? "Скасувати вибір" : "Вибрати завдання"}
        >
          <CheckSquareIcon className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Delete — tucked away, only shows on hover so it doesn't clutter the minimal card */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
        className="absolute top-2 right-2 p-1 text-gray-600 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        title="Видалити завдання"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      {/* Status */}
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusConfig.badgeClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`}></span>
        {statusConfig.label}
      </span>

      {/* Title */}
      <p className={`text-xs font-semibold pr-5 leading-snug ${
        task.status === "Completed" ? "line-through text-gray-500" : "text-white"
      }`}>
        {task.title}
      </p>

      {/* Assignee, priority, deadline — the only other info this card shows */}
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <div className="flex items-center gap-1.5 min-w-0">
          {assignee ? (
            <>
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                style={{ backgroundColor: getAvatarColor(assignee.id) }}
                title={`Відповідальний: ${assignee.username}`}
              >
                {assignee.username.trim().charAt(0).toUpperCase()}
              </span>
              <span className="text-gray-400 truncate">{assignee.username}</span>
            </>
          ) : (
            <span className="text-gray-600 italic">Не призначено</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${
            task.priority === "High" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
            task.priority === "Medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
            "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          }`}>
            {task.priority === "High" ? "Терміново" : task.priority === "Medium" ? "Середній" : "Низький"}
          </span>
          <span className={`flex items-center gap-1 font-mono ${isOverdue ? "text-red-400 font-bold" : "text-gray-500"}`}>
            <Calendar className="w-2.5 h-2.5" />
            {formatDate(task.dueDate)}
          </span>
        </div>
      </div>

      {/* Accept — only shown while pending, disappears the moment it's accepted */}
      {task.status === "Pending" && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSetStatus(task.id, "Accepted"); }}
          className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 rounded-lg cursor-pointer transition-colors"
        >
          <CheckCircle2 className="w-3 h-3" />
          Прийняти завдання
        </button>
      )}
    </div>
  );
}
