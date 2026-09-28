import type { StylesConfig, GroupBase } from "react-select";

export const getModernSelectStyles = <Option, IsMulti extends boolean = false>(
  theme: "light" | "dark"
): StylesConfig<Option, IsMulti, GroupBase<Option>> => {
  const isDark = theme === "dark";

  return {
    control: (base, state) => ({
      ...base,
      minHeight: "42px",
      backgroundColor: isDark
        ? "var(--bg-subtle, #19233c)"
        : "var(--bg-surface, #ffffff)",
      borderColor: state.isFocused
        ? "var(--border-focus, #3b82f6)"
        : isDark
        ? "var(--border-default, #1e293c)"
        : "var(--border-default, #e2e8f0)",
      borderWidth: "1px",
      borderRadius: "10px",
      boxShadow: state.isFocused
        ? "0 0 0 3px rgba(37, 99, 235, 0.15)"
        : "var(--shadow-xs)",
      "&:hover": {
        borderColor: "var(--border-focus, #3b82f6)",
      },
      cursor: "pointer",
      transition: "all 0.15s ease",
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark
        ? "var(--bg-surface, #131b2e)"
        : "var(--bg-surface, #ffffff)",
      border: `1px solid ${
        isDark ? "var(--border-default, #1e293c)" : "var(--border-default, #e2e8f0)"
      }`,
      borderRadius: "12px",
      boxShadow: isDark
        ? "0 10px 25px -5px rgba(0, 0, 0, 0.75)"
        : "0 10px 25px -5px rgba(15, 23, 42, 0.1)",
      zIndex: 9999,
      overflow: "hidden",
      padding: "4px",
    }),
    menuList: (base) => ({
      ...base,
      padding: 0,
      backgroundColor: "transparent",
    }),
    option: (base, state) => {
      let bg = "transparent";
      let color = isDark
        ? "var(--text-main, #f1f5f9)"
        : "var(--text-main, #1e293b)";

      if (state.isSelected) {
        bg = "#2563eb";
        color = "#ffffff";
      } else if (state.isFocused) {
        bg = isDark ? "rgba(37, 99, 235, 0.2)" : "#eff6ff";
        color = isDark ? "#ffffff" : "#1d4ed8";
      }

      return {
        ...base,
        backgroundColor: bg,
        color,
        cursor: "pointer",
        padding: "8px 12px",
        borderRadius: "6px",
        fontSize: "0.9rem",
        fontWeight: state.isSelected ? "600" : "500",
        "&:active": {
          backgroundColor: "#2563eb",
          color: "#ffffff",
        },
      };
    },
    singleValue: (base) => ({
      ...base,
      color: isDark
        ? "var(--text-main, #f1f5f9)"
        : "var(--text-main, #1e293b)",
      fontSize: "0.9rem",
      fontWeight: "500",
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: isDark ? "rgba(139, 92, 246, 0.2)" : "#f5f3ff",
      border: `1px solid ${isDark ? "rgba(139, 92, 246, 0.3)" : "#ddd6fe"}`,
      borderRadius: "6px",
      padding: "1px 4px",
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: isDark ? "#c4b5fd" : "#7c3aed",
      fontWeight: "600",
      fontSize: "0.82rem",
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: isDark ? "#a78bfa" : "#7c3aed",
      cursor: "pointer",
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: isDark ? "rgba(239, 68, 68, 0.2)" : "#fee2e2",
        color: "#ef4444",
      },
    }),
    input: (base) => ({
      ...base,
      color: isDark ? "var(--text-main, #f1f5f9)" : "var(--text-main, #1e293b)",
    }),
    placeholder: (base) => ({
      ...base,
      color: "var(--text-muted, #94a3b8)",
      fontSize: "0.9rem",
    }),
  };
};

/** Alias retrocompatible para pantallas existentes */
export const getRetroSelectStyles = getModernSelectStyles;
