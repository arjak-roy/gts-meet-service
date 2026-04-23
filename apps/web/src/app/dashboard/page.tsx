"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useRoomStore } from "@/stores/roomStore";
import { ROOM_TIER_LIMITS } from "@gts-meet/shared";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, loadUser, logout } = useAuthStore();
  const { rooms, fetchRooms, createRoom, isLoading: roomsLoading } = useRoomStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("SMALL_CLASS");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [sharingRoomId, setSharingRoomId] = useState<string | null>(null);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRooms();
    }
  }, [isAuthenticated, fetchRooms]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;
    if (trimmedTitle.length < 3) {
      setCreateError("Room name must be at least 3 characters.");
      return;
    }

    setCreateError("");
    setCreating(true);
    try {
      const room = await createRoom({ title: trimmedTitle, type: newType });
      setShowCreate(false);
      setNewTitle("");
      setCreateError("");
      router.push(`/room/${room.id}`);
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create room");
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = (roomId: string) => {
    router.push(`/room/${roomId}`);
  };

  const handleShareRoom = async (room: any) => {
    setSharingRoomId(room.id);
    try {
      const payload = await api.getRoomShareLink(room.id);
      const shareText = `Join my class: ${payload.title}`;

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
        setCopiedRoomId(room.id);
        setTimeout(() => setCopiedRoomId((current) => (current === room.id ? null : current)), 1800);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSharingRoomId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "LIVE":
        return <span className="badge badge-live">● Live</span>;
      case "SCHEDULED":
        return <span className="badge badge-scheduled">Scheduled</span>;
      case "ENDED":
        return <span className="badge badge-ended">Ended</span>;
      default:
        return null;
    }
  };

  const getRoomTypeLabel = (type: string) => {
    const config = ROOM_TIER_LIMITS[type as keyof typeof ROOM_TIER_LIMITS];
    return config?.label || type;
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <p style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Ambient glow */}
      <div className="dashboard-glow" />

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="logo-mark">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#dLogo)" />
              <path d="M10 12L16 8L22 12V20L16 24L10 20V12Z" stroke="white" strokeWidth="2" fill="none" />
              <circle cx="16" cy="16" r="3" fill="white" />
              <defs>
                <linearGradient id="dLogo" x1="0" y1="0" x2="32" y2="32">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="header-title">GTS Meet</h1>
            <p className="header-sub">Online Classroom</p>
          </div>
        </div>
        <div className="header-right">
          <div className="user-badge">
            <div className="user-avatar">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role}</span>
            </div>
          </div>
          <button className="btn-secondary btn-sm" onClick={logout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Actions Bar */}
        <div className="actions-bar">
          <div>
            <h2 className="section-title">Your Classrooms</h2>
            <p className="section-sub">
              {rooms.length} room{rooms.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Room
          </button>
        </div>

        {/* Create Room Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal animate-scaleIn" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Create Classroom</h3>
              <form onSubmit={handleCreate} className="modal-form">
                <div className="form-group">
                  <label>Room Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Physics 101 — Lecture 5"
                    value={newTitle}
                    onChange={(e) => {
                      setNewTitle(e.target.value);
                      if (createError) setCreateError("");
                    }}
                    autoFocus
                    required
                  />
                  {createError && (
                    <p style={{ margin: "8px 0 0", color: "var(--color-error)", fontSize: 12 }}>
                      {createError}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label>Room Type</label>
                  <div className="type-grid">
                    {Object.entries(ROOM_TIER_LIMITS).map(([key, config]) => (
                      <button
                        key={key}
                        type="button"
                        className={`type-card ${newType === key ? "active" : ""}`}
                        onClick={() => setNewType(key)}
                      >
                        <span className="type-label">{config.label}</span>
                        <span className="type-info">
                          Up to {config.maxParticipants} people
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={creating}>
                    {creating ? "Creating..." : "Create & Join"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Room Grid */}
        {roomsLoading ? (
          <div className="empty-state">
            <p>Loading rooms...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📹</div>
            <h3>No classrooms yet</h3>
            <p>Create your first classroom to get started</p>
          </div>
        ) : (
          <div className="room-grid">
            {rooms.map((room: any, index: number) => (
              <div
                key={room.id}
                className="card card-glow room-card animate-fadeIn"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="room-card-header">
                  <div>
                    <h3 className="room-title">{room.title}</h3>
                    <p className="room-type">{getRoomTypeLabel(room.type)}</p>
                  </div>
                  {getStatusBadge(room.status)}
                </div>

                <div className="room-card-meta">
                  <div className="meta-item">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M14 14C14 11.7909 11.3137 10 8 10C4.68629 10 2 11.7909 2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span>{room._count?.participants || 0} / {room.maxParticipants}</span>
                  </div>
                  <div className="meta-item">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M5 7H11M5 9.5H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span>By {room.creator?.name}</span>
                  </div>
                </div>

                <div className="room-card-actions">
                  {room.status !== "ENDED" ? (
                    <>
                      <button className="btn-primary btn-sm" onClick={() => handleJoinRoom(room.id)}>
                        {room.status === "LIVE" ? "Join Now" : "Enter Room"}
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => handleShareRoom(room)} disabled={sharingRoomId === room.id}>
                        {copiedRoomId === room.id ? "Copied" : sharingRoomId === room.id ? "Sharing..." : "Share"}
                      </button>
                    </>
                  ) : (
                    <span className="ended-text">Session ended</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <style jsx>{`
        .dashboard {
          min-height: 100vh;
          background: var(--gradient-dark);
          position: relative;
        }

        .dashboard-glow {
          position: fixed;
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          width: 800px;
          height: 600px;
          background: radial-gradient(ellipse, rgba(99, 102, 241, 0.08) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }

        .dashboard-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 32px;
          background: rgba(15, 15, 26, 0.85);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--color-border);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-mark {
          display: flex;
        }

        .header-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          background: var(--gradient-primary);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-sub {
          font-size: 12px;
          color: var(--color-text-muted);
          margin: 0;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .user-badge {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
          color: white;
          background: var(--gradient-primary);
          border-radius: var(--radius-full);
        }

        .user-info {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .user-role {
          font-size: 11px;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .btn-sm {
          padding: 8px 16px;
          font-size: 13px;
        }

        .dashboard-main {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px;
        }

        .actions-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
        }

        .section-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 4px;
        }

        .section-sub {
          font-size: 13px;
          color: var(--color-text-muted);
          margin: 0;
        }

        .room-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }

        .room-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .room-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .room-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 4px;
        }

        .room-type {
          font-size: 12px;
          color: var(--color-text-muted);
          margin: 0;
        }

        .room-card-meta {
          display: flex;
          gap: 20px;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--color-text-secondary);
        }

        .room-card-actions {
          display: flex;
          justify-content: flex-end;
        }

        .ended-text {
          font-size: 13px;
          color: var(--color-text-muted);
        }

        .empty-state {
          text-align: center;
          padding: 80px 20px;
          color: var(--color-text-secondary);
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 8px;
          color: var(--color-text-primary);
        }

        .empty-state p {
          margin: 0;
          font-size: 14px;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }

        .modal {
          width: 100%;
          max-width: 520px;
          padding: 32px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-lg);
        }

        .modal-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0 0 24px;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 500;
          color: var(--color-text-secondary);
        }

        .type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .type-card {
          padding: 12px;
          text-align: left;
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--color-text-primary);
        }

        .type-card:hover {
          border-color: var(--color-border-hover);
        }

        .type-card.active {
          border-color: var(--color-primary);
          background: rgba(99, 102, 241, 0.1);
        }

        .type-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .type-info {
          font-size: 11px;
          color: var(--color-text-muted);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }
        @media (max-width: 768px) {
          .dashboard-header {
            padding: 16px;
          }
          .dashboard-main {
            padding: 16px;
          }
          .room-grid {
            grid-template-columns: 1fr;
          }
          .actions-bar {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          .type-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
