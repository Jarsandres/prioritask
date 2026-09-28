import { useState, useEffect, useCallback } from "react";
import api from "../api";
import type { RoomRole, RoomMember, Room } from "../types/task";
import ConfirmModal from "./ConfirmModal";

export interface RoomMembersModalProps {
  roomId: string;
  roomName: string;
  isOwner: boolean;
  myRole: RoomRole | null;
  isOpen: boolean;
  onClose: () => void;
  onMembersChanged?: () => void;
  ownerId?: string;
  ownerEmail?: string;
}

interface CurrentUser {
  id: string;
  nombre: string;
  email: string;
}

const RoomMembersModal = ({
  roomId,
  roomName,
  isOwner,
  myRole,
  isOpen,
  onClose,
  onMembersChanged,
  ownerId,
  ownerEmail,
}: RoomMembersModalProps) => {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Datos del usuario actual y propietario
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [roomOwner, setRoomOwner] = useState<{ id?: string; email?: string } | null>(
    ownerId || ownerEmail ? { id: ownerId, email: ownerEmail } : null
  );

  // Formulario de agregar miembro
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<RoomRole>("MEMBER");
  const [isAdding, setIsAdding] = useState(false);

  // Estados de mutación
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<RoomMember | null>(null);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const canManage = isOwner || myRole === "ADMIN";

  const fetchMembersAndContext = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const [membersRes, meRes, roomsRes] = await Promise.all([
        api.get<RoomMember[]>(`/rooms/${roomId}/members`),
        api.get<CurrentUser>("/auth/me").catch(() => null),
        api.get<Room[]>("/rooms").catch(() => null),
      ]);

      setMembers(membersRes.data);

      if (meRes?.data) {
        setCurrentUser(meRes.data);
      }

      if (roomsRes?.data) {
        const foundRoom = roomsRes.data.find((r) => r.id === roomId);
        if (foundRoom) {
          setRoomOwner({
            id: foundRoom.owner_id,
            email: foundRoom.owner,
          });
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError("No se pudieron cargar los convivientes del hogar.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(null);
      setShowAddForm(false);
      setNewUserId("");
      setNewRole("MEMBER");
      fetchMembersAndContext();
    }
  }, [isOpen, fetchMembersAndContext]);

  if (!isOpen) return null;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUserId = newUserId.trim();
    if (!cleanUserId) {
      setError("Debes ingresar un ID de usuario válido.");
      return;
    }

    setIsAdding(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post(`/rooms/${roomId}/members`, {
        user_id: cleanUserId,
        role: newRole,
      });
      setSuccess("Conviviente añadido correctamente.");
      setNewUserId("");
      setNewRole("MEMBER");
      setShowAddForm(false);
      await fetchMembersAndContext();
      onMembersChanged?.();
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al agregar el conviviente al hogar.");
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleRole = async (member: RoomMember) => {
    const nextRole: RoomRole = member.role === "ADMIN" ? "MEMBER" : "ADMIN";
    setUpdatingUserId(member.user_id);
    setError(null);
    setSuccess(null);

    try {
      await api.patch(`/rooms/${roomId}/members/${member.user_id}`, {
        role: nextRole,
      });
      setSuccess(
        `Rol actualizado a ${nextRole === "ADMIN" ? "Administrador" : "Conviviente"}.`
      );
      await fetchMembersAndContext();
      onMembersChanged?.();
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("No se pudo actualizar el rol del miembro.");
      }
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.delete(`/rooms/${roomId}/members/${memberToRemove.user_id}`);
      setSuccess("Miembro expulsado del hogar.");
      setMemberToRemove(null);
      await fetchMembersAndContext();
      onMembersChanged?.();
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("No se pudo expulsar al miembro del hogar.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmLeaveRoom = async () => {
    if (!currentUser?.id) return;
    setActionLoading(true);
    setError(null);

    try {
      await api.delete(`/rooms/${roomId}/members/${currentUser.id}`);
      setIsLeavingRoom(false);
      onMembersChanged?.();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("No se pudo abandonar el hogar.");
      }
      setIsLeavingRoom(false);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? dateStr
        : d.toLocaleDateString("es-ES", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
    } catch {
      return dateStr;
    }
  };

  const effectiveOwnerId = roomOwner?.id;
  const isTargetOwner = (userId: string) => effectiveOwnerId === userId;

  return (
    <>
      <div
        className="modal show d-block"
        tabIndex={-1}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(2px)",
          zIndex: 1050,
        }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div
            className="retro-window w-100"
            style={{ border: "2.5px solid var(--window-border)" }}
          >
            {/* Header Retro */}
            <div className="retro-window-header">
              <div className="d-flex align-items-center gap-2 text-truncate pe-2">
                <span>👥</span>
                <span className="text-uppercase fw-bold text-truncate">
                  CONVIVIENTES / ROOM_MEMBERS.SYS [{roomName.toUpperCase()}]
                </span>
              </div>
              <button
                type="button"
                className="retro-window-btn"
                onClick={onClose}
                aria-label="Cerrar modal"
                style={{ cursor: "pointer", background: "rgba(255,255,255,0.2)" }}
              >
                ✕
              </button>
            </div>

            <div className="retro-window-body p-3 p-md-4">
              {/* Feedback retro */}
              {error && (
                <div className="alert alert-danger alert-dismissible fade show mb-3" role="alert">
                  <strong>⚠️ ERROR: </strong> {error}
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setError(null)}
                  ></button>
                </div>
              )}

              {success && (
                <div className="alert alert-success alert-dismissible fade show mb-3" role="alert">
                  <strong>✅ SISTEMA: </strong> {success}
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setSuccess(null)}
                  ></button>
                </div>
              )}

              {/* Botón y formulario para agregar miembro */}
              {canManage && (
                <div className="mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-bold small text-muted text-uppercase">
                      Administración de convivientes
                    </span>
                    <button
                      type="button"
                      className="btn-retro btn-retro-primary py-1 px-3"
                      style={{ minHeight: "36px" }}
                      onClick={() => setShowAddForm((prev) => !prev)}
                    >
                      <span>{showAddForm ? "▲ Ocultar" : "➕ Agregar Conviviente"}</span>
                    </button>
                  </div>

                  {showAddForm && (
                    <div
                      className="p-3 mb-3"
                      style={{
                        background: "var(--compare-box-bg, #f8fafc)",
                        border: "2px dashed var(--window-border)",
                        borderRadius: "8px",
                      }}
                    >
                      <h6 className="fw-bold mb-2">Añadir Nuevo Conviviente</h6>
                      <form onSubmit={handleAddMember}>
                        <div className="row g-2 align-items-end">
                          <div className="col-12 col-md-7">
                            <label
                              htmlFor="member-uuid-input"
                              className="form-label small fw-bold text-muted mb-1"
                            >
                              UUID de Usuario *
                            </label>
                            <input
                              id="member-uuid-input"
                              type="text"
                              className="form-control retro-input"
                              placeholder="Ej. e7b54d31-419b-430c-8367-bf1b570cbcf1"
                              value={newUserId}
                              onChange={(e) => setNewUserId(e.target.value)}
                              disabled={isAdding}
                              required
                            />
                          </div>

                          <div className="col-12 col-md-3">
                            <label
                              htmlFor="member-role-select"
                              className="form-label small fw-bold text-muted mb-1"
                            >
                              Rol Inicial
                            </label>
                            <select
                              id="member-role-select"
                              className="form-select retro-select"
                              value={newRole}
                              onChange={(e) =>
                                setNewRole(e.target.value as RoomRole)
                              }
                              disabled={isAdding}
                            >
                              <option value="MEMBER">👤 Conviviente</option>
                              <option value="ADMIN">🛡️ Administrador</option>
                            </select>
                          </div>

                          <div className="col-12 col-md-2">
                            <button
                              type="submit"
                              className="btn-retro btn-retro-success w-100 py-2 d-flex align-items-center justify-content-center gap-1"
                              style={{ minHeight: "42px" }}
                              disabled={isAdding}
                            >
                              <span>{isAdding ? "⏳" : "➕"}</span>
                              <span>{isAdding ? "..." : "Añadir"}</span>
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de Miembros */}
              <div className="mb-4">
                <h6 className="fw-bold small text-muted text-uppercase mb-3">
                  Lista de Miembros Registrados ({members.length + (effectiveOwnerId ? 1 : 0)})
                </h6>

                {loading ? (
                  <div className="text-center py-4 text-muted">
                    <span>⏳ Cargando convivientes...</span>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {/* Tarjeta destacada del Propietario si se conoce */}
                    {effectiveOwnerId && (
                      <div
                        className="p-3 d-flex align-items-center justify-content-between flex-wrap gap-2"
                        style={{
                          background: "var(--card-bg, #ffffff)",
                          border: "2px solid var(--window-border)",
                          borderRadius: "8px",
                          boxShadow: "2px 2px 0px var(--window-shadow)",
                        }}
                      >
                        <div className="d-flex align-items-center gap-3">
                          <span style={{ fontSize: "1.8rem" }}>👑</span>
                          <div>
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <span className="fw-bold">
                                {isOwner
                                  ? `${currentUser?.nombre || "Tú"} (Propietario)`
                                  : roomOwner?.email || "Propietario del Hogar"}
                              </span>
                              <span className="retro-badge retro-badge-high">
                                👑 Propietario
                              </span>
                            </div>
                            <div className="small text-muted font-monospace">
                              {roomOwner?.email || effectiveOwnerId}
                            </div>
                          </div>
                        </div>
                        <span className="badge-retro text-muted">Hogar Creador</span>
                      </div>
                    )}

                    {/* Miembros / Convivientes adicionales */}
                    {members
                      .filter((m) => m.user_id !== effectiveOwnerId)
                      .map((member) => {
                        const isSelf = currentUser?.id === member.user_id;
                        const isMemberAdmin = member.role === "ADMIN";

                        return (
                          <div
                            key={member.user_id}
                            className="p-3 d-flex align-items-center justify-content-between flex-wrap gap-2"
                            style={{
                              background: "var(--card-bg, #ffffff)",
                              border: "2px solid var(--window-border)",
                              borderRadius: "8px",
                              boxShadow: "2px 2px 0px var(--window-shadow)",
                            }}
                          >
                            <div className="d-flex align-items-center gap-3">
                              <span style={{ fontSize: "1.8rem" }}>
                                {isMemberAdmin ? "🛡️" : "👤"}
                              </span>
                              <div>
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  <span className="fw-bold">
                                    {member.user_nombre ||
                                      member.user_email ||
                                      `Usuario (${member.user_id.slice(0, 8)}...)`}
                                    {isSelf && " (Tú)"}
                                  </span>

                                  {isTargetOwner(member.user_id) ? (
                                    <span className="retro-badge retro-badge-high">
                                      👑 Propietario
                                    </span>
                                  ) : isMemberAdmin ? (
                                    <span className="retro-badge retro-badge-medium">
                                      🛡️ Administrador
                                    </span>
                                  ) : (
                                    <span className="retro-badge retro-badge-todo">
                                      👤 Conviviente
                                    </span>
                                  )}
                                </div>

                                <div className="small text-muted">
                                  {member.user_email && (
                                    <span className="me-2">{member.user_email}</span>
                                  )}
                                  <span>• Se unió: {formatDate(member.joined_at)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Acciones de administración de miembro */}
                            {canManage && !isTargetOwner(member.user_id) && (
                              <div className="d-flex gap-2 align-items-center">
                                <button
                                  type="button"
                                  className="btn-retro btn-retro-outline py-1 px-2 small"
                                  style={{ minHeight: "36px" }}
                                  onClick={() => handleToggleRole(member)}
                                  disabled={updatingUserId === member.user_id}
                                  title={`Cambiar rol a ${isMemberAdmin ? "Conviviente" : "Administrador"}`}
                                >
                                  {updatingUserId === member.user_id
                                    ? "⏳..."
                                    : isMemberAdmin
                                    ? "Degradar a Conviviente"
                                    : "Promover a Admin"}
                                </button>

                                <button
                                  type="button"
                                  className="btn-retro btn-retro-danger py-1 px-2 small"
                                  style={{ minHeight: "36px" }}
                                  onClick={() => setMemberToRemove(member)}
                                  title="Expulsar conviviente"
                                >
                                  🗑️ Expulsar
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {members.filter((m) => m.user_id !== effectiveOwnerId).length === 0 &&
                      !loading && (
                        <div className="p-3 text-center text-muted border border-dashed rounded">
                          No hay otros convivientes registrados en este hogar.
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Pie con botón de Abandonar Hogar si corresponde */}
              <div className="d-flex justify-content-between align-items-center pt-3 border-top border-2 flex-wrap gap-2">
                {!isOwner && myRole && currentUser && (
                  <button
                    type="button"
                    className="btn-retro btn-retro-danger py-2 px-3"
                    style={{ minHeight: "40px" }}
                    onClick={() => setIsLeavingRoom(true)}
                  >
                    🚪 Abandonar Hogar
                  </button>
                )}

                <button
                  type="button"
                  className="btn-retro btn-retro-outline ms-auto py-2 px-4"
                  style={{ minHeight: "40px" }}
                  onClick={onClose}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de confirmación para expulsar miembro */}
      <ConfirmModal
        isOpen={Boolean(memberToRemove)}
        title="Expulsar conviviente"
        message={`¿Estás seguro de que deseas expulsar a ${
          memberToRemove?.user_nombre ||
          memberToRemove?.user_email ||
          "este miembro"
        } del hogar?`}
        confirmText="Expulsar"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      {/* Modal de confirmación para abandonar hogar */}
      <ConfirmModal
        isOpen={isLeavingRoom}
        title="Abandonar hogar"
        message={`¿Estás seguro de que deseas abandonar el hogar "${roomName}"? Perderás acceso inmediato a sus tareas compartidas.`}
        confirmText="Abandonar Hogar"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleConfirmLeaveRoom}
        onCancel={() => setIsLeavingRoom(false)}
      />
    </>
  );
};

export default RoomMembersModal;
