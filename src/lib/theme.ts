export type NavIndex = 0 | 1 | 2;
export type ThemeMode = "brand" | "campaign" | "saved" | "sultan";
export type ThemeBudgetMode = "normal" | "sultan";

export function resolveThemeMode(
  activeIndex: NavIndex,
  sisaDompet: number,
  isRecipeFocus = false,
  budgetMode: ThemeBudgetMode = "normal",
): ThemeMode {
  if (activeIndex === 0 && budgetMode === "sultan") {
    return "sultan";
  }

  if (activeIndex === 1 && sisaDompet > 0 && isRecipeFocus) {
    return "campaign";
  }

  return activeIndex === 1 || activeIndex === 2 ? "saved" : "brand";
}

export function shouldUseRapidSpots(
  activeIndex: NavIndex,
  sisaDompet: number,
  isRecipeFocus = false,
) {
  return activeIndex === 1 && sisaDompet > 0 && isRecipeFocus;
}
