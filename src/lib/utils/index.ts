export { cn } from "./cn";

export function generatePoolSymbol(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
}

export function formatHours(hours: number): string {
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
