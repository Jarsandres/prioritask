import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RoomMembersModal from "../RoomMembersModal";
import api from "../../api";
import { ToastProvider } from "../../context/ToastContext";
import type { RoomMember } from "../../types/task";

const mockMembers: RoomMember[] = [
  {
    id: "mem-1",
    room_id: "room-100",
    user_id: "user-1",
    role: "ADMIN",
    user_email: "admin@prioritask.test",
    user_nombre: "Joel Admin",
    joined_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "mem-2",
    room_id: "room-100",
    user_id: "user-2",
    role: "MEMBER",
    user_email: "conviviente@prioritask.test",
    user_nombre: "Laura Member",
    joined_at: "2026-10-02T00:00:00Z",
  },
];

const renderMembersModal = (props: Partial<React.ComponentProps<typeof RoomMembersModal>> = {}) => {
  return render(
    <ToastProvider>
      <RoomMembersModal
        roomId="room-100"
        roomName="Piso Compartido Centro"
        isOwner={true}
        myRole="ADMIN"
        isOpen={true}
        onClose={vi.fn()}
        onMembersChanged={vi.fn()}
        ownerId="user-1"
        ownerEmail="admin@prioritask.test"
        {...props}
      />
    </ToastProvider>
  );
};

describe("RoomMembersModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "get").mockImplementation((url: string) => {
      if (url.includes("/members")) {
        return Promise.resolve({ data: mockMembers });
      }
      if (url === "/auth/me") {
        return Promise.resolve({
          data: { id: "user-1", nombre: "Joel Admin", email: "admin@prioritask.test" },
        });
      }
      if (url === "/rooms") {
        return Promise.resolve({
          data: [{ id: "room-100", nombre: "Piso Compartido Centro", owner_id: "user-1" }],
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("renderiza el modal con el título del hogar y los miembros actuales", async () => {
    renderMembersModal();

    expect(await screen.findByText("Convivientes del Hogar")).toBeInTheDocument();
    expect(screen.getByText("Piso Compartido Centro")).toBeInTheDocument();
    expect(await screen.findByText("Joel Admin")).toBeInTheDocument();
    expect(screen.getByText("Laura Member")).toBeInTheDocument();
  });

  it("permite desplegar el formulario para añadir un nuevo miembro", async () => {
    renderMembersModal();

    const addBtn = await screen.findByRole("button", { name: /Añadir Miembro/i });
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText(/ID de usuario/i)).toBeInTheDocument();
    expect(screen.getByText("Rol")).toBeInTheDocument();
  });

  it("llama a la API para incorporar un nuevo miembro", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: {
        id: "mem-3",
        room_id: "room-100",
        user_id: "user-new",
        role: "MEMBER",
        joined_at: "2026-10-08T00:00:00Z",
      },
    });

    renderMembersModal();

    const addBtn = await screen.findByRole("button", { name: /Añadir Miembro/i });
    fireEvent.click(addBtn);

    const input = screen.getByPlaceholderText(/ID de usuario/i);
    fireEvent.change(input, { target: { value: "user-new-id" } });

    const saveBtn = screen.getByRole("button", { name: /Guardar Miembro/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/rooms/room-100/members",
        expect.objectContaining({
          user_id: "user-new-id",
          role: "MEMBER",
        })
      );
    });
  });

  it("cierra el modal cuando se pulsa la tecla Escape mediante useA11yModal", async () => {
    const onClose = vi.fn();
    renderMembersModal({ onClose });

    await screen.findByText("Convivientes del Hogar");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
