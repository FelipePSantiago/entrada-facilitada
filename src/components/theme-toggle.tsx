// src/components/theme-toggle.tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const toggleTheme = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (storedTheme) {
      toggleTheme(storedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      toggleTheme("dark");
    }
  }, []);

  return (
    <div className="theme-toggle">
      <button
        className={theme === "light" ? "active" : ""}
        onClick={() => toggleTheme("light")}
        aria-label="Tema claro"
      >
        <Sun size={16} />
      </button>
      <button
        className={theme === "dark" ? "active" : ""}
        onClick={() => toggleTheme("dark")}
        aria-label="Tema escuro"
      >
        <Moon size={16} />
      </button>
    </div>
  );
}
