import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "CZK") {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "Čekající",
    in_progress: "Probíhá",
    done: "Hotovo",
    cancelled: "Zrušeno",
    upcoming: "Nadcházející",
    paid: "Zaplaceno",
    overdue: "Po splatnosti",
  };
  return map[status] ?? status;
}

export function priorityLabel(priority: string) {
  const map: Record<string, string> = {
    low: "Nízká",
    normal: "Normální",
    high: "Vysoká",
  };
  return map[priority] ?? priority;
}

export function educationLabel(code: string | null | undefined) {
  if (!code) return "—";
  const map: Record<string, string> = {
    A: "Bez vzdělání",
    B: "Neúplné základní",
    C: "Základní",
    D: "Nižší střední",
    E: "Nižší střední odborné",
    H: "Střední odborné s výučním listem",
    J: "Střední bez maturity",
    K: "Úplné střední všeobecné",
    L: "Úplné střední odborné (vyučení + maturita)",
    M: "Úplné střední odborné (maturita)",
    N: "Vyšší odborné",
    P: "Vyšší odborné – konzervatoř",
    R: "Vysokoškolské bakalářské",
    T: "Vysokoškolské magisterské",
    V: "Vysokoškolské doktorské",
  };
  return map[code] ?? code;
}
