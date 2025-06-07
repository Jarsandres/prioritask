export const getCurrentRoomId = (): string | null => {
  return localStorage.getItem("roomId");
};

export const saveCurrentRoomId = (id: string) => {
  localStorage.setItem("roomId", id);
};

export const clearCurrentRoomId = () => {
  localStorage.removeItem("roomId");
};
