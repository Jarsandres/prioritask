import { useState, useEffect, useCallback, useId } from "react";
import {
  LuFlame,
  LuTrophy,
  LuShield,
  LuCoins,
  LuGift,
  LuCoffee,
  LuPizza,
  LuGamepad2,
  LuStar,
  LuPlus,
  LuX,
  LuSparkles,
  LuCheck,
  LuCrown,
  LuShoppingBag,
} from "react-icons/lu";
import api from "../../api";
import { useToast } from "../../context/ToastContext";
import usePixelConfetti from "../../hooks/usePixelConfetti";
import ConfirmModal from "../ConfirmModal";
import { Skeleton } from "../ui/Skeleton";
import { Button } from "../ui/Button";
import type {
  GamificationOverview,
  RewardRead,
  RewardCreate,
  LeaderboardEntry,
} from "../../types/gamification";
import type { UserProfile } from "../../types/auth";
import "./RoomGamificationModal.css";

export interface RoomGamificationModalProps {
  roomId: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

const AVAILABLE_ICONS = [
  { id: "gift", label: "Regalo", icon: <LuGift size={20} /> },
  { id: "coffee", label: "Café", icon: <LuCoffee size={20} /> },
  { id: "pizza", label: "Pizza", icon: <LuPizza size={20} /> },
  { id: "gamepad", label: "Videojuego", icon: <LuGamepad2 size={20} /> },
  { id: "star", label: "Estrella", icon: <LuStar size={20} /> },
  { id: "trophy", label: "Trofeo", icon: <LuTrophy size={20} /> },
];

const renderRewardIcon = (iconName?: string | null) => {
  switch (iconName) {
    case "coffee":
      return <LuCoffee size={24} />;
    case "pizza":
      return <LuPizza size={24} />;
    case "gamepad":
      return <LuGamepad2 size={24} />;
    case "star":
      return <LuStar size={24} />;
    case "trophy":
      return <LuTrophy size={24} />;
    case "gift":
    default:
      return <LuGift size={24} />;
  }
};

export const RoomGamificationModal = ({
  roomId,
  roomName,
  isOpen,
  onClose,
  isAdmin = false,
}: RoomGamificationModalProps) => {
  const { toast } = useToast();
  const { triggerFanfare } = usePixelConfetti();
  const titleId = useId();

  const [activeTab, setActiveTab] = useState<"overview" | "rewards" | "leaderboard">("overview");
  const [overview, setOverview] = useState<GamificationOverview | null>(null);
  const [rewards, setRewards] = useState<RewardRead[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Estados para canjear recompensa
  const [rewardToRedeem, setRewardToRedeem] = useState<RewardRead | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Estados para crear recompensa (Admin)
  const [isCreatingReward, setIsCreatingReward] = useState(false);
  const [newRewardTitle, setNewRewardTitle] = useState("");
  const [newRewardDescription, setNewRewardDescription] = useState("");
  const [newRewardCost, setNewRewardCost] = useState<number>(50);
  const [newRewardIcon, setNewRewardIcon] = useState<string>("gift");
  const [isSavingReward, setIsSavingReward] = useState(false);

  // Cargar perfil y datos de gamificación
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!roomId) return;
    setLoading(true);
    try {
      const [overviewRes, rewardsRes, meRes] = await Promise.all([
        api.get<GamificationOverview>(`/rooms/${roomId}/gamification`, { signal }),
        api.get<RewardRead[]>(`/rooms/${roomId}/rewards`, { signal }),
        api.get<UserProfile>("/auth/me", { signal }).catch(() => ({ data: null })),
      ]);
      setOverview(overviewRes.data);
      setRewards(rewardsRes.data.filter((r) => r.is_active));
      if (meRes.data) {
        setCurrentUser(meRes.data);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "CanceledError") return;
      console.error("Error al cargar datos de gamificación:", err);
      toast.error("No se pudieron cargar los datos de gamificación.");
    } finally {
      setLoading(false);
    }
  }, [roomId, toast]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [isOpen, fetchData]);

  // Manejo de atajo Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Canjear recompensa
  const handleConfirmRedeem = async () => {
    if (!rewardToRedeem) return;
    setIsRedeeming(true);
    try {
      await api.post(`/rooms/${roomId}/rewards/${rewardToRedeem.id}/redeem`);
      triggerFanfare();
      toast.success(`¡Canjeaste "${rewardToRedeem.title}" con éxito! 🎉`);
      setRewardToRedeem(null);
      // Refrescar balance
      await fetchData();
    } catch (err: unknown) {
      console.error("Error al canjear recompensa:", err);
      toast.error("No se pudo canjear la recompensa o tus puntos son insuficientes.");
    } finally {
      setIsRedeeming(false);
    }
  };

  // Crear recompensa
  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRewardTitle.trim() || newRewardCost <= 0) {
      toast.error("Ingresa un título válido y un costo mayor a cero.");
      return;
    }

    setIsSavingReward(true);
    try {
      const payload: RewardCreate = {
        title: newRewardTitle.trim(),
        description: newRewardDescription.trim() || undefined,
        cost_points: Number(newRewardCost),
        icon_name: newRewardIcon,
      };

      await api.post(`/rooms/${roomId}/rewards`, payload);
      toast.success("¡Recompensa creada con éxito! 🎁");
      setIsCreatingReward(false);
      setNewRewardTitle("");
      setNewRewardDescription("");
      setNewRewardCost(50);
      setNewRewardIcon("gift");
      await fetchData();
    } catch (err: unknown) {
      console.error("Error al crear recompensa:", err);
      toast.error("No se pudo crear la recompensa.");
    } finally {
      setIsSavingReward(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3"
        onClick={onClose}
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 9999,
          animation: "fadeIn 0.15s ease-out",
        }}
      >
        <div
          className="card border-0 shadow-lg"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{
            width: "100%",
            maxWidth: "720px",
            borderRadius: "16px",
            overflow: "hidden",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Cabecera Gamificada */}
          <div className="gamification-modal-header p-4 d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-3">
              <div
                className="p-2 rounded-3 bg-warning-subtle text-warning d-flex align-items-center justify-content-center border border-warning-subtle shadow-sm"
                style={{ width: "44px", height: "44px" }}
              >
                <LuTrophy size={24} aria-hidden="true" />
              </div>
              <div>
                <div className="d-flex align-items-center gap-2">
                  <h4 id={titleId} className="mb-0 fw-bold fs-5">
                    Gamificación & Rachas
                  </h4>
                  <span className="badge rounded-pill bg-warning text-dark px-2 py-1" style={{ fontSize: "11px" }}>
                    8-Bit Arcade
                  </span>
                </div>
                <p className="text-muted small mb-0">
                  {roomName} · Compite con tus convivientes y canjea recompensas
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-light rounded-pill p-1 d-flex align-items-center justify-content-center"
              onClick={onClose}
              aria-label="Cerrar modal de gamificación"
              style={{ width: "32px", height: "32px" }}
            >
              <LuX size={18} />
            </button>
          </div>

          {/* Navegación por pestañas */}
          <div className="px-4 pt-3 pb-2 border-bottom">
            <div className="gamification-nav-pills">
              <button
                type="button"
                className={`gamification-nav-btn ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveTab("overview")}
              >
                <LuSparkles size={16} />
                <span>Mi Estado</span>
              </button>
              <button
                type="button"
                className={`gamification-nav-btn ${activeTab === "leaderboard" ? "active" : ""}`}
                onClick={() => setActiveTab("leaderboard")}
              >
                <LuCrown size={16} />
                <span>Clasificación</span>
              </button>
              <button
                type="button"
                className={`gamification-nav-btn ${activeTab === "rewards" ? "active" : ""}`}
                onClick={() => setActiveTab("rewards")}
              >
                <LuShoppingBag size={16} />
                <span>Tienda de Recompensas</span>
              </button>
            </div>
          </div>

          {/* Contenido scrolleable */}
          <div className="p-4" style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <div className="row g-3">
                <div className="col-6 col-md-3">
                  <Skeleton variant="rounded" height="80px" />
                </div>
                <div className="col-6 col-md-3">
                  <Skeleton variant="rounded" height="80px" />
                </div>
                <div className="col-6 col-md-3">
                  <Skeleton variant="rounded" height="80px" />
                </div>
                <div className="col-6 col-md-3">
                  <Skeleton variant="rounded" height="80px" />
                </div>
                <div className="col-12 mt-4">
                  <Skeleton variant="rounded" height="180px" />
                </div>
              </div>
            ) : (
              <>
                {/* PESTAÑA 1: MI ESTADO */}
                {activeTab === "overview" && (
                  <div>
                    {/* Tarjetas de estadísticas */}
                    <div className="row g-3 mb-4">
                      <div className="col-6 col-md-3">
                        <div className="gamification-stat-card">
                          <div className="gamification-stat-icon points">
                            <LuCoins size={22} />
                          </div>
                          <div>
                            <span className="small text-muted d-block">Puntos</span>
                            <span className="fw-bold fs-5 text-warning">
                              {overview?.user_balance ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="col-6 col-md-3">
                        <div className="gamification-stat-card">
                          <div className="gamification-stat-icon streak">
                            <LuFlame size={22} />
                          </div>
                          <div>
                            <span className="small text-muted d-block">Racha Actual</span>
                            <span className="fw-bold fs-5 text-danger">
                              {overview?.user_current_streak ?? 0} d
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="col-6 col-md-3">
                        <div className="gamification-stat-card">
                          <div className="gamification-stat-icon record">
                            <LuTrophy size={22} />
                          </div>
                          <div>
                            <span className="small text-muted d-block">Mejor Racha</span>
                            <span className="fw-bold fs-5 text-primary">
                              {overview?.user_longest_streak ?? 0} d
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="col-6 col-md-3">
                        <div className="gamification-stat-card">
                          <div className="gamification-stat-icon freeze">
                            <LuShield size={22} />
                          </div>
                          <div>
                            <span className="small text-muted d-block">Protección</span>
                            <span className="fw-bold fs-5 text-info">
                              {overview?.streak_freeze_available ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Explicación y consejos gamificados */}
                    <div className="card bg-body-tertiary border p-3 rounded-3 mb-3">
                      <h6 className="fw-bold d-flex align-items-center gap-2 mb-2">
                        <LuSparkles className="text-warning" size={18} />
                        <span>¿Cómo funciona el sistema de Rachas y Puntos?</span>
                      </h6>
                      <ul className="mb-0 text-muted small ps-3">
                        <li className="mb-1">
                          <strong>Completar tareas:</strong> Otorga puntos automáticos basados en la dificultad de la tarea (peso x 10).
                        </li>
                        <li className="mb-1">
                          <strong>Racha diaria:</strong> Completa al menos una tarea cada día consecutivo para incrementar tu fuego de racha 🔥.
                        </li>
                        <li className="mb-1">
                          <strong>Escudo protector:</strong> Si un día no puedes completar tareas, tu racha se mantendrá congelada automáticamente si tienes protecciones disponibles 🛡️.
                        </li>
                        <li>
                          <strong>Recompensas:</strong> Canjea tus puntos por premios acordados con tus convivientes.
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* PESTAÑA 2: CLASIFICACIÓN (LEADERBOARD) */}
                {activeTab === "leaderboard" && (
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h6 className="fw-bold mb-0">Tabla de Clasificación del Hogar</h6>
                      <span className="badge bg-secondary-subtle text-secondary">
                        {overview?.leaderboard.length || 0} convivientes
                      </span>
                    </div>

                    {(!overview?.leaderboard || overview.leaderboard.length === 0) ? (
                      <div className="text-center py-4 text-muted small">
                        Aún no hay puntuaciones registradas en este hogar.
                      </div>
                    ) : (
                      <div className="leaderboard-list">
                        {overview.leaderboard.map((entry: LeaderboardEntry, idx: number) => {
                          const isCurrent = currentUser?.id === entry.user_id;
                          const rankMedal =
                            idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`;

                          return (
                            <div
                              key={entry.user_id}
                              className={`leaderboard-row ${isCurrent ? "current-user" : ""}`}
                            >
                              <div className="d-flex align-items-center gap-3">
                                <div className="leaderboard-rank">{rankMedal}</div>
                                <div>
                                  <div className="d-flex align-items-center gap-2">
                                    <span className="fw-bold small">{entry.nombre}</span>
                                    {isCurrent && (
                                      <span className="badge bg-warning text-dark py-0 px-2" style={{ fontSize: "10px" }}>
                                        Tú
                                      </span>
                                    )}
                                    <span className="badge bg-secondary-subtle text-secondary py-0 px-1" style={{ fontSize: "10px" }}>
                                      Nivel {entry.level}
                                    </span>
                                  </div>
                                  <div className="text-muted" style={{ fontSize: "12px" }}>
                                    {entry.lifetime_points} pts acumulados históricos
                                  </div>
                                </div>
                              </div>

                              <div className="d-flex align-items-center gap-3">
                                <div className="d-flex align-items-center gap-1 text-danger fw-bold small" title="Racha de días">
                                  <LuFlame size={15} />
                                  <span>{entry.current_streak} d</span>
                                </div>
                                <div className="d-flex align-items-center gap-1 text-warning fw-bold small" title="Saldo disponible">
                                  <LuCoins size={15} />
                                  <span>{entry.points_balance}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* PESTAÑA 3: TIENDA DE RECOMPENSAS */}
                {activeTab === "rewards" && (
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div>
                        <h6 className="fw-bold mb-0">Tienda de Premios Domésticos</h6>
                        <span className="text-muted small">
                          Tu saldo: <strong className="text-warning">{overview?.user_balance ?? 0} pts</strong>
                        </span>
                      </div>

                      {isAdmin && (
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<LuPlus size={14} />}
                          onClick={() => setIsCreatingReward(true)}
                        >
                          Crear Recompensa
                        </Button>
                      )}
                    </div>

                    {/* Modal o sección para crear recompensa */}
                    {isCreatingReward && (
                      <form onSubmit={handleCreateReward} className="card p-3 mb-4 border-primary shadow-sm bg-body-tertiary">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h6 className="fw-bold mb-0 text-primary small">Nueva Recompensa para el Hogar</h6>
                          <button
                            type="button"
                            className="btn btn-sm btn-link text-muted p-0"
                            onClick={() => setIsCreatingReward(false)}
                          >
                            <LuX size={16} />
                          </button>
                        </div>

                        <div className="mb-2">
                          <label className="form-label small fw-semibold mb-1">Título de la recompensa</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Ej: Elegir qué cenar este viernes"
                            value={newRewardTitle}
                            onChange={(e) => setNewRewardTitle(e.target.value)}
                            required
                          />
                        </div>

                        <div className="mb-2">
                          <label className="form-label small fw-semibold mb-1">Descripción (opcional)</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Ej: El conviviente canjeador elige el menú del viernes"
                            value={newRewardDescription}
                            onChange={(e) => setNewRewardDescription(e.target.value)}
                          />
                        </div>

                        <div className="row g-2 mb-3">
                          <div className="col-6">
                            <label className="form-label small fw-semibold mb-1">Costo en puntos</label>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              min={1}
                              value={newRewardCost}
                              onChange={(e) => setNewRewardCost(Number(e.target.value))}
                              required
                            />
                          </div>
                          <div className="col-6">
                            <label className="form-label small fw-semibold mb-1">Icono</label>
                            <select
                              className="form-select form-select-sm"
                              value={newRewardIcon}
                              onChange={(e) => setNewRewardIcon(e.target.value)}
                            >
                              {AVAILABLE_ICONS.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="d-flex justify-content-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsCreatingReward(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            isLoading={isSavingReward}
                          >
                            Guardar Recompensa
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Grilla de Recompensas */}
                    {rewards.length === 0 ? (
                      <div className="text-center py-4 text-muted small card p-4 border-dashed bg-body-tertiary">
                        No hay recompensas creadas aún en este hogar.
                        {isAdmin && " ¡Sé el primero en crear una recompensa para motivar al equipo!"}
                      </div>
                    ) : (
                      <div className="row g-3">
                        {rewards.map((reward) => {
                          const canAfford = (overview?.user_balance ?? 0) >= reward.cost_points;

                          return (
                            <div key={reward.id} className="col-12 col-sm-6">
                              <div className="reward-card">
                                <div>
                                  <div className="d-flex justify-content-between align-items-start mb-2">
                                    <div className="reward-icon-badge">
                                      {renderRewardIcon(reward.icon_name)}
                                    </div>
                                    <span className="reward-points-badge">
                                      <LuCoins size={14} />
                                      {reward.cost_points} pts
                                    </span>
                                  </div>
                                  <h6 className="fw-bold mb-1 fs-6">{reward.title}</h6>
                                  {reward.description && (
                                    <p className="text-muted small mb-3">
                                      {reward.description}
                                    </p>
                                  )}
                                </div>

                                <div className="pt-2 border-top mt-2">
                                  <Button
                                    variant={canAfford ? "primary" : "secondary"}
                                    size="sm"
                                    className="w-100"
                                    disabled={!canAfford}
                                    leftIcon={canAfford ? <LuCheck size={14} /> : undefined}
                                    onClick={() => setRewardToRedeem(reward)}
                                    title={!canAfford ? "Puntos insuficientes" : "Canjear recompensa"}
                                  >
                                    {canAfford ? "Canjear" : "Puntos insuficientes"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pie */}
          <div className="p-3 border-top bg-body-tertiary d-flex justify-content-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de confirmación para canjear recompensa */}
      <ConfirmModal
        isOpen={!!rewardToRedeem}
        title="Canjear Recompensa"
        message={`¿Deseas canjear "${rewardToRedeem?.title}" por ${rewardToRedeem?.cost_points} puntos? Los puntos se deducirán de tu balance actual.`}
        confirmText="Confirmar Canje"
        variant="primary"
        isLoading={isRedeeming}
        onConfirm={handleConfirmRedeem}
        onCancel={() => setRewardToRedeem(null)}
      />
    </>
  );
};

export default RoomGamificationModal;
