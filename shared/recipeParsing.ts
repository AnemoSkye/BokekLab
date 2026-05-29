import {
  ingredientAnalysisResponseSchema,
  recipeResponseSchema,
  type IngredientAnalysisResponse,
  type NutritionEstimate,
  type RecipeResponse,
} from "./recipe";

export function parseStructuredRecipe(text: string): RecipeResponse {
  return parseStructuredJson(text, recipeResponseSchema, "Gemini", [
    ["recipe"],
    ["result"],
    ["data"],
    ["output"],
  ], normalizeRecipeCandidate);
}

export function parseStructuredIngredientAnalysis(text: string): IngredientAnalysisResponse {
  return parseStructuredJson(text, ingredientAnalysisResponseSchema, "Gemini image analysis", [
    ["analysis"],
    ["result"],
    ["data"],
    ["output"],
  ]);
}

function parseStructuredJson<T>(
  text: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  label: string,
  fallbackPaths: string[][] = [],
  normalizeCandidate: (value: unknown) => unknown = (value) => value,
): T {
  const trimmed = text.trim();

  if (!trimmed || trimmed.startsWith("```") || trimmed.includes("\n```")) {
    throw new Error(`${label} returned markdown or an empty response instead of JSON.`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} returned non-JSON content.`);
  }

  for (const candidate of [parsed, ...fallbackPaths.map((path) => readPath(parsed, path))]) {
    const result = schema.safeParse(normalizeCandidate(candidate));

    if (result.success) {
      return result.data;
    }
  }

  throw Object.assign(
    new Error(`${label} returned JSON, but it did not match the required BokekLab schema.`),
    {
      statusCode: 502,
      code: "invalid_model_schema",
    },
  );
}

function readPath(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }

    return undefined;
  }, value);
}

function normalizeRecipeCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const nutrition =
    record.nutritionEstimate && typeof record.nutritionEstimate === "object"
      ? (record.nutritionEstimate as Record<string, unknown>)
      : {};
  const estimatedNutrition = estimateNutrition(record);
  const reconciledNutrition = {
    caloriesKcal: readNutritionNumberWithEstimate(
      estimatedNutrition.caloriesKcal,
      nutrition.caloriesKcal,
      nutrition.caloriesText,
    ),
    proteinGrams: readNutritionNumberWithEstimate(
      estimatedNutrition.proteinGrams,
      nutrition.proteinGrams,
      nutrition.proteinText,
    ),
    carbsGrams: readNutritionNumberWithEstimate(
      estimatedNutrition.carbsGrams,
      nutrition.carbsGrams,
      nutrition.carbsText,
    ),
    fiberGrams: readNutritionNumberWithEstimate(estimatedNutrition.fiberGrams, nutrition.fiberGrams),
    fatGrams: readNutritionNumberWithEstimate(
      estimatedNutrition.fatGrams,
      nutrition.fatGrams,
      nutrition.fatText,
    ),
    sugarGrams: readNutritionNumberWithEstimate(
      estimatedNutrition.sugarGrams,
      nutrition.sugarGrams,
      nutrition.sugarText,
    ),
    sodiumMg: readNutritionNumberWithEstimate(
      estimatedNutrition.sodiumMg,
      nutrition.sodiumMg,
      nutrition.sodiumText,
    ),
  };
  const warnings = Array.isArray(nutrition.warnings)
    ? nutrition.warnings.filter((warning): warning is string => typeof warning === "string")
    : estimatedNutrition.warnings;

  return {
    ...record,
    briefDescription: readBriefDescription(record),
    ingredients: Array.isArray(record.ingredients) ? record.ingredients : [],
    nutritionEstimate: {
      caloriesText: `${Math.round(reconciledNutrition.caloriesKcal)} kkal`,
      proteinText: `${reconciledNutrition.proteinGrams} g`,
      carbsText: `${reconciledNutrition.carbsGrams} g`,
      fatText: `${reconciledNutrition.fatGrams} g`,
      sodiumText: `${Math.round(reconciledNutrition.sodiumMg)} mg`,
      sugarText: `${reconciledNutrition.sugarGrams} g`,
      caloriesKcal: Math.round(reconciledNutrition.caloriesKcal),
      proteinGrams: reconciledNutrition.proteinGrams,
      carbsGrams: reconciledNutrition.carbsGrams,
      fiberGrams: reconciledNutrition.fiberGrams,
      fatGrams: reconciledNutrition.fatGrams,
      sugarGrams: reconciledNutrition.sugarGrams,
      sodiumMg: Math.round(reconciledNutrition.sodiumMg),
      warnings: warnings.length > 0 ? warnings : buildNutritionWarnings(reconciledNutrition),
    },
  };
}

function readBriefDescription(record: Record<string, unknown>): string {
  const raw = typeof record.briefDescription === "string" ? record.briefDescription.trim() : "";

  if (raw && !isGenericBriefDescription(raw)) {
    return raw;
  }

  const recipeName =
    typeof record.recipeName === "string" && record.recipeName.trim()
      ? record.recipeName.trim()
      : "Resep ini";
  const ingredients = readIngredientNames(record).slice(0, 3);

  if (ingredients.length > 0) {
    return `${recipeName} memakai ${joinIndonesianList(ingredients)} sebagai bahan utama untuk satu porsi praktis.`;
  }

  return `${recipeName} dirancang sebagai satu porsi praktis dengan bahan yang tersedia.`;
}

function isGenericBriefDescription(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  return [
    "resep hemat yang diracik dari bahan tersedia.",
    "resep hemat yang diracik dari bahan tersedia",
    "resep praktis dari bahan yang sudah tersedia.",
    "resep praktis dari bahan yang sudah tersedia",
  ].includes(normalized);
}

function readIngredientNames(record: Record<string, unknown>): string[] {
  const ingredients = Array.isArray(record.ingredients) ? record.ingredients : [];

  return ingredients
    .map((ingredient) =>
      ingredient && typeof ingredient === "object" && "item" in ingredient
        ? String((ingredient as Record<string, unknown>).item).trim()
        : "",
    )
    .filter(Boolean);
}

function joinIndonesianList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} dan ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, dan ${items[items.length - 1]}`;
}

function readNutritionNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }

    if (typeof value === "string") {
      const match = value.match(/\d+(?:[.,]\d+)?/);
      if (match) {
        return Number(match[0].replace(",", "."));
      }
    }
  }

  return 0;
}

function readNutritionNumberWithEstimate(estimatedMinimum: number, ...values: unknown[]): number {
  const parsed = readNutritionNumber(...values);
  const reconciled =
    estimatedMinimum > 0 && (parsed <= 0 || parsed < estimatedMinimum * 0.6)
      ? estimatedMinimum
      : parsed;

  return Number.isInteger(reconciled) ? reconciled : roundOne(reconciled);
}

function estimateNutrition(record: Record<string, unknown>): NutritionEstimate {
  const ingredients = Array.isArray(record.ingredients) ? record.ingredients : [];
  const names = ingredients
    .map((ingredient) =>
      ingredient && typeof ingredient === "object" && "item" in ingredient
        ? String((ingredient as Record<string, unknown>).item)
        : "",
    )
    .filter(Boolean);

  if (names.length === 0 && typeof record.recipeName === "string") {
    names.push(record.recipeName);
  }

  const total = names.reduce(
    (sum, name) => addNutrition(sum, estimateIngredientNutrition(name)),
    emptyNutritionNumbers(),
  );

  const rounded = {
    caloriesKcal: Math.round(total.caloriesKcal),
    proteinGrams: roundOne(total.proteinGrams),
    carbsGrams: roundOne(total.carbsGrams),
    fiberGrams: roundOne(total.fiberGrams),
    fatGrams: roundOne(total.fatGrams),
    sugarGrams: roundOne(total.sugarGrams),
    sodiumMg: Math.round(total.sodiumMg),
  };
  const warnings = buildNutritionWarnings(rounded);

  return {
    caloriesText: `${rounded.caloriesKcal} kkal`,
    proteinText: `${rounded.proteinGrams} g`,
    carbsText: `${rounded.carbsGrams} g`,
    fatText: `${rounded.fatGrams} g`,
    sodiumText: `${rounded.sodiumMg} mg`,
    sugarText: `${rounded.sugarGrams} g`,
    ...rounded,
    warnings:
      warnings.length > 0
        ? warnings
        : ["Estimasi nutrisi dihitung dari bahan yang terdeteksi; cek label kemasan bila tersedia."],
  };
}

function emptyNutritionNumbers() {
  return {
    caloriesKcal: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fiberGrams: 0,
    fatGrams: 0,
    sugarGrams: 0,
    sodiumMg: 0,
  };
}

function addNutrition(left: ReturnType<typeof emptyNutritionNumbers>, right: ReturnType<typeof emptyNutritionNumbers>) {
  return {
    caloriesKcal: left.caloriesKcal + right.caloriesKcal,
    proteinGrams: left.proteinGrams + right.proteinGrams,
    carbsGrams: left.carbsGrams + right.carbsGrams,
    fiberGrams: left.fiberGrams + right.fiberGrams,
    fatGrams: left.fatGrams + right.fatGrams,
    sugarGrams: left.sugarGrams + right.sugarGrams,
    sodiumMg: left.sodiumMg + right.sodiumMg,
  };
}

function estimateIngredientNutrition(name: string) {
  const normalized = name.toLowerCase();
  const value = emptyNutritionNumbers();

  if (normalized.includes("indomie") || normalized.includes("mie instan")) {
    return { caloriesKcal: 380, proteinGrams: 8, carbsGrams: 54, fiberGrams: 2, fatGrams: 14, sugarGrams: 7, sodiumMg: 1500 };
  }
  if (normalized.includes("nasi")) {
    return { caloriesKcal: 260, proteinGrams: 5, carbsGrams: 57, fiberGrams: 1, fatGrams: 0.6, sugarGrams: 0.1, sodiumMg: 5 };
  }
  if (normalized.includes("roti")) {
    return { caloriesKcal: 160, proteinGrams: 5, carbsGrams: 28, fiberGrams: 2, fatGrams: 2.5, sugarGrams: 4, sodiumMg: 260 };
  }
  if (normalized.includes("bihun")) {
    return { caloriesKcal: 190, proteinGrams: 2, carbsGrams: 44, fiberGrams: 1, fatGrams: 0.2, sugarGrams: 0.1, sodiumMg: 8 };
  }
  if (normalized.includes("telur")) {
    return { caloriesKcal: 75, proteinGrams: 6, carbsGrams: 0.6, fiberGrams: 0, fatGrams: 5, sugarGrams: 0.4, sodiumMg: 70 };
  }
  if (normalized.includes("tempe")) {
    return { caloriesKcal: 160, proteinGrams: 16, carbsGrams: 9, fiberGrams: 4, fatGrams: 8, sugarGrams: 0.5, sodiumMg: 15 };
  }
  if (normalized.includes("tahu")) {
    return { caloriesKcal: 80, proteinGrams: 8, carbsGrams: 2, fiberGrams: 1, fatGrams: 5, sugarGrams: 0.4, sodiumMg: 10 };
  }
  if (normalized.includes("sarden")) {
    return { caloriesKcal: 180, proteinGrams: 16, carbsGrams: 6, fiberGrams: 1, fatGrams: 9, sugarGrams: 3, sodiumMg: 420 };
  }
  if (["kangkung", "kol", "sawi", "tomat"].some((item) => normalized.includes(item))) {
    return { caloriesKcal: 25, proteinGrams: 1.5, carbsGrams: 5, fiberGrams: 2, fatGrams: 0.2, sugarGrams: 2, sodiumMg: 15 };
  }
  if (normalized.includes("kecap")) {
    return { caloriesKcal: 45, proteinGrams: 1, carbsGrams: 9, fiberGrams: 0, fatGrams: 0, sugarGrams: 7, sodiumMg: 600 };
  }
  if (normalized.includes("saus")) {
    return { caloriesKcal: 35, proteinGrams: 0.5, carbsGrams: 8, fiberGrams: 0.5, fatGrams: 0.2, sugarGrams: 4, sodiumMg: 250 };
  }
  if (normalized.includes("cabe") || normalized.includes("bawang")) {
    return { caloriesKcal: 15, proteinGrams: 0.5, carbsGrams: 3, fiberGrams: 1, fatGrams: 0.1, sugarGrams: 1, sodiumMg: 3 };
  }
  if (normalized.includes("kerupuk")) {
    return { caloriesKcal: 100, proteinGrams: 1, carbsGrams: 16, fiberGrams: 0.5, fatGrams: 3.5, sugarGrams: 0.5, sodiumMg: 180 };
  }

  return value;
}

function buildNutritionWarnings(nutrition: Pick<NutritionEstimate, "fatGrams" | "sugarGrams" | "sodiumMg">) {
  const warnings: string[] = [];

  if (nutrition.sodiumMg > 500) {
    warnings.push("Natrium tinggi; kurangi bumbu instan, kecap, atau saus bila perlu.");
  }
  if (nutrition.sugarGrams > 12.5) {
    warnings.push("Gula tinggi; batasi kecap manis atau saus tambahan.");
  }
  if (nutrition.fatGrams > 17) {
    warnings.push("Lemak tinggi; tiriskan minyak dan gunakan porsi lauk secukupnya.");
  }

  return warnings;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
