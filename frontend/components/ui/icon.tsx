export type IconName =
  | "campaign" | "plus" | "chart" | "clock" | "check" | "info" | "alert" | "warning"
  | "sparkle" | "lock" | "redo" | "link" | "close";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "campaign" && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></>}
    {name === "plus" && <path d="M12 5v14M5 12h14" />}
    {name === "chart" && <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />}
    {name === "clock" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === "check" && <path d="M5 12l4 4L19 6" />}
    {name === "info" && <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16v.5" /></>}
    {name === "alert" && <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></>}
    {name === "warning" && <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17v.5" /></>}
    {name === "sparkle" && <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>}
    {name === "lock" && <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>}
    {name === "redo" && <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>}
    {name === "link" && <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>}
    {name === "close" && <path d="M6 6l12 12M18 6L6 18" />}
  </svg>;
}
