/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface RoomContextType {
  roomId: string | null;
  setRoomId: (id: string | null) => void;
}

export const RoomContext = createContext<RoomContextType>({
  roomId: null,
  setRoomId: () => {},
});

export const RoomProvider = ({ children }: { children: ReactNode }) => {
  const [roomId, setRoomIdState] = useState<string | null>(() => localStorage.getItem("roomId"));

  const setRoomId = (id: string | null) => {
    setRoomIdState(id);
  };

  useEffect(() => {
    if (roomId) {
      localStorage.setItem("roomId", roomId);
    } else {
      localStorage.removeItem("roomId");
    }
  }, [roomId]);

  return (
    <RoomContext.Provider value={{ roomId, setRoomId }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => useContext(RoomContext);
