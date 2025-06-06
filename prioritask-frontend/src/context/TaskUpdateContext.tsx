import { createContext, useState, ReactNode } from "react";

interface TaskUpdateContextType {
  version: number;
  notifyUpdate: () => void;
}

export const TaskUpdateContext = createContext<TaskUpdateContextType>({
  version: 0,
  notifyUpdate: () => {},
});

export const TaskUpdateProvider = ({ children }: { children: ReactNode }) => {
  const [version, setVersion] = useState(0);

  const notifyUpdate = () => setVersion((v) => v + 1);

  return (
    <TaskUpdateContext.Provider value={{ version, notifyUpdate }}>
      {children}
    </TaskUpdateContext.Provider>
  );
};
