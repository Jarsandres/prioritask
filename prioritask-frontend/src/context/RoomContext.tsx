/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import api from "../api";
import type { Room } from "../types/task";

export type { Room } from "../types/task";

export interface RoomContextType {
  roomId: string | null;
  setRoomId: (id: string | null) => void;
  rooms: Room[];
  activeRoom: Room | null;
  selectRoom: (roomId: string) => void;
  refreshRooms: () => Promise<void>;
  loadingRooms: boolean;
}

export const RoomContext = createContext<RoomContextType>({
  roomId: null,
  setRoomId: () => {},
  rooms: [],
  activeRoom: null,
  selectRoom: () => {},
  refreshRooms: async () => {},
  loadingRooms: false,
});

export const RoomProvider = ({ children }: { children: ReactNode }) => {
  const [roomId, setRoomIdState] = useState<string | null>(() =>
    localStorage.getItem("roomId")
  );
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);

  // Ref para consultar el roomId actual sin provocar re-creaciones de refreshRooms
  const roomIdRef = useRef<string | null>(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Persistir roomId en localStorage siempre que cambie
  useEffect(() => {
    if (roomId) {
      localStorage.setItem("roomId", roomId);
    } else {
      localStorage.removeItem("roomId");
    }
  }, [roomId]);

  // Derivar activeRoom reactivamente a partir de rooms y roomId (evita desincronizaciones de estado)
  const activeRoom = useMemo(() => {
    if (!roomId || rooms.length === 0) return null;
    return rooms.find((r) => r.id === roomId) || null;
  }, [roomId, rooms]);

  const refreshRooms = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setRooms([]);
      setRoomIdState(null);
      return;
    }

    setLoadingRooms(true);
    try {
      const res = await api.get<Room[]>("/rooms");
      const fetchedRooms = res.data || [];
      setRooms(fetchedRooms);

      // Sincronizar o autoseleccionar sala activa
      const currentTargetId = roomIdRef.current || localStorage.getItem("roomId");
      const currentMatching = fetchedRooms.find((r) => r.id === currentTargetId);

      if (currentMatching) {
        if (roomIdRef.current !== currentMatching.id) {
          setRoomIdState(currentMatching.id);
        }
      } else if (fetchedRooms.length > 0) {
        setRoomIdState(fetchedRooms[0].id);
      } else {
        setRoomIdState(null);
      }
    } catch (err: unknown) {
      console.error("Error al refrescar las salas en RoomContext:", err);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const selectRoom = useCallback((id: string) => {
    setRoomIdState(id);
  }, []);

  const setRoomId = useCallback((id: string | null) => {
    setRoomIdState(id);
  }, []);

  // Cargar salas al montar si hay token
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      refreshRooms();
    }
  }, [refreshRooms]);

  return (
    <RoomContext.Provider
      value={{
        roomId,
        setRoomId,
        rooms,
        activeRoom,
        selectRoom,
        refreshRooms,
        loadingRooms,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => useContext(RoomContext);
