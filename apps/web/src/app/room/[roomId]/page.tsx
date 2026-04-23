"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useRoomStore } from "@/stores/roomStore";
import { useChatStore } from "@/stores/chatStore";
import { connectToRoom, disconnectSocket, WS_EVENTS } from "@/lib/socket";
import { REACTIONS } from "@gts-meet/shared";
import { api } from "@/lib/api";
import type { Socket } from "socket.io-client";
import { LiveKitRoom, RoomAudioRenderer, ControlBar, GridLayout, ParticipantTile, useTracks } from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { RoomWhiteboard } from "./RoomWhiteboard";

function MyVideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "100%", width: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const { user, loadUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { currentRoom, livekitToken, wsTicket, participantRole, joinStatus, lobby, joinRoom, leaveRoom, clearRoomState } = useRoomStore();
  const { messages, addMessage, setMessages, clearMessages } = useChatStore();

  const [activeTab, setActiveTab] = useState<"chat" | "qna" | "polls" | "people">("chat");
  const [chatInput, setChatInput] = useState("");
  const [participants, setParticipants] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [activePoll, setActivePoll] = useState<any>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const [qnaInput, setQnaInput] = useState("");
  const [handRaised, setHandRaised] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [viewMode, setViewMode] = useState<"video" | "whiteboard">("video");
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [lobbyQueue, setLobbyQueue] = useState<any[]>([]);
  const [lobbyBusyId, setLobbyBusyId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const reactionIdRef = useRef(0);

  function attachRoomSocketListeners(socket: Socket) {
    socket.off(WS_EVENTS.CHAT_HISTORY);
    socket.on(WS_EVENTS.CHAT_HISTORY, (history: any[]) => {
      setMessages(
        history.map((m: any) => ({
          id: m.id,
          roomId: m.roomId,
          userId: m.userId || m.user?.id,
          userName: m.user?.name || "Unknown",
          content: m.content,
          sentAt: m.sentAt,
        }))
      );
    });

    socket.off(WS_EVENTS.CHAT_MESSAGE);
    socket.on(WS_EVENTS.CHAT_MESSAGE, (msg: any) => {
      addMessage(msg);
    });

    socket.off(WS_EVENTS.PRESENCE_LIST);
    socket.on(WS_EVENTS.PRESENCE_LIST, (list: any[]) => {
      setParticipants(list);
    });

    socket.off(WS_EVENTS.PRESENCE_JOIN);
    socket.on(WS_EVENTS.PRESENCE_JOIN, (data: any) => {
      setParticipants((prev) => {
        if (prev.find((p) => p.userId === data.userId)) return prev;
        return [...prev, data];
      });
    });

    socket.off(WS_EVENTS.PRESENCE_LEAVE);
    socket.on(WS_EVENTS.PRESENCE_LEAVE, (data: any) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
    });

    socket.off(WS_EVENTS.REACTION_BROADCAST);
    socket.on(WS_EVENTS.REACTION_BROADCAST, (data: any) => {
      const id = reactionIdRef.current++;
      const x = 20 + Math.random() * 60;
      setFloatingReactions((prev) => [...prev, { id, emoji: data.emoji, x }]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2000);
    });

    socket.off(WS_EVENTS.HAND_UPDATE);
    socket.on(WS_EVENTS.HAND_UPDATE, (data: any) => {
      setParticipants((prev) =>
        prev.map((p) => (p.userId === data.userId ? { ...p, isHandRaised: data.isRaised } : p))
      );
    });

    socket.off(WS_EVENTS.QNA_NEW);
    socket.on(WS_EVENTS.QNA_NEW, (q: any) => {
      setQuestions((prev) => {
        if (prev.some((existing) => existing.id === q.id)) return prev;
        return [...prev, q];
      });
    });

    socket.off(WS_EVENTS.QNA_UPDATED);
    socket.on(WS_EVENTS.QNA_UPDATED, (q: any) => {
      setQuestions((prev) => prev.map((existing) => (existing.id === q.id ? q : existing)));
    });

    socket.off(WS_EVENTS.POLL_STARTED);
    socket.on(WS_EVENTS.POLL_STARTED, (poll: any) => {
      setActivePoll(poll);
      setActiveTab("polls");
    });

    socket.off(WS_EVENTS.POLL_RESULTS);
    socket.on(WS_EVENTS.POLL_RESULTS, (data: any) => {
      setActivePoll((prev: any) =>
        prev && prev.id === data.pollId
          ? { ...prev, options: data.options, totalVotes: data.totalVotes }
          : prev
      );
    });

    socket.off(WS_EVENTS.POLL_ENDED);
    socket.on(WS_EVENTS.POLL_ENDED, (data: any) => {
      setActivePoll((prev: any) =>
        prev && prev.id === data.pollId ? { ...prev, status: "CLOSED", options: data.options, totalVotes: data.totalVotes } : prev
      );
    });

    socket.off(WS_EVENTS.LOBBY_QUEUE);
    socket.on(WS_EVENTS.LOBBY_QUEUE, (payload: any) => {
      setLobbyQueue(payload?.pending || []);
    });
  }

  // Auth check
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  // Join room
  useEffect(() => {
    if (!isAuthenticated || !roomId) return;

    const doJoin = async () => {
      try {
        const result = await joinRoom(roomId);

        if (result.status === "LOBBY" && result.wsTicket) {
          const lobbySocket = connectToRoom(result.wsTicket, roomId);
          socketRef.current = lobbySocket;

          lobbySocket.off(WS_EVENTS.LOBBY_ADMITTED);
          lobbySocket.on(WS_EVENTS.LOBBY_ADMITTED, async () => {
            const admittedJoin = await joinRoom(roomId);
            if (admittedJoin.status !== "LOBBY" && admittedJoin.wsTicket) {
              const roomSocket = connectToRoom(admittedJoin.wsTicket, roomId);
              socketRef.current = roomSocket;
              attachRoomSocketListeners(roomSocket);
            }
          });

          lobbySocket.off(WS_EVENTS.LOBBY_REJECTED);
          lobbySocket.on(WS_EVENTS.LOBBY_REJECTED, () => {
            setJoinError("Your lobby request was rejected by the host");
          });

          return;
        }

        // Connect WebSocket
        const socket = connectToRoom(result.wsTicket, roomId);
        socketRef.current = socket;
        attachRoomSocketListeners(socket);
      } catch (err: any) {
        setJoinError(err.message || "Failed to join room");
      }
    };

    doJoin();

    return () => {
      disconnectSocket();
      clearMessages();
      clearRoomState();
    };
  }, [isAuthenticated, roomId, joinRoom, setMessages, addMessage, clearMessages, clearRoomState]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTyping) return;

      if (event.key.toLowerCase() === "f") {
        setIsFocusMode((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isLobbyMode = joinStatus === "LOBBY";
  const isModerator = participantRole === "INSTRUCTOR" || participantRole === "TEACHING_ASSISTANT";

  const fetchLobbyQueue = async () => {
    if (!isModerator || !currentRoom?.features?.waitingRoom) return;
    try {
      const payload = await api.getLobbyQueue(roomId);
      setLobbyQueue(payload.pending || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isModerator || !currentRoom?.features?.waitingRoom || isLobbyMode) {
      setLobbyQueue([]);
      return;
    }

    fetchLobbyQueue();
    const interval = window.setInterval(fetchLobbyQueue, 5000);
    return () => window.clearInterval(interval);
  }, [isModerator, currentRoom?.features?.waitingRoom, isLobbyMode, roomId]);

  const handleAdmit = async (requestId: string) => {
    setLobbyBusyId(requestId);
    try {
      if (socketRef.current) {
        socketRef.current.emit(WS_EVENTS.ROOM_ADMIT, { requestId });
      } else {
        await api.admitLobbyRequest(roomId, requestId);
        await fetchLobbyQueue();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLobbyBusyId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setLobbyBusyId(requestId);
    try {
      if (socketRef.current) {
        socketRef.current.emit(WS_EVENTS.LOBBY_REJECT, { requestId });
      } else {
        await api.rejectLobbyRequest(roomId, requestId);
        await fetchLobbyQueue();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLobbyBusyId(null);
    }
  };

  const handleRefreshLobby = async () => {
    try {
      const result = await joinRoom(roomId);
      if (result.status !== "LOBBY" && result.wsTicket) {
        const socket = connectToRoom(result.wsTicket, roomId);
        socketRef.current = socket;
        attachRoomSocketListeners(socket);
      }
    } catch (err: any) {
      setJoinError(err.message || "Failed to refresh lobby state");
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit(WS_EVENTS.CHAT_SEND, { content: chatInput.trim() });
    setChatInput("");
  };

  const handleReaction = (emoji: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit(WS_EVENTS.REACTION_SEND, { emoji });
    setShowReactions(false);
  };

  const handleHandRaise = () => {
    if (!socketRef.current) return;
    const newState = !handRaised;
    socketRef.current.emit(newState ? WS_EVENTS.HAND_RAISE : WS_EVENTS.HAND_LOWER);
    setHandRaised(newState);
  };

  const handleAskQuestion = () => {
    if (!qnaInput.trim() || !socketRef.current) return;
    socketRef.current.emit(WS_EVENTS.QNA_ASK, { content: qnaInput.trim() });
    setQnaInput("");
  };

  const handleUpvote = (questionId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit(WS_EVENTS.QNA_UPVOTE, { questionId });
  };

  const handleLeave = async () => {
    try {
      await leaveRoom(roomId);
    } catch { /* ignore */ }
    router.push("/dashboard");
  };

  const handleShareClass = async () => {
    if (!currentRoom) return;

    setSharing(true);
    try {
      const payload = await api.getRoomShareLink(currentRoom.id);
      const shareText = `Join class: ${payload.title}`;

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: payload.title,
          text: shareText,
          url: payload.inviteLink,
        });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(payload.inviteLink);
        setCopiedInvite(true);
        setTimeout(() => setCopiedInvite(false), 1800);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  if (joinError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
        <p style={{ color: "var(--color-error)", fontSize: 16 }}>{joinError}</p>
        <button className="btn-secondary" onClick={() => router.push("/dashboard")}>Back to Dashboard</button>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, margin: "0 auto 12px", border: "3px solid var(--color-border)", borderTopColor: "var(--color-primary)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Joining classroom...</p>
        </div>
      </div>
    );
  }

  if (isLobbyMode) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--gradient-dark)" }}>
        <div className="glass-panel" style={{ width: "min(560px, 100%)", padding: 28, borderRadius: 16 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Waiting for admission</h2>
          <p style={{ margin: "10px 0 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            You are in the lobby for <strong>{currentRoom.title}</strong>. An instructor or TA needs to admit you before you can join the live class.
          </p>

          <div style={{ display: "flex", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
            <div style={{ padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, background: "var(--color-bg-glass)", fontSize: 13 }}>
              Request status: {lobby?.status || "PENDING"}
            </div>
            {typeof lobby?.queuePosition === "number" && (
              <div style={{ padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, background: "var(--color-bg-glass)", fontSize: 13 }}>
                Queue position: #{lobby.queuePosition}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button className="btn-primary" onClick={handleRefreshLobby}>Check Admission</button>
            <button className="btn-secondary" onClick={handleLeave}>Leave Lobby</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`room-layout ${isFocusMode ? "focus-mode" : ""}`}>
      {/* Floating Reactions */}
      {floatingReactions.map((r) => (
        <div key={r.id} className="reaction-float" style={{ left: `${r.x}%`, bottom: "100px" }}>
          {r.emoji}
        </div>
      ))}

      {/* Main Video Area */}
      <div className="room-main">
        {/* Top Bar */}
        <div className="room-topbar">
          <div className="topbar-left">
            <h2 className="room-name">{currentRoom.title}</h2>
            <span className="badge badge-live">● Live</span>
            {isFocusMode && <span className="focus-badge">Focus Mode</span>}
          </div>
          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className={`btn-secondary btn-sm ${isFocusMode ? "focus-toggle-active" : ""}`}
              onClick={() => setIsFocusMode((prev) => !prev)}
              title={isFocusMode ? "Exit Focus Mode (F)" : "Enter Focus Mode (F)"}
              aria-pressed={isFocusMode}
            >
              {isFocusMode ? "Exit Focus" : "Focus"}
            </button>
            <button className="btn-secondary btn-sm" onClick={handleShareClass} disabled={sharing}>
              {copiedInvite ? "Copied" : sharing ? "Sharing..." : "Share Link"}
            </button>
            <button 
              className="btn-secondary btn-sm" 
              onClick={() => setViewMode(v => v === "video" ? "whiteboard" : "video")}
            >
              {viewMode === "video" ? "✏️ Whiteboard" : "📹 Video"}
            </button>
            <span className="participant-count">
              👥 {participants.length}
            </span>
          </div>
        </div>

        {/* LiveKit Video Area */}
        {livekitToken ? (
          <LiveKitRoom
            video={true}
            audio={true}
            token={livekitToken}
            serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
            data-lk-theme="default"
            style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            onDisconnected={handleLeave}
          >
            <div className="video-area" style={{ flex: 1, overflow: "hidden", display: "flex" }}>
              <div style={{ display: viewMode === "video" ? "flex" : "none", flex: 1, width: "100%", height: "100%" }}>
                <MyVideoGrid />
              </div>
              {viewMode === "whiteboard" && (
                <div style={{ flex: 1, width: "100%", height: "100%" }}>
                  <RoomWhiteboard roomId={roomId} />
                </div>
              )}
            </div>

            {/* Bottom Controls */}
            <div className="room-controls">
              <div className="controls-center">
                <ControlBar
                  controls={{ chat: false, leave: false }}
                  style={{ background: "transparent", boxShadow: "none", padding: 0 }}
                />

                <div style={{ width: "1px", height: "24px", background: "var(--color-border)", margin: "0 8px" }} />

                <button
                  className={`btn-icon ${handRaised ? "active" : ""}`}
                  onClick={handleHandRaise}
                  title="Raise Hand"
                >
                  ✋
                </button>

                <div style={{ position: "relative" }}>
                  <button className="btn-icon" onClick={() => setShowReactions(!showReactions)} title="Reactions">
                    😊
                  </button>
                  {showReactions && (
                    <div className="reactions-popup animate-scaleIn">
                      {REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          className="reaction-btn"
                          onClick={() => handleReaction(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button className="btn-icon danger" onClick={handleLeave} title="Leave Room">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15.293 3.293 6.586 12l8.707 8.707 1.414-1.414L9.414 12l7.293-7.293-1.414-1.414z" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
            </div>
            <RoomAudioRenderer />
          </LiveKitRoom>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 40, height: 40, border: "3px solid var(--color-border)", borderTopColor: "var(--color-primary)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          </div>
        )}
      </div>

      {/* Sidebar */}
      {!isFocusMode && (
      <div className="room-sidebar glass-panel">
        {/* Sidebar Tabs */}
        <div className="sidebar-tabs">
          {(["chat", "qna", "polls", "people"] as const).map((tab) => (
            <button
              key={tab}
              className={`sidebar-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "chat" && "💬"}
              {tab === "qna" && "❓"}
              {tab === "polls" && "📊"}
              {tab === "people" && "👥"}
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="sidebar-content">
          {/* Chat Tab */}
          {activeTab === "chat" && (
            <div className="chat-panel">
              <div className="chat-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className="chat-msg animate-slideIn">
                    <div className="chat-msg-header">
                      <span className="chat-msg-name">{msg.userName}</span>
                      <span className="chat-msg-time">
                        {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="chat-msg-content">{msg.content}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-area">
                <input
                  className="input chat-input"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                />
                <button className="btn-primary btn-send" onClick={handleSendChat}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Q&A Tab */}
          {activeTab === "qna" && (
            <div className="qna-panel">
              <div className="qna-list">
                {questions
                  .sort((a, b) => b.upvoteCount - a.upvoteCount)
                  .map((q) => (
                    <div key={q.id} className={`qna-item ${q.isAnswered ? "answered" : ""}`}>
                      <button className="qna-upvote" onClick={() => handleUpvote(q.id)}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3L13 9H3L8 3Z" fill="currentColor" />
                        </svg>
                        <span>{q.upvoteCount}</span>
                      </button>
                      <div className="qna-content">
                        <p className="qna-question">{q.content}</p>
                        <span className="qna-asker">{q.askedBy?.name}</span>
                        {q.isAnswered && (
                          <div className="qna-answer">
                            <span className="answered-badge">✅ Answered</span>
                            {q.answerText && <p>{q.answerText}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                {questions.length === 0 && (
                  <div className="empty-tab">No questions yet</div>
                )}
              </div>
              <div className="chat-input-area">
                <input
                  className="input chat-input"
                  placeholder="Ask a question..."
                  value={qnaInput}
                  onChange={(e) => setQnaInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAskQuestion()}
                />
                <button className="btn-primary btn-send" onClick={handleAskQuestion}>
                  Ask
                </button>
              </div>
            </div>
          )}

          {/* Polls Tab */}
          {activeTab === "polls" && (
            <div className="polls-panel">
              {activePoll ? (
                <div className="poll-card">
                  <h4 className="poll-question">{activePoll.question}</h4>
                  <div className="poll-options">
                    {activePoll.options.map((opt: any) => {
                      const percentage = activePoll.totalVotes > 0
                        ? Math.round((opt.voteCount / activePoll.totalVotes) * 100)
                        : 0;

                      return (
                        <button
                          key={opt.id}
                          className="poll-option"
                          onClick={() => {
                            if (activePoll.status !== "CLOSED" && socketRef.current) {
                              socketRef.current.emit(WS_EVENTS.POLL_VOTE, {
                                pollId: activePoll.id,
                                optionId: opt.id,
                              });
                            }
                          }}
                          disabled={activePoll.status === "CLOSED"}
                        >
                          <div className="poll-option-bar" style={{ width: `${percentage}%` }} />
                          <span className="poll-option-text">{opt.text}</span>
                          <span className="poll-option-pct">{percentage}%</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="poll-meta">
                    {activePoll.totalVotes} vote{activePoll.totalVotes !== 1 ? "s" : ""}
                    {activePoll.status === "CLOSED" && " · Final results"}
                  </p>
                </div>
              ) : (
                <div className="empty-tab">No active polls</div>
              )}
            </div>
          )}

          {/* People Tab */}
          {activeTab === "people" && (
            <div className="people-panel">
              {isModerator && currentRoom?.features?.waitingRoom && (
                <div style={{ marginBottom: 14, border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, background: "var(--color-bg-glass)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Lobby Queue</strong>
                    <button className="btn-secondary btn-sm" onClick={fetchLobbyQueue}>Refresh</button>
                  </div>
                  {lobbyQueue.length === 0 ? (
                    <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 12 }}>No pending requests</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {lobbyQueue.map((request) => (
                        <div key={request.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{request.userName}</div>
                            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>#{request.position} in queue</div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => handleAdmit(request.id)}
                              disabled={lobbyBusyId === request.id}
                            >
                              Admit
                            </button>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => handleReject(request.id)}
                              disabled={lobbyBusyId === request.id}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {participants.map((p) => (
                <div key={p.userId} className="person-item">
                  <div className="person-avatar">
                    {p.userName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="person-info">
                    <span className="person-name">
                      {p.userName}
                      {p.userId === user?.id && " (You)"}
                    </span>
                    <span className="person-role">{p.role}</span>
                  </div>
                  {p.isHandRaised && <span className="hand-icon">✋</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      <style jsx>{`
        .room-layout {
          display: flex;
          height: 100vh;
          background: var(--color-bg-primary);
          overflow: hidden;
        }

        .room-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          position: relative;
        }

        .focus-badge {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 999px;
          color: #c4b5fd;
          background: rgba(124, 58, 237, 0.2);
          border: 1px solid rgba(124, 58, 237, 0.45);
        }

        .focus-toggle-active {
          border-color: rgba(124, 58, 237, 0.55) !important;
          color: #ddd6fe;
          background: rgba(124, 58, 237, 0.16);
        }

        .room-layout.focus-mode .room-topbar {
          background: rgba(10, 10, 18, 0.78);
          border-bottom-color: rgba(124, 58, 237, 0.3);
        }

        .room-layout.focus-mode .video-area {
          padding: 8px;
        }

        .room-layout.focus-mode .room-controls {
          border-top-color: rgba(124, 58, 237, 0.25);
          background: rgba(10, 10, 18, 0.78);
        }

        .room-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid var(--color-border);
          background: rgba(15, 15, 26, 0.9);
          backdrop-filter: blur(16px);
        }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .room-name {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .participant-count {
          font-size: 13px;
          color: var(--color-text-secondary);
        }

        .video-area {
          flex: 1;
          padding: 16px;
          overflow: auto;
        }

        .video-grid-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 12px;
          max-width: 100%;
          height: 100%;
        }

        .video-tile {
          position: relative;
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          aspect-ratio: 16 / 9;
          min-height: 180px;
        }

        .video-tile.featured {
          grid-column: span 2;
          grid-row: span 2;
        }

        .video-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 8px;
        }

        .avatar-large {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 700;
          color: white;
          background: var(--gradient-primary);
          border-radius: var(--radius-full);
        }

        .cam-off-label {
          font-size: 12px;
          color: var(--color-text-muted);
        }

        .participant-name {
          position: absolute;
          bottom: 8px;
          left: 8px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 500;
          color: white;
          background: rgba(0, 0, 0, 0.6);
          border-radius: var(--radius-sm);
          backdrop-filter: blur(8px);
        }

        .room-controls {
          padding: 16px;
          border-top: 1px solid var(--color-border);
          background: rgba(15, 15, 26, 0.9);
          backdrop-filter: blur(16px);
        }

        .controls-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .reactions-popup {
          position: absolute;
          bottom: 50px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 4px;
          padding: 8px;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          z-index: 10;
        }

        .reaction-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .reaction-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: scale(1.2);
        }

        /* Sidebar */
        .room-sidebar {
          width: 360px;
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--color-border);
          border-radius: 0;
        }

        .sidebar-tabs {
          display: flex;
          border-bottom: 1px solid var(--color-border);
          padding: 0 8px;
        }

        .sidebar-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 12px 8px;
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-muted);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .sidebar-tab:hover {
          color: var(--color-text-secondary);
        }

        .sidebar-tab.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
        }

        .sidebar-tab span {
          display: none;
        }

        @media (min-width: 1200px) {
          .sidebar-tab span {
            display: inline;
          }
        }

        .sidebar-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* Chat */
        .chat-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
        }

        .chat-msg {
          margin-bottom: 12px;
        }

        .chat-msg-header {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 2px;
        }

        .chat-msg-name {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-primary-hover);
        }

        .chat-msg-time {
          font-size: 10px;
          color: var(--color-text-muted);
        }

        .chat-msg-content {
          font-size: 13px;
          color: var(--color-text-primary);
          margin: 0;
          line-height: 1.5;
          word-break: break-word;
        }

        .chat-input-area {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid var(--color-border);
        }

        .chat-input {
          flex: 1;
          padding: 10px 14px;
          font-size: 13px;
        }

        .btn-send {
          padding: 10px 16px;
          font-size: 13px;
        }

        /* Q&A */
        .qna-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .qna-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
        }

        .qna-item {
          display: flex;
          gap: 12px;
          padding: 12px;
          margin-bottom: 8px;
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .qna-item.answered {
          border-color: rgba(16, 185, 129, 0.3);
          background: rgba(16, 185, 129, 0.05);
        }

        .qna-upvote {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 4px;
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: color 0.2s ease;
        }

        .qna-upvote:hover {
          color: var(--color-primary);
        }

        .qna-content {
          flex: 1;
          min-width: 0;
        }

        .qna-question {
          font-size: 13px;
          margin: 0 0 4px;
          line-height: 1.4;
        }

        .qna-asker {
          font-size: 11px;
          color: var(--color-text-muted);
        }

        .qna-answer {
          margin-top: 8px;
          padding: 8px;
          background: rgba(16, 185, 129, 0.1);
          border-radius: var(--radius-sm);
          font-size: 12px;
        }

        .answered-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--color-success);
        }

        /* Polls */
        .polls-panel {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
        }

        .poll-card {
          padding: 20px;
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .poll-question {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 16px;
        }

        .poll-options {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .poll-option {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          overflow: hidden;
          color: var(--color-text-primary);
          font-size: 13px;
          text-align: left;
          transition: border-color 0.2s ease;
        }

        .poll-option:hover:not(:disabled) {
          border-color: var(--color-primary);
        }

        .poll-option-bar {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          background: rgba(99, 102, 241, 0.15);
          transition: width 0.5s ease;
        }

        .poll-option-text {
          position: relative;
          z-index: 1;
        }

        .poll-option-pct {
          position: relative;
          z-index: 1;
          font-weight: 600;
          color: var(--color-primary);
        }

        .poll-meta {
          margin: 12px 0 0;
          font-size: 12px;
          color: var(--color-text-muted);
        }

        /* People */
        .people-panel {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
        }

        .person-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--color-border);
        }

        .person-avatar {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: white;
          background: var(--gradient-primary);
          border-radius: var(--radius-full);
          flex-shrink: 0;
        }

        .person-info {
          flex: 1;
          min-width: 0;
        }

        .person-name {
          display: block;
          font-size: 13px;
          font-weight: 500;
        }

        .person-role {
          font-size: 11px;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .hand-icon {
          font-size: 16px;
        }

        .empty-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--color-text-muted);
          font-size: 14px;
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        @media (max-width: 768px) {
          .room-layout {
            flex-direction: column;
          }
          .room-sidebar {
            width: 100%;
            height: 40vh;
            border-left: none;
            border-top: 1px solid var(--color-border);
          }
          .room-topbar {
            padding: 8px 12px;
          }
          .controls-center {
            flex-wrap: wrap;
          }
          .room-layout.focus-mode .topbar-left .room-name {
            font-size: 14px;
            max-width: 50vw;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .room-layout.focus-mode .participant-count {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
