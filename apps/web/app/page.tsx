"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@customer-support-ai/ui";

import { env } from "@/env";
import { useToast } from "@/components/toast";
import { formatDate, formatTime, saveExport } from "@/lib/chat";
import type {
  ChatMessage,
  ChatSession,
  SessionExportFormat,
  ToolCall,
  ToolCallKind,
} from "@/types/chat";

const mockStreamingChunks = ["Thinking", "Thinking.", "Thinking..", "Thinking..."];

const fallbackSessions: ChatSession[] = [
  {
    id: "demo-session",
    title: "Return policy questions",
    mode: "Assist",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    messages: [
      {
        id: "m-1",
        role: "user",
        content: "How long do I have to return a headset?",
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        state: "idle",
      },
      {
        id: "m-2",
        role: "assistant",
        content:
          "You have 30 days from delivery to return the headset in its original packaging. I can generate a return label if you need one.",
        citations: ["Return policy v2", "RMA workflow"],
        attachments: [
          { name: "policy.pdf", type: "pdf" },
          { name: "return-label-template.docx", type: "doc" },
        ],
        createdAt: new Date(Date.now() - 1000 * 60 * 29).toISOString(),
        state: "idle",
        toolCalls: [
          {
            id: "t-1",
            type: "knowledge",
            request: "Search 'return window' knowledge articles for headsets",
            response: "Found Return policy v2 and matched SKU headset-elite.",
            status: "complete",
          },
        ],
      },
      {
        id: "m-3",
        role: "user",
        content: "Please start an RMA for order 14-3321.",
        createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        state: "idle",
      },
      {
        id: "m-4",
        role: "assistant",
        content:
          "I'll begin the RMA and prepare a prepaid return label. Do you want to email it to the customer or attach it here?",
        createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
        state: "idle",
        toolCalls: [
          {
            id: "t-2",
            type: "task",
            request: "Submit RMA initiation task for order 14-3321",
            response: "Task created and awaiting confirmation",
            status: "running",
          },
        ],
      },
    ],
  },
];

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${env.NEXT_PUBLIC_API_URL}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    // Some routes may return empty bodies (e.g., 204)
    return null as T;
  }
}

export default function Home() {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<ChatSession[]>(fallbackSessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(fallbackSessions[0]?.id ?? "");
  const [conversationSearch, setConversationSearch] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [input, setInput] = useState("");
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pendingToolType, setPendingToolType] = useState<ToolCallKind | null>(null);
  const streamingTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const notifyError = (title: string, description?: string) =>
    pushToast({ title, description, variant: "error" });

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId),
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    void loadSessions();
    const timers = streamingTimers.current;
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
  }, []);

  async function loadSessions(query = "") {
    setLoadingSessions(true);
    try {
      const data = await apiRequest<ChatSession[]>(`/chat/sessions${query ? `?search=${encodeURIComponent(query)}` : ""}`, {
        cache: "no-store",
      });
      if (data?.length) {
        setSessions(data);
        setSelectedSessionId(data[0].id);
        return;
      }
    } catch (error) {
      console.warn("Falling back to mock sessions", error);
      notifyError("Unable to load conversations", "Showing demo workspace data instead.");
    } finally {
      setLoadingSessions(false);
    }

    if (query) {
      setSessions(
        fallbackSessions.filter((session) =>
          session.title.toLowerCase().includes(query.toLowerCase()),
        ),
      );
    } else {
      setSessions(fallbackSessions);
    }
  }

  async function createSession() {
    const optimisticSession: ChatSession = {
      id: uuid(),
      title: "Untitled chat",
      mode: "Assist",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    setSessions((prev) => [optimisticSession, ...prev]);
    setSelectedSessionId(optimisticSession.id);

    try {
      const created = await apiRequest<ChatSession>("/chat/sessions", {
        method: "POST",
        body: JSON.stringify({ title: optimisticSession.title, mode: optimisticSession.mode }),
      });
      setSessions((prev) => prev.map((session) => (session.id === optimisticSession.id ? { ...optimisticSession, ...created } : session)));
      setSelectedSessionId(created.id);
    } catch (error) {
      console.warn("Session creation fell back to optimistic state", error);
      notifyError("Saved locally", "Could not persist the new session to the API.");
    }
  }

  async function renameSession(id: string, title: string) {
    setSessions((prev) =>
      prev.map((session) => (session.id === id ? { ...session, title, updatedAt: new Date().toISOString() } : session)),
    );

    try {
      await apiRequest(`/chat/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    } catch (error) {
      console.warn("Rename failed, kept optimistic value", error);
      notifyError("Rename failed", "Kept the local title after the API error.");
    }
  }

  async function sendMessage(messageText: string) {
    if (!selectedSession) return;
    const trimmed = messageText.trim();
    if (!trimmed) return;
    setSending(true);

    const userMessage: ChatMessage = {
      id: uuid(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
      state: "sending",
    };

    const assistantMessage: ChatMessage = {
      id: uuid(),
      role: "assistant",
      content: mockStreamingChunks[0],
      createdAt: new Date().toISOString(),
      state: "streaming",
    };

    setSessions((prev) =>
      prev.map((session) =>
        session.id === selectedSession.id
          ? { ...session, messages: [...session.messages, userMessage, assistantMessage], updatedAt: new Date().toISOString() }
          : session,
      ),
    );
    setActiveMessageId(assistantMessage.id);
    setInput("");

    const timer = setInterval(() => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== selectedSession.id) return session;
          return {
            ...session,
            messages: session.messages.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    content: mockStreamingChunks[(mockStreamingChunks.indexOf(message.content) + 1) % mockStreamingChunks.length],
                  }
                : message,
            ),
          };
        }),
      );
    }, 600);

    streamingTimers.current[assistantMessage.id] = timer;

    try {
      const response = await apiRequest<ChatMessage>(`/chat/sessions/${selectedSession.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: trimmed, mode: selectedSession.mode }),
      });

      clearInterval(timer);
      delete streamingTimers.current[assistantMessage.id];

    setSessions((prev) =>
      prev.map((session) =>
        session.id === selectedSession.id
          ? {
                ...session,
                messages: session.messages.map((message) => {
                  if (message.id === userMessage.id) {
                    return { ...message, state: "idle" };
                  }
                  if (message.id === assistantMessage.id) {
                    return {
                      ...message,
                      content: response?.content ?? message.content,
                      citations: response?.citations ?? message.citations,
                      attachments: response?.attachments ?? message.attachments,
                      toolCalls: response?.toolCalls ?? message.toolCalls,
                      state: "idle",
                    };
                  }
                  return message;
                }),
              }
            : session,
        ),
      );
    } catch (error) {
      console.warn("Message send failed, marking as failed", error);
      clearInterval(timer);
      delete streamingTimers.current[assistantMessage.id];
      setSessions((prev) =>
        prev.map((session) =>
          session.id === selectedSession.id
            ? {
                ...session,
                messages: session.messages.map((message) => {
                  if (message.id === userMessage.id) return { ...message, state: "failed" };
                  if (message.id === assistantMessage.id) return { ...message, state: "failed", content: "Failed to send" };
                  return message;
                }),
              }
            : session,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  async function regenerateReply(referenceMessageId?: string) {
    const session = selectedSession;
    if (!session) return;
    const lastUserMessage = [...session.messages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage) return;
    await sendMessage(lastUserMessage.content);
    setActiveMessageId(referenceMessageId ?? null);
  }

  function handleCopy(content: string) {
    if (typeof navigator === "undefined") return;
    navigator.clipboard?.writeText(content).catch(() => undefined);
  }

  function handleFeedback(messageId: string, value: "up" | "down") {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === selectedSessionId
          ? {
              ...session,
              messages: session.messages.map((message) =>
                message.id === messageId ? { ...message, content: `${message.content}\n\nFeedback: ${value}` } : message,
              ),
            }
          : session,
      ),
    );
    void apiRequest(`/chat/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }).catch((error) => {
      console.warn("Feedback failed", error);
      notifyError("Feedback failed", "We couldn't save your rating to the API.");
    });
  }

  function handleExport(format: SessionExportFormat) {
    if (!selectedSession) {
      notifyError("No conversation selected", "Choose a chat before exporting it.");
      return;
    }
    saveExport(selectedSession, format);
  }

  function handleToolCall(type: ToolCallKind) {
    if (!selectedSession) return;
    setPendingToolType(type);
    const id = uuid();
    const toolCall: ToolCall = {
      id,
      type,
      request:
        type === "knowledge"
          ? "Search knowledge base for related runbooks"
          : type === "file"
            ? "Look up files linked to this conversation"
            : "Queue a follow-up task",
      status: "running",
    };

    const message: ChatMessage = {
      id: uuid(),
      role: "tool",
      content: `${type} tool call in progress`,
      createdAt: new Date().toISOString(),
      state: "streaming",
      toolCalls: [toolCall],
    };

    setSessions((prev) =>
      prev.map((session) =>
        session.id === selectedSession.id
          ? { ...session, messages: [...session.messages, message], updatedAt: new Date().toISOString() }
          : session,
      ),
    );

    setTimeout(() => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === selectedSession.id
            ? {
                ...session,
                messages: session.messages.map((item) =>
                  item.id === message.id
                    ? {
                        ...item,
                        content: `${type} tool call complete`,
                        state: "idle",
                        toolCalls: item.toolCalls?.map((call) => ({
                          ...call,
                          status: "complete",
                          response:
                            call.type === "knowledge"
                              ? "Found 3 relevant articles and summaries"
                              : call.type === "file"
                                ? "Fetched 2 log files from the workspace bucket"
                                : "Created Jira task and linked to conversation",
                        })),
                      }
                    : item,
                ),
              }
            : session,
        ),
      );
      setPendingToolType(null);
    }, 1600);
  }

  const activeMetadataMessage = useMemo(() => {
    if (!selectedSession) return null;
    if (activeMessageId) {
      return selectedSession.messages.find((message) => message.id === activeMessageId) ?? null;
    }
    return [...selectedSession.messages].reverse().find((message) => message.role !== "user") ?? null;
  }, [activeMessageId, selectedSession]);

  return (
    <main className="flex min-h-screen bg-gray-50 text-gray-900 dark:bg-black dark:text-gray-100">
      <aside className="flex w-72 flex-col gap-6 border-r border-gray-200 bg-white px-4 py-6 shadow-sm dark:border-gray-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Workspace</p>
            <p className="text-lg font-semibold">Customer Support AI</p>
          </div>
          <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-semibold uppercase text-green-800 dark:bg-green-900/40 dark:text-green-200">
            Beta
          </span>
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Modes</p>
          <div className="space-y-2 text-sm">
            {["Assist", "Search", "Tools"].map((mode) => (
              <div
                key={mode}
                className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                  selectedSession?.mode === mode
                    ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400/70 dark:bg-blue-900/20 dark:text-blue-100"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <span>{mode}</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-500">Live</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              aria-label="Search conversations"
              value={conversationSearch}
              onChange={(event) => {
                setConversationSearch(event.target.value);
                void loadSessions(event.target.value);
              }}
              placeholder="Search conversations"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-800 dark:bg-zinc-950"
            />
            <Button aria-label="Create conversation" onClick={createSession}>
              New
            </Button>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-zinc-950 dark:text-gray-400">
            API: <span className="font-mono">{env.NEXT_PUBLIC_API_URL}</span>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
            <span>History</span>
            {loadingSessions && <span className="text-blue-500">Refreshing…</span>}
          </div>
          <div className="space-y-2">
            {sessions.map((session) => (
              <ConversationRow
                key={session.id}
                session={session}
                selected={selectedSessionId === session.id}
                onSelect={() => setSelectedSessionId(session.id)}
                onRename={(title) => void renameSession(session.id, title)}
              />
            ))}
            {!sessions.length && (
              <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700">
                No conversations found. Start a new chat to see it here.
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm dark:border-gray-800 dark:bg-zinc-950">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-gray-500">Active conversation</p>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{selectedSession?.title ?? "Untitled chat"}</h1>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {selectedSession?.mode ?? "Assist"}
              </span>
              <span className="text-xs text-gray-500">Updated {selectedSession ? formatDate(selectedSession.updatedAt) : "just now"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" aria-label="Export markdown" onClick={() => handleExport("md")}>
              Export .md
            </Button>
            <Button variant="secondary" aria-label="Export text" onClick={() => handleExport("txt")}>
              Export .txt
            </Button>
            <Link
              href="/usage"
              className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 hover:border-blue-300 hover:text-blue-700 dark:border-gray-800 dark:text-gray-100"
            >
              Model costs
            </Link>
            <Button aria-label="Start knowledge search" onClick={() => handleToolCall("knowledge")}>Knowledge search</Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-4">
              {selectedSession?.messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  active={activeMessageId === message.id}
                  onSelect={() => setActiveMessageId(message.id)}
                  onRegenerate={() => regenerateReply(message.id)}
                  onCopy={() => handleCopy(message.content)}
                  onFeedback={(value) => handleFeedback(message.id, value)}
                />
              ))}
              {!selectedSession?.messages.length && (
                <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-gray-600 dark:border-gray-800 dark:bg-zinc-900 dark:text-gray-400">
                  Start the conversation by sending a prompt or launching a tool call.
                </div>
              )}
            </div>
          </div>

          <aside className="w-80 border-l border-gray-200 bg-white px-4 py-5 dark:border-gray-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
              <span>Context</span>
              {pendingToolType && <span className="text-blue-500">{pendingToolType}…</span>}
            </div>
            <div className="space-y-4 pt-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Citations</p>
                  <Button variant="secondary" aria-label="Knowledge lookup" onClick={() => handleToolCall("knowledge")}>
                    Lookup
                  </Button>
                </div>
                <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-zinc-900">
                  {activeMetadataMessage?.citations?.length ? (
                    activeMetadataMessage.citations.map((citation) => (
                      <div key={citation} className="flex items-center justify-between">
                        <span>{citation}</span>
                        <span className="text-[10px] uppercase text-gray-500">Verified</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No citations linked yet.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Attachments</p>
                  <Button variant="secondary" aria-label="File lookup" onClick={() => handleToolCall("file")}>
                    Fetch files
                  </Button>
                </div>
                <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-zinc-900">
                  {activeMetadataMessage?.attachments?.length ? (
                    activeMetadataMessage.attachments.map((attachment) => (
                      <div key={attachment.name} className="flex items-center justify-between">
                        <span>{attachment.name}</span>
                        <span className="text-[10px] uppercase text-gray-500">{attachment.type}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No attachments for this turn.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Tasks & tools</p>
                  <Button variant="secondary" aria-label="Run task" onClick={() => handleToolCall("task")}>
                    Queue task
                  </Button>
                </div>
                <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-zinc-900">
                  {activeMetadataMessage?.toolCalls?.length ? (
                    activeMetadataMessage.toolCalls.map((call) => (
                      <ToolCallCard key={call.id} call={call} />
                    ))
                  ) : (
                    <p className="text-gray-500">No tool calls executed.</p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-zinc-950">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Sending state: {sending ? "in flight" : "idle"}</span>
              {pendingToolType && <span className="text-blue-500">{pendingToolType} call running…</span>}
            </div>
            <div className="flex items-start gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder="Ask a question, search knowledge, or describe a task"
                className="min-h-[72px] flex-1 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-800 dark:bg-zinc-900"
              />
              <div className="flex flex-col gap-2">
                <Button aria-label="Send message" disabled={sending} onClick={() => void sendMessage(input)}>
                  Send
                </Button>
                <Button variant="secondary" aria-label="Tool search" onClick={() => handleToolCall("knowledge")}
                  >
                  Knowledge
                </Button>
                <Button variant="secondary" aria-label="File lookup" onClick={() => handleToolCall("file")}>
                  Files
                </Button>
              </div>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}

type ConversationRowProps = {
  session: ChatSession;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void; // eslint-disable-line no-unused-vars
};

function ConversationRow({ session, selected, onSelect, onRename }: ConversationRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.title);

  return (
    <div
      className={`group rounded-md border px-3 py-2 text-sm shadow-sm transition-colors ${
        selected
          ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400/70 dark:bg-blue-900/20 dark:text-blue-100"
          : "border-gray-200 bg-white hover:border-blue-300 dark:border-gray-800 dark:bg-zinc-900"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => {
              setEditing(false);
              onRename(value || session.title);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setEditing(false);
                onRename(value || session.title);
              }
            }}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-black dark:text-gray-100"
          />
        ) : (
          <p className="font-semibold">{session.title}</p>
        )}
        <button
          aria-label="Rename conversation"
          onClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
          className="hidden text-xs text-gray-500 hover:text-blue-500 group-hover:inline"
        >
          Rename
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
        <span>{session.mode}</span>
        <span>{formatDate(session.updatedAt)}</span>
      </div>
    </div>
  );
}

type ChatBubbleProps = {
  message: ChatMessage;
  active?: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onFeedback: (value: "up" | "down") => void; // eslint-disable-line no-unused-vars
};

function ChatBubble({ message, active, onSelect, onRegenerate, onCopy, onFeedback }: ChatBubbleProps) {
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";
  const statusColor =
    message.state === "streaming"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100"
      : message.state === "failed"
        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-100"
        : message.state === "sending"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-100"
          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";

  return (
    <div
      className={`flex gap-3 rounded-lg border border-transparent px-3 py-3 ${active ? "border-blue-500 bg-blue-50/60 dark:border-blue-400/70 dark:bg-blue-900/20" : ""}`}
      onClick={onSelect}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
          isAssistant
            ? "bg-blue-600 text-white"
            : isUser
              ? "bg-gray-900 text-white dark:bg-gray-700"
              : "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
        }`}
      >
        {isAssistant ? "AI" : isUser ? "You" : "Tool"}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{isAssistant ? "Assistant" : isUser ? "You" : "Tool"}</span>
          <span>{formatTime(message.createdAt)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor}`}>
            {message.state}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900 dark:text-gray-100">{message.content}</p>

        {message.toolCalls?.length ? (
          <div className="space-y-2 rounded-md border border-dashed border-gray-300 bg-white p-3 dark:border-gray-800 dark:bg-zinc-900">
            {message.toolCalls.map((call) => (
              <ToolCallCard key={call.id} call={call} />
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-gray-500">
          {isAssistant && (
            <>
              <button className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200" onClick={onRegenerate}>
                Regenerate
              </button>
              <button className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200" onClick={onCopy}>
                Copy
              </button>
            </>
          )}
          <button className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200" onClick={() => onFeedback("up")}>
            👍
          </button>
          <button className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200" onClick={() => onFeedback("down")}>
            👎
          </button>
        </div>
      </div>
    </div>
  );
}

type ToolCallCardProps = {
  call: ToolCall;
};

function ToolCallCard({ call }: ToolCallCardProps) {
  const statusPalette: Record<ToolCall["status"], string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-100",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100",
    complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-100",
  };

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-zinc-800">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-200">{call.type}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusPalette[call.status]}`}>
          {call.status}
        </span>
      </div>
      <p className="text-gray-700 dark:text-gray-200">Request: {call.request}</p>
      {call.response ? <p className="text-gray-700 dark:text-gray-200">Response: {call.response}</p> : <p className="text-gray-500">Waiting for response…</p>}
    </div>
  );
}
