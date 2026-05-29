import type { NutritionEstimate } from "./recipe";

export type NutriLevel = "A" | "B" | "C" | "D";

const LEVEL_SCORE: Record<NutriLevel, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
};

function classifyByThresholds(
  value: number,
  levelA: number,
  levelB: number,
  levelC: number,
): NutriLevel {
  if (value <= levelA) {
    return "A";
  }

  if (value <= levelB) {
    return "B";
  }

  if (value <= levelC) {
    return "C";
  }

  return "D";
}

export function classifySugarLevel(sugarGrams: number): NutriLevel {
  return classifyByThresholds(sugarGrams, 0.5, 6, 12.5);
}

export function classifySodiumLevel(sodiumMg: number): NutriLevel {
  return classifyByThresholds(sodiumMg, 5, 120, 500);
}

export function classifyFatLevel(fatGrams: number): NutriLevel {
  return classifyByThresholds(fatGrams, 0.5, 3, 17);
}

export function classifyNutriLevel(nutrition: NutritionEstimate) {
  const sugarLevel = classifySugarLevel(nutrition.sugarGrams);
  const sodiumLevel = classifySodiumLevel(nutrition.sodiumMg);
  const fatLevel = classifyFatLevel(nutrition.fatGrams);
  const level = [sugarLevel, sodiumLevel, fatLevel].reduce<NutriLevel>((worst, current) =>
    LEVEL_SCORE[current] > LEVEL_SCORE[worst] ? current : worst,
  "A");

  return {
    level,
    sugarLevel,
    sodiumLevel,
    fatLevel,
  };
}
