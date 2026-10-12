/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import api from "../api";
import { setRetroAudioMuted } from "../utils/retroAudio";

export interface GeneralSettings {
  language: "es" | "en";
  homeView: "/" | "/tasks/grouped" | "/tasks/assign" | "/analytics";
  timeFormat: "24h" | "12h";
  startOfWeek: "monday" | "sunday";
  soundEffects: boolean;
  confirmBeforeDelete: boolean;
  enableAnimations: boolean;
  enableSingleKeyShortcuts: boolean;
}

export interface NavigationSettings {
  visibleModules: {
    groupedAi: boolean;
    assign: boolean;
    analytics: boolean;
    tags: boolean;
    history: boolean;
    rooms: boolean;
  };
  showTaskCounts: boolean;
  showFavoritesSection: boolean;
  favoriteRoomIds: string[];
}

export interface ProductivitySettings {
  dailyTaskGoal: number;
  weeklyTaskGoal: number;
  daysOff: number[];
  vacationMode: boolean;
  celebrateGoalCompletion: boolean;
}

export interface NotificationSettings {
  desktopNotifications: boolean;
  defaultReminderOffsetMinutes: 0 | 10 | 30 | 60;
  snoozePresetMinutes: 30 | 60 | 180;
  events: {
    taskAssigned: boolean;
    taskCompletedByMember: boolean;
    dailySummaryDigest: boolean;
    streakMilestone: boolean;
    overdueAlert: boolean;
  };
}

export interface UserSettings {
  general: GeneralSettings;
  navigation: NavigationSettings;
  productivity: ProductivitySettings;
  notifications: NotificationSettings;
}

export type SnoozePresetKey = "30m" | "3h" | "tomorrow9am";

export interface SnoozeTargetResult {
  targetDate: Date;
  formattedLabel: string;
}

export interface SettingsContextValue {
  settings: UserSettings;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  updateNavigation: (patch: Partial<NavigationSettings>) => void;
  toggleModuleVisibility: (
    moduleKey: keyof NavigationSettings["visibleModules"]
  ) => void;
  toggleFavoriteRoom: (roomId: string) => void;
  updateProductivity: (patch: Partial<ProductivitySettings>) => void;
  toggleDayOff: (dayIndex: number) => void;
  updateNotifications: (patch: Partial<NotificationSettings>) => void;
  updateNotificationEvents: (
    patch: Partial<NotificationSettings["events"]>
  ) => void;
  resetSettings: () => void;
  hydrateFromBackendPreferences: (prefs?: Record<string, unknown>) => void;
  syncSettingsToBackend: (overrideSettings?: UserSettings) => Promise<void>;
  computeSnoozeTarget: (
    preset: SnoozePresetKey,
    now?: Date
  ) => SnoozeTargetResult;
}

export const SETTINGS_STORAGE_KEY = "prioritask-user-settings-v1";
export const DAILY_GOAL_STORAGE_KEY = "prioritask-daily-goal";
export const RETRO_SOUND_MUTED_STORAGE_KEY = "prioritask_retro_sound_muted";

export const DEFAULT_SETTINGS: UserSettings = {
  general: {
    language: "es",
    homeView: "/",
    timeFormat: "24h",
    startOfWeek: "monday",
    soundEffects: true,
    confirmBeforeDelete: true,
    enableAnimations: true,
    enableSingleKeyShortcuts: true,
  },
  navigation: {
    visibleModules: {
      groupedAi: true,
      assign: true,
      analytics: true,
      tags: true,
      history: true,
      rooms: true,
    },
    showTaskCounts: true,
    showFavoritesSection: true,
    favoriteRoomIds: [],
  },
  productivity: {
    dailyTaskGoal: 5,
    weeklyTaskGoal: 25,
    daysOff: [0, 6],
    vacationMode: false,
    celebrateGoalCompletion: true,
  },
  notifications: {
    desktopNotifications: false,
    defaultReminderOffsetMinutes: 30,
    snoozePresetMinutes: 30,
    events: {
      taskAssigned: true,
      taskCompletedByMember: true,
      dailySummaryDigest: false,
      streakMilestone: true,
      overdueAlert: true,
    },
  },
};

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function mergeWithDefaults(raw?: unknown): UserSettings {
  if (!isRecord(raw)) {
    return structuredCloneSettings(DEFAULT_SETTINGS);
  }

  const rawGeneral = isRecord(raw.general) ? raw.general : {};
  const rawNav = isRecord(raw.navigation) ? raw.navigation : {};
  const rawVisibleModules = isRecord(rawNav.visibleModules)
    ? rawNav.visibleModules
    : {};
  const rawProd = isRecord(raw.productivity) ? raw.productivity : {};
  const rawNotif = isRecord(raw.notifications) ? raw.notifications : {};
  const rawEvents = isRecord(rawNotif.events) ? rawNotif.events : {};

  return {
    general: {
      language:
        rawGeneral.language === "en" || rawGeneral.language === "es"
          ? rawGeneral.language
          : DEFAULT_SETTINGS.general.language,
      homeView:
        rawGeneral.homeView === "/" ||
        rawGeneral.homeView === "/tasks/grouped" ||
        rawGeneral.homeView === "/tasks/assign" ||
        rawGeneral.homeView === "/analytics"
          ? rawGeneral.homeView
          : DEFAULT_SETTINGS.general.homeView,
      timeFormat:
        rawGeneral.timeFormat === "12h" || rawGeneral.timeFormat === "24h"
          ? rawGeneral.timeFormat
          : DEFAULT_SETTINGS.general.timeFormat,
      startOfWeek:
        rawGeneral.startOfWeek === "sunday" ||
        rawGeneral.startOfWeek === "monday"
          ? rawGeneral.startOfWeek
          : DEFAULT_SETTINGS.general.startOfWeek,
      soundEffects:
        typeof rawGeneral.soundEffects === "boolean"
          ? rawGeneral.soundEffects
          : DEFAULT_SETTINGS.general.soundEffects,
      confirmBeforeDelete:
        typeof rawGeneral.confirmBeforeDelete === "boolean"
          ? rawGeneral.confirmBeforeDelete
          : DEFAULT_SETTINGS.general.confirmBeforeDelete,
      enableAnimations:
        typeof rawGeneral.enableAnimations === "boolean"
          ? rawGeneral.enableAnimations
          : DEFAULT_SETTINGS.general.enableAnimations,
      enableSingleKeyShortcuts:
        typeof rawGeneral.enableSingleKeyShortcuts === "boolean"
          ? rawGeneral.enableSingleKeyShortcuts
          : DEFAULT_SETTINGS.general.enableSingleKeyShortcuts,
    },
    navigation: {
      visibleModules: {
        groupedAi:
          typeof rawVisibleModules.groupedAi === "boolean"
            ? rawVisibleModules.groupedAi
            : DEFAULT_SETTINGS.navigation.visibleModules.groupedAi,
        assign:
          typeof rawVisibleModules.assign === "boolean"
            ? rawVisibleModules.assign
            : DEFAULT_SETTINGS.navigation.visibleModules.assign,
        analytics:
          typeof rawVisibleModules.analytics === "boolean"
            ? rawVisibleModules.analytics
            : DEFAULT_SETTINGS.navigation.visibleModules.analytics,
        tags:
          typeof rawVisibleModules.tags === "boolean"
            ? rawVisibleModules.tags
            : DEFAULT_SETTINGS.navigation.visibleModules.tags,
        history:
          typeof rawVisibleModules.history === "boolean"
            ? rawVisibleModules.history
            : DEFAULT_SETTINGS.navigation.visibleModules.history,
        rooms:
          typeof rawVisibleModules.rooms === "boolean"
            ? rawVisibleModules.rooms
            : DEFAULT_SETTINGS.navigation.visibleModules.rooms,
      },
      showTaskCounts:
        typeof rawNav.showTaskCounts === "boolean"
          ? rawNav.showTaskCounts
          : DEFAULT_SETTINGS.navigation.showTaskCounts,
      showFavoritesSection:
        typeof rawNav.showFavoritesSection === "boolean"
          ? rawNav.showFavoritesSection
          : DEFAULT_SETTINGS.navigation.showFavoritesSection,
      favoriteRoomIds: Array.isArray(rawNav.favoriteRoomIds)
        ? rawNav.favoriteRoomIds.filter(
            (id): id is string => typeof id === "string"
          )
        : [...DEFAULT_SETTINGS.navigation.favoriteRoomIds],
    },
    productivity: {
      dailyTaskGoal:
        typeof rawProd.dailyTaskGoal === "number" && rawProd.dailyTaskGoal > 0
          ? rawProd.dailyTaskGoal
          : DEFAULT_SETTINGS.productivity.dailyTaskGoal,
      weeklyTaskGoal:
        typeof rawProd.weeklyTaskGoal === "number" && rawProd.weeklyTaskGoal > 0
          ? rawProd.weeklyTaskGoal
          : DEFAULT_SETTINGS.productivity.weeklyTaskGoal,
      daysOff: Array.isArray(rawProd.daysOff)
        ? rawProd.daysOff.filter(
            (d): d is number => typeof d === "number" && d >= 0 && d <= 6
          )
        : [...DEFAULT_SETTINGS.productivity.daysOff],
      vacationMode:
        typeof rawProd.vacationMode === "boolean"
          ? rawProd.vacationMode
          : DEFAULT_SETTINGS.productivity.vacationMode,
      celebrateGoalCompletion:
        typeof rawProd.celebrateGoalCompletion === "boolean"
          ? rawProd.celebrateGoalCompletion
          : DEFAULT_SETTINGS.productivity.celebrateGoalCompletion,
    },
    notifications: {
      desktopNotifications:
        typeof rawNotif.desktopNotifications === "boolean"
          ? rawNotif.desktopNotifications
          : DEFAULT_SETTINGS.notifications.desktopNotifications,
      defaultReminderOffsetMinutes:
        rawNotif.defaultReminderOffsetMinutes === 0 ||
        rawNotif.defaultReminderOffsetMinutes === 10 ||
        rawNotif.defaultReminderOffsetMinutes === 30 ||
        rawNotif.defaultReminderOffsetMinutes === 60
          ? rawNotif.defaultReminderOffsetMinutes
          : DEFAULT_SETTINGS.notifications.defaultReminderOffsetMinutes,
      snoozePresetMinutes:
        rawNotif.snoozePresetMinutes === 30 ||
        rawNotif.snoozePresetMinutes === 60 ||
        rawNotif.snoozePresetMinutes === 180
          ? rawNotif.snoozePresetMinutes
          : DEFAULT_SETTINGS.notifications.snoozePresetMinutes,
      events: {
        taskAssigned:
          typeof rawEvents.taskAssigned === "boolean"
            ? rawEvents.taskAssigned
            : DEFAULT_SETTINGS.notifications.events.taskAssigned,
        taskCompletedByMember:
          typeof rawEvents.taskCompletedByMember === "boolean"
            ? rawEvents.taskCompletedByMember
            : DEFAULT_SETTINGS.notifications.events.taskCompletedByMember,
        dailySummaryDigest:
          typeof rawEvents.dailySummaryDigest === "boolean"
            ? rawEvents.dailySummaryDigest
            : DEFAULT_SETTINGS.notifications.events.dailySummaryDigest,
        streakMilestone:
          typeof rawEvents.streakMilestone === "boolean"
            ? rawEvents.streakMilestone
            : DEFAULT_SETTINGS.notifications.events.streakMilestone,
        overdueAlert:
          typeof rawEvents.overdueAlert === "boolean"
            ? rawEvents.overdueAlert
            : DEFAULT_SETTINGS.notifications.events.overdueAlert,
      },
    },
  };
}

function structuredCloneSettings(s: UserSettings): UserSettings {
  return {
    general: { ...s.general },
    navigation: {
      ...s.navigation,
      visibleModules: { ...s.navigation.visibleModules },
      favoriteRoomIds: [...s.navigation.favoriteRoomIds],
    },
    productivity: {
      ...s.productivity,
      daysOff: [...s.productivity.daysOff],
    },
    notifications: {
      ...s.notifications,
      events: { ...s.notifications.events },
    },
  };
}

export function loadSettingsFromStorage(): UserSettings {
  if (typeof window === "undefined") {
    return structuredCloneSettings(DEFAULT_SETTINGS);
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      return mergeWithDefaults(parsed);
    }
    const legacyGoal = Number(localStorage.getItem(DAILY_GOAL_STORAGE_KEY));
    const base = structuredCloneSettings(DEFAULT_SETTINGS);
    if (!Number.isNaN(legacyGoal) && legacyGoal > 0) {
      base.productivity.dailyTaskGoal = legacyGoal;
    }
    return base;
  } catch {
    return structuredCloneSettings(DEFAULT_SETTINGS);
  }
}

export function applySettingsSideEffects(settings: UserSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(
      DAILY_GOAL_STORAGE_KEY,
      String(settings.productivity.dailyTaskGoal)
    );
    const isMuted = !settings.general.soundEffects;
    localStorage.setItem(RETRO_SOUND_MUTED_STORAGE_KEY, String(isMuted));
    setRetroAudioMuted(isMuted);
    document.documentElement.setAttribute(
      "data-reduced-motion",
      String(!settings.general.enableAnimations)
    );
  } catch {
    // Ignorar errores de cuota en entornos de prueba o modo privado
  }
}

export function formatTimeWithPreference(
  date: Date,
  timeFormat: "24h" | "12h"
): string {
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");

  if (timeFormat === "12h") {
    const period = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${minutes} ${period}`;
  }

  const hoursPadded = String(hours24).padStart(2, "0");
  return `${hoursPadded}:${minutes}`;
}

export function calculateSnoozeTarget(
  preset: SnoozePresetKey,
  timeFormat: "24h" | "12h",
  now?: Date
): SnoozeTargetResult {
  const base = now ? new Date(now.getTime()) : new Date();
  let targetDate: Date;

  if (preset === "30m") {
    // +30 minutos exactos (1,800,000 ms) — algoritmo Todoist Desktop
    targetDate = new Date(base.getTime() + 1800000);
    const timeLabel = formatTimeWithPreference(targetDate, timeFormat);
    return {
      targetDate,
      formattedLabel: `+30 min (${timeLabel})`,
    };
  }

  if (preset === "3h") {
    // +3 horas exactas (10,800,000 ms) — algoritmo Todoist Desktop
    targetDate = new Date(base.getTime() + 10800000);
    const timeLabel = formatTimeWithPreference(targetDate, timeFormat);
    return {
      targetDate,
      formattedLabel: `+3 horas (${timeLabel})`,
    };
  }

  // tomorrow9am: Mañana a las 09:00:00.000
  targetDate = new Date(base.getTime());
  targetDate.setDate(targetDate.getDate() + 1);
  targetDate.setHours(9, 0, 0, 0);
  const timeLabel = formatTimeWithPreference(targetDate, timeFormat);
  return {
    targetDate,
    formattedLabel: `Mañana ${timeLabel}`,
  };
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

function useSettingsStateManager(isActive = true): SettingsContextValue {
  const [settings, setSettings] = useState<UserSettings>(() =>
    loadSettingsFromStorage()
  );

  useEffect(() => {
    if (!isActive) return;
    applySettingsSideEffects(settings);
  }, [settings, isActive]);

  const updateGeneral = useCallback((patch: Partial<GeneralSettings>) => {
    setSettings((prev) => {
      const next: UserSettings = {
        ...prev,
        general: { ...prev.general, ...patch },
      };
      applySettingsSideEffects(next);
      return next;
    });
  }, []);

  const updateNavigation = useCallback((patch: Partial<NavigationSettings>) => {
    setSettings((prev) => {
      const next: UserSettings = {
        ...prev,
        navigation: {
          ...prev.navigation,
          ...patch,
          visibleModules: patch.visibleModules
            ? { ...prev.navigation.visibleModules, ...patch.visibleModules }
            : prev.navigation.visibleModules,
        },
      };
      applySettingsSideEffects(next);
      return next;
    });
  }, []);

  const toggleModuleVisibility = useCallback(
    (moduleKey: keyof NavigationSettings["visibleModules"]) => {
      setSettings((prev) => {
        const next: UserSettings = {
          ...prev,
          navigation: {
            ...prev.navigation,
            visibleModules: {
              ...prev.navigation.visibleModules,
              [moduleKey]: !prev.navigation.visibleModules[moduleKey],
            },
          },
        };
        applySettingsSideEffects(next);
        return next;
      });
    },
    []
  );

  const toggleFavoriteRoom = useCallback((roomId: string) => {
    setSettings((prev) => {
      const exists = prev.navigation.favoriteRoomIds.includes(roomId);
      const nextFavs = exists
        ? prev.navigation.favoriteRoomIds.filter((id) => id !== roomId)
        : [...prev.navigation.favoriteRoomIds, roomId];
      const next: UserSettings = {
        ...prev,
        navigation: {
          ...prev.navigation,
          favoriteRoomIds: nextFavs,
        },
      };
      applySettingsSideEffects(next);
      return next;
    });
  }, []);

  const updateProductivity = useCallback(
    (patch: Partial<ProductivitySettings>) => {
      setSettings((prev) => {
        const next: UserSettings = {
          ...prev,
          productivity: { ...prev.productivity, ...patch },
        };
        applySettingsSideEffects(next);
        return next;
      });
    },
    []
  );

  const toggleDayOff = useCallback((dayIndex: number) => {
    if (dayIndex < 0 || dayIndex > 6) return;
    setSettings((prev) => {
      const exists = prev.productivity.daysOff.includes(dayIndex);
      const nextDays = exists
        ? prev.productivity.daysOff.filter((d) => d !== dayIndex)
        : [...prev.productivity.daysOff, dayIndex].sort((a, b) => a - b);
      const next: UserSettings = {
        ...prev,
        productivity: {
          ...prev.productivity,
          daysOff: nextDays,
        },
      };
      applySettingsSideEffects(next);
      return next;
    });
  }, []);

  const updateNotifications = useCallback(
    (patch: Partial<NotificationSettings>) => {
      setSettings((prev) => {
        const next: UserSettings = {
          ...prev,
          notifications: {
            ...prev.notifications,
            ...patch,
            events: patch.events
              ? { ...prev.notifications.events, ...patch.events }
              : prev.notifications.events,
          },
        };
        applySettingsSideEffects(next);
        return next;
      });
    },
    []
  );

  const updateNotificationEvents = useCallback(
    (patch: Partial<NotificationSettings["events"]>) => {
      setSettings((prev) => {
        const next: UserSettings = {
          ...prev,
          notifications: {
            ...prev.notifications,
            events: {
              ...prev.notifications.events,
              ...patch,
            },
          },
        };
        applySettingsSideEffects(next);
        return next;
      });
    },
    []
  );

  const resetSettings = useCallback(() => {
    const defaults = structuredCloneSettings(DEFAULT_SETTINGS);
    setSettings(defaults);
    applySettingsSideEffects(defaults);
  }, []);

  const hydrateFromBackendPreferences = useCallback(
    (prefs?: Record<string, unknown>) => {
      if (!prefs || !isRecord(prefs)) return;
      const candidate = isRecord(prefs.settings) ? prefs.settings : prefs;
      const merged = mergeWithDefaults(candidate);
      setSettings(merged);
      applySettingsSideEffects(merged);
    },
    []
  );

  const syncSettingsToBackend = useCallback(
    async (overrideSettings?: UserSettings) => {
      const payloadSettings = overrideSettings ?? settings;
      try {
        await api.patch("/auth/me", {
          preferences: { settings: payloadSettings },
        });
      } catch {
        // Tolerante a fallos offline o sesión no iniciada
      }
    },
    [settings]
  );

  const computeSnoozeTarget = useCallback(
    (preset: SnoozePresetKey, now?: Date): SnoozeTargetResult => {
      return calculateSnoozeTarget(preset, settings.general.timeFormat, now);
    },
    [settings.general.timeFormat]
  );

  return useMemo(
    () => ({
      settings,
      updateGeneral,
      updateNavigation,
      toggleModuleVisibility,
      toggleFavoriteRoom,
      updateProductivity,
      toggleDayOff,
      updateNotifications,
      updateNotificationEvents,
      resetSettings,
      hydrateFromBackendPreferences,
      syncSettingsToBackend,
      computeSnoozeTarget,
    }),
    [
      settings,
      updateGeneral,
      updateNavigation,
      toggleModuleVisibility,
      toggleFavoriteRoom,
      updateProductivity,
      toggleDayOff,
      updateNotifications,
      updateNotificationEvents,
      resetSettings,
      hydrateFromBackendPreferences,
      syncSettingsToBackend,
      computeSnoozeTarget,
    ]
  );
}

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const value = useSettingsStateManager();
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

/**
 * Hook de acceso a las 4 stores de configuración de Prioritask.
 * Si se invoca desde un test unitario aislado sin `<SettingsProvider>`,
 * utiliza un estado local respaldado por `localStorage` sin lanzar excepción.
 */
export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  const fallbackValue = useSettingsStateManager(context === null);
  return context ?? fallbackValue;
};
