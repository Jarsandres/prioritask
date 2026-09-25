import type { StylesConfig, GroupBase } from "react-select";

export const getRetroSelectStyles = <Option, IsMulti extends boolean = false>(
  theme: "light" | "dark"
): StylesConfig<Option, IsMulti, GroupBase<Option>> => {
  const isDark = theme === "dark";

  return {
    control: (base, state) => ({
      ...base,
      minHeight: "44px",
      backgroundColor: isDark
        ? "var(--input-bg, #0b1120)"
        : "var(--input-bg, #ffffff)",
      borderColor: state.isFocused
        ? "#2563eb"
        : isDark
        ? "var(--input-border, #475569)"
        : "var(--input-border, #1e293b)",
      borderWidth: "2px",
      borderRadius: "8px",
      boxShadow: state.isFocused ? "2px 2px 0px #2563eb" : "none",
      "&:hover": {
        borderColor: "#2563eb",
      },
      cursor: "pointer",
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDark
        ? "var(--window-bg, #1e293b)"
        : "var(--window-bg, #ffffff)",
      border: `2px solid ${
        isDark ? "var(--window-border, #334155)" : "var(--window-border, #1e293b)"
      }`,
      borderRadius: "8px",
      boxShadow: isDark
        ? "4px 4px 0px var(--window-shadow, #000000)"
        : "4px 4px 0px var(--window-shadow, rgba(30, 41, 59, 0.9))",
      zIndex: 9999,
      overflow: "hidden",
    }),
    menuList: (base) => ({
      ...base,
      padding: 0,
      backgroundColor: isDark
        ? "var(--window-bg, #1e293b)"
        : "var(--window-bg, #ffffff)",
    }),
    option: (base, state) => {
      let bg = isDark ? "var(--window-bg, #1e293b)" : "var(--window-bg, #ffffff)";
      let color = isDark
        ? "var(--text-main, #f8fafc)"
        : "var(--text-main, #1e293b)";

      if (state.isSelected) {
        bg = "#2563eb";
        color = "#ffffff";
      } else if (state.isFocused) {
        bg = isDark ? "#334155" : "#f1f5f9";
        color = isDark ? "#ffffff" : "#0f172a";
      }

      return {
        ...base,
        backgroundColor: bg,
        color,
        cursor: "pointer",
        padding: "10px 14px",
        fontSize: "0.95rem",
        fontWeight: state.isSelected ? "700" : "500",
        "&:active": {
          backgroundColor: "#2563eb",
          color: "#ffffff",
        },
      };
    },
    singleValue: (base) => ({
      ...base,
      color: isDark
        ? "var(--text-main, #f8fafc)"
        : "var(--text-main, #1e293b)",
      fontSize: "0.95rem",
      fontWeight: "500",
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: isDark ? "#334155" : "#f5f3ff",
      border: `1px solid ${isDark ? "#475569" : "#c4b5fd"}`,
      borderRadius: "6px",
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: isDark ? "#f8fafc" : "#7c3aed",
      fontWeight: "600",
      fontSize: "0.85rem",
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: isDark ? "#94a3b8" : "#7c3aed",
      "&:hover": {
        backgroundColor: isDark ? "#475569" : "#e9d5ff",
        color: isDark ? "#ffffff" : "#6d28d9",
      },
    }),
    placeholder: (base) => ({
      ...base,
      color: isDark
        ? "var(--text-muted, #94a3b8)"
        : "var(--text-muted, #64748b)",
      fontSize: "0.95rem",
    }),
    input: (base) => ({
      ...base,
      color: isDark
        ? "var(--input-text, #f8fafc)"
        : "var(--input-text, #1e293b)",
    }),
  };
};

export default getRetroSelectStyles;
