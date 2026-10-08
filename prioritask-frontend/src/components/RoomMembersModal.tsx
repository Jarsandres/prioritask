import { useState, useEffect, useCallback, useRef } from "react";
import {
  LuUsers,
  LuUserPlus,
  LuCrown,
  LuShield,
  LuUser,
  LuTrash2,
  LuLogOut,
  LuX,
  LuArrowUpDown,
  LuChevronUp,
} from "react-icons/lu";
import api from "../api";
import type { RoomRole, RoomMember, Room } from "../types/task";
import ConfirmModal from "./ConfirmModal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Badge from "./ui/Badge";
import { useToast } from "../context/ToastContext";
import useA11yModal from "../hooks/useA11yModal";

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

  const toast = useToast();
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

  const modalRef = useRef<HTMLDivElement>(null);
  useA11yModal({ isOpen, onClose, modalRef });

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
      toast.success("Conviviente añadido correctamente al hogar.");
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
      const roleText = nextRole === "ADMIN" ? "Administrador" : "Conviviente";
      toast.success(`Rol actualizado a ${roleText}.`);
      setSuccess(`Rol actualizado a ${roleText}.`);
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
      toast.info("Miembro expulsado del hogar.");
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
      toast.info(`Has abandonado el hogar "${roomName}".`);
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

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  };

  const effectiveOwnerId = roomOwner?.id;
  const isTargetOwner = (userId: string) => effectiveOwnerId === userId;

  return (
    <>
      <div
        className="modal show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-members-modal-title"
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          zIndex: 1050,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div
            ref={modalRef}
            className="modal-content rounded-4 border shadow-xl overflow-hidden retro-bottom-sheet"
            style={{
              backgroundColor: "var(--bg-surface, #ffffff)",
              borderColor: "var(--border-default, #e2e8f0)",
            }}
          >
            {/* Header Moderno */}
            <div
              className="d-flex align-items-center justify-content-between p-3 px-md-4 border-bottom"
              style={{ borderColor: "var(--border-default, #e2e8f0)" }}
            >
              <div className="d-flex align-items-center gap-2.5 text-truncate pe-2">
                <div
                  className="d-flex align-items-center justify-content-center rounded-3 p-2"
                  style={{
                    backgroundColor: "rgba(37, 99, 235, 0.1)",
                    color: "#2563eb",
                  }}
                >
                  <LuUsers size={20} />
                </div>
                <div>
                  <h2
                    id="room-members-modal-title"
                    className="h5 mb-0 fw-bold d-flex align-items-center gap-2 flex-wrap"
                    style={{
                      color: "var(--text-heading, #0f172a)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    <span>Convivientes del Hogar</span>
                    <Badge variant="primary">{roomName}</Badge>
                  </h2>
                  <div className="text-muted small">
                    Administra los integrantes y niveles de acceso a este espacio compartido
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-ghost p-1.5 rounded-circle text-muted d-flex align-items-center justify-content-center"
                style={{
                  width: "32px",
                  height: "32px",
                  border: "none",
                  backgroundColor: "transparent",
                }}
                onClick={onClose}
                aria-label="Cerrar modal"
              >
                <LuX size={18} />
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-3 p-md-4" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {/* Feedback en caso de error / éxito */}
              {error && (
                <div className="alert alert-danger alert-dismissible fade show mb-3 rounded-3 shadow-xs" role="alert">
                  <strong>Error: </strong> {error}
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setError(null)}
                  ></button>
                </div>
              )}

              {success && (
                <div className="alert alert-success alert-dismissible fade show mb-3 rounded-3 shadow-xs" role="alert">
                  {success}
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
                    <span className="fw-semibold small text-muted text-uppercase" style={{ letterSpacing: "0.04em" }}>
                      Gestión de Convivientes
                    </span>
                    <Button
                      variant={showAddForm ? "outline" : "primary"}
                      size="sm"
                      leftIcon={showAddForm ? <LuChevronUp size={15} /> : <LuUserPlus size={15} />}
                      onClick={() => setShowAddForm((prev) => !prev)}
                    >
                      {showAddForm ? "Ocultar Formulario" : "Añadir Conviviente"}
                    </Button>
                  </div>

                  {showAddForm && (
                    <div
                      className="p-3 mb-3 rounded-3"
                      style={{
                        backgroundColor: "var(--bg-subtle, #f8fafc)",
                        border: "1px dashed var(--border-default, #e2e8f0)",
                      }}
                    >
                      <h6 className="fw-bold mb-2.5 small" style={{ color: "var(--text-heading, #0f172a)" }}>
                        Invitar o Añadir Conviviente por UUID
                      </h6>
                      <form onSubmit={handleAddMember}>
                        <div className="row g-2 align-items-end">
                          <div className="col-12 col-md-7">
                            <Input
                              label="UUID del Usuario *"
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
                              className="form-label small fw-semibold text-muted mb-1.5"
                            >
                              Rol Inicial
                            </label>
                            <select
                              id="member-role-select"
                              className="form-select"
                              style={{
                                borderRadius: "var(--radius-md, 10px)",
                                borderColor: "var(--border-default, #cbd5e1)",
                                padding: "8px 12px",
                                fontSize: "0.9rem",
                              }}
                              value={newRole}
                              onChange={(e) => setNewRole(e.target.value as RoomRole)}
                              disabled={isAdding}
                            >
                              <option value="MEMBER">Conviviente</option>
                              <option value="ADMIN">Administrador</option>
                            </select>
                          </div>

                          <div className="col-12 col-md-2">
                            <Button
                              type="submit"
                              variant="primary"
                              size="md"
                              className="w-100"
                              isLoading={isAdding}
                            >
                              Añadir
                            </Button>
                          </div>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* Lista de Miembros */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="fw-semibold small text-muted text-uppercase" style={{ letterSpacing: "0.04em" }}>
                    Integrantes ({members.length + (effectiveOwnerId ? 1 : 0)})
                  </span>
                </div>

                {loading ? (
                  <div className="text-center py-4 text-muted small">
                    <span className="spin d-inline-block me-2">⏳</span> Cargando integrantes...
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {/* Tarjeta destacada del Propietario si se conoce */}
                    {effectiveOwnerId && (
                      <div
                        className="p-3 rounded-3 d-flex align-items-center justify-content-between flex-wrap gap-2"
                        style={{
                          backgroundColor: "var(--bg-surface, #ffffff)",
                          border: "1px solid var(--border-default, #e2e8f0)",
                          boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
                        }}
                      >
                        <div className="d-flex align-items-center gap-3">
                          <div
                            className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-white flex-shrink-0"
                            style={{
                              width: "40px",
                              height: "40px",
                              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                              fontSize: "0.95rem",
                            }}
                          >
                            <LuCrown size={18} />
                          </div>
                          <div>
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <span className="fw-bold" style={{ color: "var(--text-heading, #0f172a)" }}>
                                {isOwner
                                  ? `${currentUser?.nombre || "Tú"} (Propietario)`
                                  : roomOwner?.email || "Propietario del Hogar"}
                              </span>
                              <Badge variant="warning">
                                <LuCrown size={12} className="me-1" />
                                Propietario
                              </Badge>
                            </div>
                            <div className="small text-muted">
                              {roomOwner?.email || effectiveOwnerId}
                            </div>
                          </div>
                        </div>
                        <span className="badge rounded-pill fw-normal text-muted" style={{ backgroundColor: "var(--bg-subtle, #f1f5f9)" }}>
                          Creador del Hogar
                        </span>
                      </div>
                    )}

                    {/* Miembros / Convivientes adicionales */}
                    {members
                      .filter((m) => m.user_id !== effectiveOwnerId)
                      .map((member) => {
                        const isSelf = currentUser?.id === member.user_id;
                        const isMemberAdmin = member.role === "ADMIN";
                        const memberDisplayName =
                          member.user_nombre ||
                          member.user_email ||
                          `Usuario (${member.user_id.slice(0, 8)}...)`;

                        return (
                          <div
                            key={member.user_id}
                            className="p-3 rounded-3 d-flex align-items-center justify-content-between flex-wrap gap-2"
                            style={{
                              backgroundColor: "var(--bg-surface, #ffffff)",
                              border: "1px solid var(--border-default, #e2e8f0)",
                              boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))",
                            }}
                          >
                            <div className="d-flex align-items-center gap-3">
                              <div
                                className="d-flex align-items-center justify-content-center rounded-circle fw-bold flex-shrink-0"
                                style={{
                                  width: "40px",
                                  height: "40px",
                                  backgroundColor: isMemberAdmin
                                    ? "rgba(139, 92, 246, 0.12)"
                                    : "rgba(37, 99, 235, 0.1)",
                                  color: isMemberAdmin ? "#8b5cf6" : "#2563eb",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {isMemberAdmin ? <LuShield size={18} /> : getInitials(memberDisplayName)}
                              </div>
                              <div>
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  <span className="fw-bold" style={{ color: "var(--text-heading, #0f172a)" }}>
                                    {memberDisplayName}
                                    {isSelf && " (Tú)"}
                                  </span>

                                  {isTargetOwner(member.user_id) ? (
                                    <Badge variant="warning">
                                      <LuCrown size={12} className="me-1" />
                                      Propietario
                                    </Badge>
                                  ) : isMemberAdmin ? (
                                    <Badge variant="secondary">
                                      <LuShield size={12} className="me-1" />
                                      Administrador
                                    </Badge>
                                  ) : (
                                    <Badge variant="default">
                                      <LuUser size={12} className="me-1" />
                                      Conviviente
                                    </Badge>
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
                                <Button
                                  variant="outline"
                                  size="sm"
                                  leftIcon={<LuArrowUpDown size={14} />}
                                  onClick={() => handleToggleRole(member)}
                                  isLoading={updatingUserId === member.user_id}
                                  title={`Cambiar rol a ${isMemberAdmin ? "Conviviente" : "Administrador"}`}
                                >
                                  {isMemberAdmin ? "Cambiar a Conviviente" : "Promover a Admin"}
                                </Button>

                                <Button
                                  variant="danger"
                                  size="sm"
                                  leftIcon={<LuTrash2 size={14} />}
                                  onClick={() => setMemberToRemove(member)}
                                  title="Expulsar conviviente"
                                >
                                  Expulsar
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {members.filter((m) => m.user_id !== effectiveOwnerId).length === 0 &&
                      !loading && (
                        <div
                          className="p-4 text-center text-muted rounded-3"
                          style={{
                            backgroundColor: "var(--bg-subtle, #f8fafc)",
                            border: "1px dashed var(--border-default, #e2e8f0)",
                            fontSize: "0.9rem",
                          }}
                        >
                          No hay otros convivientes registrados en este hogar aún.
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              className="d-flex justify-content-between align-items-center p-3 px-md-4 border-top flex-wrap gap-2"
              style={{
                backgroundColor: "var(--bg-subtle, #f8fafc)",
                borderColor: "var(--border-default, #e2e8f0)",
              }}
            >
              {!isOwner && myRole && currentUser ? (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<LuLogOut size={15} />}
                  onClick={() => setIsLeavingRoom(true)}
                >
                  Abandonar Hogar
                </Button>
              ) : (
                <div />
              )}

              <Button variant="outline" size="sm" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de confirmación para expulsar miembro */}
      <ConfirmModal
        isOpen={Boolean(memberToRemove)}
        title="Expulsar conviviente"
        message={`¿Estás seguro de que deseas expulsar a "${
          memberToRemove?.user_nombre ||
          memberToRemove?.user_email ||
          "este miembro"
        }" del hogar? Perderá acceso inmediato a las tareas compartidas.`}
        confirmText="Expulsar Miembro"
        variant="danger"
        isLoading={actionLoading}
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      {/* Modal de confirmación para abandonar hogar */}
      <ConfirmModal
        isOpen={isLeavingRoom}
        title="Abandonar hogar"
        message={`¿Estás seguro de que deseas abandonar el hogar "${roomName}"? Perderás acceso inmediato a sus tareas y notas compartidas.`}
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
