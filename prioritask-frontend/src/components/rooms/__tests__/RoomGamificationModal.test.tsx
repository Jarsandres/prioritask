import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RoomGamificationModal from "../RoomGamificationModal";
import api from "../../../api";
import { ToastProvider } from "../../../context/ToastContext";
import type { GamificationOverview, RewardRead } from "../../../types/gamification";

const mockOverview: GamificationOverview = {
  room_id: "room-100",
  user_balance: 150,
  user_total_earned: 300,
  user_current_streak: 5,
  user_longest_streak: 10,
  leaderboard: [
    {
      user_id: "user-1",
      user_name: "Joel Master",
      total_points_earned: 300,
      current_streak: 5,
      tasks_completed: 25,
      rank: 1,
    },
  ],
};

const mockRewards: RewardRead[] = [
  {
    id: "rew-1",
    room_id: "room-100",
    title: "Elegir película del viernes",
    description: "El ganador escoge el film para la noche de cine",
    cost_points: 50,
    icon: "gift",
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
  },
];

const renderGamificationModal = (props: Partial<React.ComponentProps<typeof RoomGamificationModal>> = {}) => {
  return render(
    <ToastProvider>
      <RoomGamificationModal
        roomId="room-100"
        roomName="Piso Compartido Centro"
        isOpen={true}
        onClose={vi.fn()}
        isAdmin={true}
        {...props}
      />
    </ToastProvider>
  );
};

describe("RoomGamificationModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "get").mockImplementation((url: string) => {
      if (url.includes("/gamification")) {
        return Promise.resolve({ data: mockOverview });
      }
      if (url.includes("/rewards")) {
        return Promise.resolve({ data: mockRewards });
      }
      if (url === "/auth/me") {
        return Promise.resolve({
          data: { id: "user-1", nombre: "Joel Master", email: "joel@test.com" },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("renderiza el panel de gamificación con racha, balance y pestañas", async () => {
    renderGamificationModal();

    expect(await screen.findByText(/Gamificación/i)).toBeInTheDocument();
    expect(await screen.findByText("5 días")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recompensas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clasificación/i })).toBeInTheDocument();
  });

  it("permite navegar a la pestaña de Recompensas y canjear un premio", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { success: true },
    });

    renderGamificationModal();

    const rewardsTab = await screen.findByRole("button", { name: /Recompensas/i });
    fireEvent.click(rewardsTab);

    expect(await screen.findByText("Elegir película del viernes")).toBeInTheDocument();

    const redeemBtn = screen.getByRole("button", { name: /Canjear/i });
    fireEvent.click(redeemBtn);

    // Confirmar en el modal de confirmación
    const confirmBtn = await screen.findByRole("button", { name: /Confirmar Canje/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith("/rooms/room-100/rewards/rew-1/redeem");
    });
  });

  it("cierra el modal al pulsar la tecla Escape mediante useA11yModal", async () => {
    const onClose = vi.fn();
    renderGamificationModal({ onClose });

    await screen.findByText(/Gamificación/i);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
