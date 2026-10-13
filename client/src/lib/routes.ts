/** Tactile Ledger design reminder: navigation names are short, task-first, and honest about unfinished stages. */
import type { LucideIcon } from "lucide-react";
import { BarChart3, Boxes, CircleDollarSign, ContactRound, HardDriveDownload, HeartPulse, LayoutDashboard, MessageCircleQuestion, ShoppingBag, Store, Sunset, Truck } from "lucide-react";

export type AppRouteKey = "today" | "business" | "inventory" | "customers" | "sales" | "reports" | "endOfDay" | "purchases" | "expenses" | "businessHealth" | "backup" | "assistant";

export interface AppRouteDefinition {
  key: AppRouteKey;
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  availableFromStage: number;
  description: string;
  primary?: boolean;
}

export const appRoutes: readonly AppRouteDefinition[] = [
  { key: "today", href: "/", label: "Home", shortLabel: "Home", icon: LayoutDashboard, availableFromStage: 1, description: "A local summary of today’s work.", primary: true },
  { key: "business", href: "/business", label: "Business", shortLabel: "Business", icon: Store, availableFromStage: 2, description: "Business profile and settings will be introduced in Stage 2." },
  { key: "inventory", href: "/inventory", label: "Stock", shortLabel: "Stock", icon: Boxes, availableFromStage: 3, description: "Products and traceable inventory movements.", primary: true },
  { key: "customers", href: "/customers", label: "Customers", shortLabel: "Customers", icon: ContactRound, availableFromStage: 4, description: "Customer records, balances, and repayments.", primary: true },
  { key: "sales", href: "/sales", label: "Sales", shortLabel: "Sales", icon: ShoppingBag, availableFromStage: 5, description: "Reliable sales, payments, stock updates, and receipts.", primary: true },
  { key: "reports", href: "/reports", label: "Reports", shortLabel: "Reports", icon: BarChart3, availableFromStage: 7, description: "Read-only local business summaries.", primary: true },
  { key: "endOfDay", href: "/end-of-day", label: "End of day", shortLabel: "Day", icon: Sunset, availableFromStage: 6, description: "An optional local review of what happened today." },
  { key: "purchases", href: "/purchases", label: "Purchases", shortLabel: "Buy", icon: Truck, availableFromStage: 7, description: "Local suppliers, stock purchases, and replenishment history." },
  { key: "expenses", href: "/expenses", label: "Expenses", shortLabel: "Expenses", icon: CircleDollarSign, availableFromStage: 8, description: "Local business spending records." },
  { key: "businessHealth", href: "/business-health", label: "Business Health", shortLabel: "Health", icon: HeartPulse, availableFromStage: 8, description: "A plain-language local view of business activity and attention points." },
  { key: "backup", href: "/backup", label: "Backup", shortLabel: "Backup", icon: HardDriveDownload, availableFromStage: 9, description: "Owner-controlled local backup and restore files." },
  { key: "assistant", href: "/assistant", label: "Assistant", shortLabel: "Ask", icon: MessageCircleQuestion, availableFromStage: 10, description: "Ask about balances, stock, and sales in plain language, or prepare a sale, stock receipt, or payment for you to confirm." },
] as const;

export function getRouteDefinition(key: AppRouteKey): AppRouteDefinition {
  const route = appRoutes.find((item) => item.key === key);
  if (!route) throw new Error(`Unknown route: ${key}`);
  return route;
}
