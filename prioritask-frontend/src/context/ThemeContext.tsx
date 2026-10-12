/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";
export type AccentPalette = "cobalt" | "crimson" | "emerald" | "violet" | "oled";
export type UIDensity = "compact" | "standard" | "cozy";

export interface RoomBranding {
  icon: string;
  color: string;
}

export const DEFAULT_ROOM_COLORS = [
  "#dc2626", // Coral Todoist
  "#2563eb", // Prioritask Cobalt
  "#059669", // Home Emerald
  "#7c3aed", // Linear Violet
  "#d97706", // Warm Amber
  "#06b6d4", // Cyan
];

export const ROOM_ICON_OPTIONS = ["🏠", "🏖️", "🏢", "🌱", "🍳", "🐾", "🎮", "✨"];

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  accent: AccentPalette;
  setAccent: (accent: AccentPalette) => void;
  density: UIDensity;
  setDensity: (density: UIDensity) => void;
  roomBrandings: Record<string, RoomBranding>;
  setRoomBranding: (roomId: string, branding: Partial<RoomBranding>) => void;
  getRoomBranding: (roomId: string, fallbackIndex?: number) => RoomBranding;
}

const DEFAULT_BRANDING: RoomBranding = {
  icon: "🏠",
  color: "#2563eb",
};

export const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
  accent: "cobalt",
  setAccent: () => {},
  density: "standard",
  setDensity: () => {},
  roomBrandings: {},
  setRoomBranding: () => {},
  getRoomBranding: (_roomId: string, idx = 0) => ({
    icon: "🏠",
    color: DEFAULT_ROOM_COLORS[idx % DEFAULT_ROOM_COLORS.length],
  }),
});

const THEME_STORAGE_KEY = "prioritask-theme";
const ACCENT_STORAGE_KEY = "prioritask-accent";
const DENSITY_STORAGE_KEY = "prioritask-density";
const ROOM_BRANDING_STORAGE_KEY = "prioritask-room-branding";

const VALID_ACCENTS: AccentPalette[] = [
  "cobalt",
  "crimson",
  "emerald",
  "violet",
  "oled",
];
const VALID_DENSITIES: UIDensity[] = ["compact", "standard", "cozy"];

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (storedAccent === "oled") {
        return "dark";
      }
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        return stored;
      }
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
      }
    }
    return "light";
  });

  const [accent, setAccentState] = useState<AccentPalette>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentPalette;
      if (VALID_ACCENTS.includes(stored)) {
        return stored;
      }
    }
    return "cobalt";
  });

  const [density, setDensityState] = useState<UIDensity>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(DENSITY_STORAGE_KEY) as UIDensity;
      if (VALID_DENSITIES.includes(stored)) {
        return stored;
      }
    }
    return "standard";
  });

  const [roomBrandings, setRoomBrandings] = useState<Record<string, RoomBranding>>(
    () => {
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(ROOM_BRANDING_STORAGE_KEY);
          if (raw) {
            return JSON.parse(raw) as Record<string, RoomBranding>;
          }
        } catch {
          return {};
        }
      }
      return {};
    }
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      if (next === "light") {
        setAccentState((currAccent) =>
          currAccent === "oled" ? "cobalt" : currAccent
        );
      }
      return next;
    });
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    if (newTheme === "light") {
      setAccentState((currAccent) =>
        currAccent === "oled" ? "cobalt" : currAccent
      );
    }
  }, []);

  const setAccent = useCallback((newAccent: AccentPalette) => {
    setAccentState(newAccent);
    if (newAccent === "oled") {
      setThemeState("dark");
    }
  }, []);

  const setDensity = useCallback((newDensity: UIDensity) => {
    setDensityState(newDensity);
  }, []);

  const setRoomBranding = useCallback(
    (roomId: string, branding: Partial<RoomBranding>) => {
      setRoomBrandings((prev) => {
        const current = prev[roomId] || DEFAULT_BRANDING;
        const next = {
          ...prev,
          [roomId]: {
            icon: branding.icon ?? current.icon,
            color: branding.color ?? current.color,
          },
        };
        try {
          localStorage.setItem(ROOM_BRANDING_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore quota errors
        }
        return next;
      });
    },
    []
  );

  const getRoomBranding = useCallback(
    (roomId: string, fallbackIndex = 0): RoomBranding => {
      const saved = roomBrandings[roomId];
      if (saved) return saved;
      return {
        icon: "🏠",
        color: DEFAULT_ROOM_COLORS[fallbackIndex % DEFAULT_ROOM_COLORS.length],
      };
    },
    [roomBrandings]
  );

  const contextValue = useMemo(
    () => ({
      theme,
      toggleTheme,
      setTheme,
      accent,
      setAccent,
      density,
      setDensity,
      roomBrandings,
      setRoomBranding,
      getRoomBranding,
    }),
    [
      theme,
      toggleTheme,
      setTheme,
      accent,
      setAccent,
      density,
      setDensity,
      roomBrandings,
      setRoomBranding,
      getRoomBranding,
    ]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

