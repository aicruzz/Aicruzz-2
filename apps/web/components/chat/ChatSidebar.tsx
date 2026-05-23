"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  MessageSquare,
  Pencil,
  Check,
  X,
  Search,
} from "lucide-react";
import { clsx } from "clsx";
import { chatApi } from "@/lib/api";
import { DeleteChatModal } from "../DeleteModal";

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}

interface ChatSidebarProps {
  chats: ChatSummary[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
  loading?: boolean;
}

function groupChatsByDate(chats: ChatSummary[]) {
  const now = new Date();
  const groups: Record<string, ChatSummary[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 days": [],
    Older: [],
  };
  for (const chat of chats) {
    const d = new Date(chat.updatedAt);
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) groups["Today"].push(chat);
    else if (diff < 172800000) groups["Yesterday"].push(chat);
    else if (diff < 604800000) groups["Last 7 days"].push(chat);
    else groups["Older"].push(chat);
  }
  return groups;
}

export function ChatSidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  loading = false,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  function startEdit(chat: ChatSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditTitle(chat.title);
  }

  async function saveEdit(chatId: string) {
    if (!editTitle.trim()) return;
    try {
      await chatApi.updateTitle(chatId, editTitle.trim());
      onRenameChat(chatId, editTitle.trim());
    } catch {
      // add your own error handling here
    }
    setEditingId(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await chatApi.deleteChat(deleteTarget.id);
      onDeleteChat(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // add your own error handling here
    }
    setDeleting(false);
  }

  const filtered = search.trim()
    ? chats.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : chats;

  const groups = groupChatsByDate(filtered);

  return (
    <>
      {/* ── Sidebar ── */}
      <div className="sidebar-root">
        {/* Header */}
        <div className="sidebar-header">
          <span className="sidebar-logo">Chats</span>
          <button onClick={onNewChat} className="new-chat-btn" title="New chat">
            <Plus size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="search-wrap">
          <Search size={13} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        <div className="chat-list">
          {loading && (
            <div className="shimmer-list">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="shimmer-item"
                  style={{ opacity: 1 - i * 0.15 }}
                />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <p className="empty-label">No conversations found</p>
          )}

          {!loading &&
            Object.entries(groups).map(([label, items]) =>
              items.length === 0 ? null : (
                <div key={label} className="group-block">
                  <p className="group-label">{label}</p>
                  {items.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      isActive={activeChatId === chat.id}
                      isEditing={editingId === chat.id}
                      editTitle={editTitle}
                      editInputRef={editInputRef}
                      onSelect={() => onSelectChat(chat.id)}
                      onStartEdit={(e) => startEdit(chat, e)}
                      onEditChange={setEditTitle}
                      onSaveEdit={() => saveEdit(chat.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onDelete={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(chat);
                      }}
                    />
                  ))}
                </div>
              ),
            )}
        </div>
      </div>

      {/* ── Delete Modal ── */}
      <DeleteChatModal
        chatTitle={deleteTarget?.title ?? ""}
        open={!!deleteTarget}
        deleting={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <style>{`
        /* ─── Root ─── */
        .sidebar-root {
          display: flex;
          flex-direction: column;
          width: 256px;
          height: 100%;
          background: #0d0d0f;
          border-right: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
          font-family: -apple-system, 'SF Pro Text', BlinkMacSystemFont, sans-serif;
        }

        /* ─── Header ─── */
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 14px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .sidebar-logo {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
          letter-spacing: 0.01em;
        }
        .new-chat-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6);
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .new-chat-btn:hover {
          background: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.9);
        }

        /* ─── Search ─── */
        .search-wrap {
          position: relative;
          padding: 10px 12px 8px;
        }
        .search-icon {
          position: absolute;
          left: 22px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255,255,255,0.25);
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          box-sizing: border-box;
          height: 32px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          padding: 0 10px 0 30px;
          font-size: 12px;
          color: rgba(255,255,255,0.8);
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .search-input::placeholder { color: rgba(255,255,255,0.25); }
        .search-input:focus {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.07);
        }

        /* ─── Chat list ─── */
        .chat-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 8px 12px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .chat-list::-webkit-scrollbar { width: 3px; }
        .chat-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

        /* ─── Groups ─── */
        .group-block { margin-bottom: 4px; }
        .group-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.2);
          padding: 10px 8px 4px;
          margin: 0;
        }

        /* ─── Chat row ─── */
        .chat-row {
          position: relative;
          display: flex;
          flex-direction: column;
          border-radius: 8px;
          padding: 8px 10px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.12s, border-color 0.12s;
          margin-bottom: 1px;
        }
        .chat-row:hover { background: rgba(255,255,255,0.05); }
        .chat-row.active {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.1);
        }
        .chat-row-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .chat-title {
          flex: 1;
          min-width: 0;
          font-size: 12.5px;
          font-weight: 450;
          color: rgba(255,255,255,0.75);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.4;
        }
        .chat-row.active .chat-title { color: rgba(255,255,255,0.95); font-weight: 500; }
        .chat-meta {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 3px;
        }
        .chat-meta-text {
          font-size: 10px;
          color: rgba(255,255,255,0.22);
        }

        /* ─── Row actions ─── */
        .row-actions {
          display: none;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .chat-row:hover .row-actions,
        .chat-row.active .row-actions { display: flex; }
        .row-actions.editing { display: flex; }
        .row-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 5px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.3);
          cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        .row-btn:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
        .row-btn.danger:hover { background: rgba(239,68,68,0.15); color: #f87171; }
        .row-btn.confirm { color: #4ade80; }
        .row-btn.confirm:hover { background: rgba(74,222,128,0.12); color: #4ade80; }

        /* ─── Edit input ─── */
        .edit-input {
          flex: 1;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 5px;
          padding: 2px 6px;
          font-size: 12px;
          color: #fff;
          outline: none;
          min-width: 0;
        }

        /* ─── Shimmer ─── */
        .shimmer-list { padding: 8px 4px; display: flex; flex-direction: column; gap: 6px; }
        .shimmer-item {
          height: 44px;
          border-radius: 8px;
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        /* ─── Empty ─── */
        .empty-label {
          text-align: center;
          font-size: 12px;
          color: rgba(255,255,255,0.2);
          padding: 32px 16px;
          margin: 0;
        }
      `}</style>
    </>
  );
}

/* ── Chat row sub-component ── */
function ChatRow({
  chat,
  isActive,
  isEditing,
  editTitle,
  editInputRef,
  onSelect,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  chat: ChatSummary;
  isActive: boolean;
  isEditing: boolean;
  editTitle: string;
  editInputRef: React.RefObject<HTMLInputElement>;
  onSelect: () => void;
  onStartEdit: (e: React.MouseEvent) => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div className={clsx("chat-row", isActive && "active")} onClick={onSelect}>
      <div className="chat-row-top">
        {isEditing ? (
          <input
            ref={editInputRef}
            className="edit-input"
            value={editTitle}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="chat-title">{chat.title}</p>
        )}

        <div className={clsx("row-actions", isEditing && "editing")}>
          {isEditing ? (
            <>
              <button
                className="row-btn confirm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveEdit();
                }}
                title="Save"
              >
                <Check size={13} />
              </button>
              <button
                className="row-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelEdit();
                }}
                title="Cancel"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button className="row-btn" onClick={onStartEdit} title="Rename">
                <Pencil size={11} />
              </button>
              <button
                className="row-btn danger"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="chat-meta">
          <MessageSquare size={9} color="rgba(255,255,255,0.2)" />
          <span className="chat-meta-text">
            {chat._count.messages} · {formatDate(chat.updatedAt)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return "Today";
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
