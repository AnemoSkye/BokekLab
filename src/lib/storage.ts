import { z } from "zod";
import {
  type ActiveCookSession,
  type GenerateRecipeRequest,
  type RecipeIngredient,
  type RecipeResponse,
  type SavedRecipe,
  activeCookSessionSchema,
  savedRecipeSchema,
} from "../../shared/recipe";
import { parseStructuredRecipe } from "../../shared/recipeParsing";

export const SAVED_RECIPES_KEY = "bokeklab.savedRecipes.v1";
export const ACTIVE_COOK_SESSION_KEY = "bokeklab.activeCookSession.v1";
export const APP_SETTINGS_KEY = "bokeklab.settings.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const savedRecipeListSchema = z.array(savedRecipeSchema);
const appSettingsSchema = z.object({
  darkMode: z.boolean().default(false),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

const CATEGORY_LABELS = {
  carbs: "karbohidrat",
  proteins: "protein",
  veggies: "sayur",
  condiments: "bumbu",
} as const;

export function readSavedRecipes(storage: StorageLike = window.localStorage): SavedRecipe[] {
  const raw = storage.getItem(SAVED_RECIPES_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return savedRecipeListSchema
      .parse(parsed.map(migrateSavedRecipeCandidate))
      .map((recipe) => normalizeSavedRecipe(recipe));
  } catch {
    return [];
  }
}

export function writeSavedRecipes(
  recipes: SavedRecipe[],
  storage: StorageLike = window.localStorage,
) {
  storage.setItem(SAVED_RECIPES_KEY, JSON.stringify(recipes));
}

export function clearSavedRecipes(storage: StorageLike = window.localStorage) {
  storage.removeItem(SAVED_RECIPES_KEY);
}

export function removeSavedRecipe(
  recipes: SavedRecipe[],
  recipeId: string,
): SavedRecipe[] {
  return recipes.filter((recipe) => recipe.id !== recipeId);
}

export function upsertSavedRecipe(
  recipes: SavedRecipe[],
  nextRecipe: SavedRecipe,
): SavedRecipe[] {
  const existingIndex = recipes.findIndex((recipe) => recipe.id === nextRecipe.id);

  if (existingIndex === -1) {
    return [nextRecipe, ...recipes];
  }

  return recipes.map((recipe, index) => (index === existingIndex ? nextRecipe : recipe));
}

export function markSavedRecipeComplete(
  recipes: SavedRecipe[],
  recipeId: string,
  completedAt: string,
): SavedRecipe[] {
  return recipes.map((recipe) =>
    recipe.id === recipeId ? { ...recipe, completedAt } : recipe,
  );
}

export function normalizeSavedRecipe(savedRecipe: SavedRecipe): SavedRecipe {
  return {
    ...savedRecipe,
    recipe: normalizeRecipeForRequest(savedRecipe.recipe, savedRecipe.request),
  };
}

export function normalizeRecipeForRequest(
  recipe: RecipeResponse,
  request: GenerateRecipeRequest,
): RecipeResponse {
  const fallbackIngredients = createFallbackIngredients(request, recipe);
  const steps = recipe.steps.map((step) => ({
    ...step,
    detailInstruction: normalizeStepDetail(step.instruction, step.detailInstruction),
  }));

  return {
    ...recipe,
    briefDescription: normalizeBriefDescription(recipe, fallbackIngredients),
    imageStatus: recipe.imageStatus ?? "pending",
    ingredients: (recipe.ingredients.length > 0 ? recipe.ingredients : fallbackIngredients).map(
      normalizeIngredientAmount,
    ),
    nutritionEstimate: {
      caloriesText: recipe.nutritionEstimate.caloriesText || "Estimasi belum tersedia",
      proteinText: recipe.nutritionEstimate.proteinText || "Estimasi belum tersedia",
      carbsText: recipe.nutritionEstimate.carbsText || "Estimasi belum tersedia",
      fatText: recipe.nutritionEstimate.fatText || "Estimasi belum tersedia",
      sodiumText: recipe.nutritionEstimate.sodiumText || "Estimasi belum tersedia",
      sugarText: recipe.nutritionEstimate.sugarText || "Estimasi belum tersedia",
      caloriesKcal: recipe.nutritionEstimate.caloriesKcal,
      proteinGrams: recipe.nutritionEstimate.proteinGrams,
      carbsGrams: recipe.nutritionEstimate.carbsGrams,
      fiberGrams: recipe.nutritionEstimate.fiberGrams,
      fatGrams: recipe.nutritionEstimate.fatGrams,
      sugarGrams: recipe.nutritionEstimate.sugarGrams,
      sodiumMg: recipe.nutritionEstimate.sodiumMg,
      warnings: recipe.nutritionEstimate.warnings ?? [],
    },
    steps,
  };
}

function normalizeBriefDescription(
  recipe: RecipeResponse,
  fallbackIngredients: RecipeIngredient[],
): string {
  const raw = recipe.briefDescription?.trim() ?? "";

  if (raw && !isGenericBriefDescription(raw)) {
    return raw;
  }

  const ingredients = (recipe.ingredients.length > 0 ? recipe.ingredients : fallbackIngredients)
    .map((ingredient) => ingredient.item.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (ingredients.length > 0) {
    return `${recipe.recipeName} memakai ${joinIndonesianList(ingredients)} sebagai bahan utama untuk satu porsi praktis.`;
  }

  return recipe.vibeProfileSummary || `${recipe.recipeName} dirancang sebagai satu porsi praktis dengan bahan yang tersedia.`;
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

function joinIndonesianList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} dan ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, dan ${items[items.length - 1]}`;
}

function normalizeIngredientAmount(ingredient: RecipeIngredient): RecipeIngredient {
  const amount = ingredient.amountText.trim().toLowerCase();

  if (
    amount &&
    !amount.includes("secukupnya") &&
    !amount.includes("sesuai kebutuhan") &&
    !amount.includes("seperlunya")
  ) {
    return ingredient;
  }

  if (ingredient.category === "warung") {
    return {
      ...ingredient,
      amountText: fallbackWarungAmountText(ingredient.item),
    };
  }

  return {
    ...ingredient,
    amountText: fallbackAmountText(ingredient.item, ingredient.category),
  };
}

function migrateSavedRecipeCandidate(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }

  const savedRecipe = candidate as Record<string, unknown>;
  const recipe = savedRecipe.recipe;

  if (!recipe || typeof recipe !== "object") {
    return candidate;
  }

  const recipeRecord = recipe as Record<string, unknown>;
  const nutrition =
    recipeRecord.nutritionEstimate && typeof recipeRecord.nutritionEstimate === "object"
      ? { ...(recipeRecord.nutritionEstimate as Record<string, unknown>) }
      : {};
  const hadIncompleteNutrition = [
    "caloriesKcal",
    "proteinGrams",
    "carbsGrams",
    "fiberGrams",
    "fatGrams",
    "sugarGrams",
    "sodiumMg",
  ].some((key) => typeof nutrition[key] !== "number");

  const warnings = Array.isArray(nutrition.warnings) ? nutrition.warnings : [];

  const migratedRecipe: Record<string, unknown> = {
    ...recipeRecord,
    nutritionEstimate: {
      caloriesText: nutrition.caloriesText || "Estimasi belum tersedia",
      proteinText: nutrition.proteinText || "Estimasi belum tersedia",
      carbsText: nutrition.carbsText || "Estimasi belum tersedia",
      fatText: nutrition.fatText || "Estimasi belum tersedia",
      sodiumText: nutrition.sodiumText || "Estimasi belum tersedia",
      sugarText: nutrition.sugarText || "Estimasi belum tersedia",
      caloriesKcal: typeof nutrition.caloriesKcal === "number" ? nutrition.caloriesKcal : readNumericText(nutrition.caloriesText),
      proteinGrams: typeof nutrition.proteinGrams === "number" ? nutrition.proteinGrams : readNumericText(nutrition.proteinText),
      carbsGrams: typeof nutrition.carbsGrams === "number" ? nutrition.carbsGrams : readNumericText(nutrition.carbsText),
      fiberGrams: typeof nutrition.fiberGrams === "number" ? nutrition.fiberGrams : 0,
      fatGrams: typeof nutrition.fatGrams === "number" ? nutrition.fatGrams : readNumericText(nutrition.fatText),
      sugarGrams: typeof nutrition.sugarGrams === "number" ? nutrition.sugarGrams : readNumericText(nutrition.sugarText),
      sodiumMg: typeof nutrition.sodiumMg === "number" ? nutrition.sodiumMg : readNumericText(nutrition.sodiumText),
      warnings: hadIncompleteNutrition
        ? Array.from(new Set([...warnings, "Estimasi nutrisi lama belum lengkap; angka ditampilkan sebagai perkiraan aman."]))
        : warnings,
    },
  };
  const requestRecord =
    savedRecipe.request && typeof savedRecipe.request === "object"
      ? (savedRecipe.request as Record<string, unknown>)
      : null;

  if (!Array.isArray(migratedRecipe.ingredients) || migratedRecipe.ingredients.length === 0) {
    migratedRecipe.ingredients = createFallbackIngredientRecords(requestRecord, migratedRecipe);
  }

  return {
    ...savedRecipe,
    recipe: parseStructuredRecipe(JSON.stringify(migratedRecipe)),
  };
}

function createFallbackIngredientRecords(
  request: Record<string, unknown> | null,
  recipe: Record<string, unknown>,
) {
  const pantryMatrix =
    request?.pantryMatrix && typeof request.pantryMatrix === "object"
      ? (request.pantryMatrix as Record<string, unknown>)
      : {};
  const ownedIngredients = (Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>)
    .flatMap((category) => {
      const items = pantryMatrix[category];

      return Array.isArray(items)
        ? items
            .filter((item): item is string => typeof item === "string")
            .map((item) => ({
              item,
              category,
              amountText: fallbackAmountText(item, category),
              source: "owned",
            }))
        : [];
    });
  const shopping = Array.isArray(recipe.additionalWarungShopping)
    ? recipe.additionalWarungShopping
    : [];
  const warungIngredients = shopping
    .filter((item): item is { item: string; estimatedLocalCost: number } =>
      Boolean(
        item &&
          typeof item === "object" &&
          "item" in item &&
          typeof (item as Record<string, unknown>).item === "string" &&
          "estimatedLocalCost" in item &&
          typeof (item as Record<string, unknown>).estimatedLocalCost === "number",
      ),
    )
    .map((item) => ({
      item: item.item,
      category: "warung",
      amountText: "sesuai kebutuhan resep",
      source: "warung",
      estimatedLocalCost: item.estimatedLocalCost,
    }));

  return [...ownedIngredients, ...warungIngredients];
}

function readNumericText(value: unknown) {
  if (typeof value !== "string") {
    return 0;
  }

  const match = value.match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : 0;
}

function normalizeStepDetail(instruction: string, detailInstruction: string) {
  const detail = detailInstruction?.trim();

  if (detail && !detail.startsWith("Ikuti instruksi utama")) {
    return detail;
  }

  return `${instruction} Gunakan api sedang, masukkan bahan bertahap, dan cek rasa sebelum lanjut.`;
}

function createFallbackIngredients(
  request: GenerateRecipeRequest,
  recipe: RecipeResponse,
): RecipeIngredient[] {
  const ownedIngredients = (Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>)
    .flatMap((category) =>
      request.pantryMatrix[category].map((item) => ({
        item,
        category,
        amountText: fallbackAmountText(item, category),
        source: "owned" as const,
      })),
    );
  const warungIngredients = recipe.additionalWarungShopping.map((item) => ({
    item: item.item,
    category: "warung" as const,
    amountText: "sesuai kebutuhan resep",
    source: "warung" as const,
    estimatedLocalCost: item.estimatedLocalCost,
  }));

  return [...ownedIngredients, ...warungIngredients];
}

function fallbackAmountText(item: string, category: keyof typeof CATEGORY_LABELS) {
  const normalized = item.toLowerCase();

  if (normalized.includes("indomie") || normalized.includes("mie instan")) return "1 bungkus";
  if (normalized.includes("nasi")) return "1 piring sedang (150 g)";
  if (normalized.includes("roti")) return "2 lembar";
  if (normalized.includes("bihun")) return "1 keping kecil (60 g)";
  if (normalized.includes("telur")) return "1 butir";
  if (normalized.includes("tempe")) return "100 g";
  if (normalized.includes("tahu")) return "2 potong sedang (120 g)";
  if (normalized.includes("sarden")) return "1/2 kaleng kecil";
  if (normalized.includes("kangkung")) return "1 genggam besar (75 g)";
  if (normalized.includes("kol")) return "1 genggam iris (60 g)";
  if (normalized.includes("sawi")) return "1 genggam besar (75 g)";
  if (normalized.includes("tomat")) return "1 buah sedang";
  if (normalized.includes("cabe")) return "2-4 buah";
  if (normalized.includes("kecap")) return "1 sdm";
  if (normalized.includes("saus")) return "1 sdm";
  if (normalized.includes("bawang")) return "2 siung";

  return {
    carbs: "1 porsi kecil",
    proteins: "100 g",
    veggies: "1 genggam sedang",
    condiments: "1 sdt",
  }[category];
}

function fallbackWarungAmountText(item: string) {
  const normalized = item.toLowerCase();

  if (normalized.includes("telur")) return "1 butir";
  if (normalized.includes("kerupuk")) return "1 genggam kecil (20 g)";
  if (normalized.includes("ayam")) return "100 g";
  if (normalized.includes("sayur")) return "1 genggam sedang";
  if (normalized.includes("bumbu")) return "1 sdt";

  return "1 porsi kecil";
}

export function readActiveCookSession(
  storage: StorageLike = window.localStorage,
): ActiveCookSession | null {
  const raw = storage.getItem(ACTIVE_COOK_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return activeCookSessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeActiveCookSession(
  session: ActiveCookSession,
  storage: StorageLike = window.localStorage,
) {
  storage.setItem(ACTIVE_COOK_SESSION_KEY, JSON.stringify(session));
}

export function clearActiveCookSession(storage: StorageLike = window.localStorage) {
  storage.removeItem(ACTIVE_COOK_SESSION_KEY);
}

export function readAppSettings(storage: StorageLike = window.localStorage): AppSettings {
  const raw = storage.getItem(APP_SETTINGS_KEY);

  if (!raw) {
    return { darkMode: false };
  }

  try {
    return appSettingsSchema.parse(JSON.parse(raw));
  } catch {
    return { darkMode: false };
  }
}

export function writeAppSettings(
  settings: AppSettings,
  storage: StorageLike = window.localStorage,
) {
  storage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}
