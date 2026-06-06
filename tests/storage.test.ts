import { describe, expect, it } from "vitest";
import type { SavedRecipe } from "../shared/recipe";
import {
  ACTIVE_COOK_SESSION_KEY,
  APP_SETTINGS_KEY,
  LATE_MONTH_PLAN_KEY,
  PANTRY_MEMORY_KEY,
  SAVED_RECIPES_KEY,
  clearActiveCookSession,
  readLateMonthPlan,
  readPantryMemory,
  markSavedRecipeComplete,
  readAppSettings,
  readActiveCookSession,
  readSavedRecipes,
  removeSavedRecipe,
  upsertSavedRecipe,
  writeActiveCookSession,
  writeAppSettings,
  writeLateMonthPlan,
  writePantryMemory,
  writeSavedRecipes,
} from "../src/lib/storage";

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

const savedRecipe: SavedRecipe = {
  id: "saved-1",
  createdAt: "2026-05-25T10:00:00.000Z",
  isFavorite: false,
  request: {
    sisaDompet: 0,
    budgetMode: "normal",
    pantryMatrix: {
      carbs: ["Indomie"],
      proteins: ["Telur"],
      veggies: [],
      condiments: ["Kecap"],
    },
    vibeProfile: "Anak Kos Survival Mode",
  },
  recipe: {
    recipeName: "Indomie Telur Tanggal Tua",
    briefDescription: "Indomie telur praktis untuk satu porsi.",
    estimatedCostText: "Rp 0",
    vibeProfileSummary: "Dompet aman, martabat juga masih bisa diajak kerja sama.",
    requiresWarungShopping: false,
    additionalWarungShopping: [],
    ingredients: [
      {
        item: "Indomie",
        category: "carbs",
        amountText: "1 bungkus",
        source: "owned",
      },
      {
        item: "Telur",
        category: "proteins",
        amountText: "1 butir",
        source: "owned",
      },
    ],
    nutritionEstimate: {
      caloriesText: "520 kkal",
      proteinText: "16 g",
      carbsText: "62 g",
      fatText: "21 g",
      sodiumText: "980 mg",
      sugarText: "7.4 g",
      caloriesKcal: 520,
      proteinGrams: 16,
      carbsGrams: 62,
      fiberGrams: 3,
      fatGrams: 21,
      sugarGrams: 7.4,
      sodiumMg: 980,
      warnings: ["Sodium cukup tinggi karena bumbu instan."],
    },
    steps: [
      {
        stepNumber: 1,
        phaseTitle: "Rebus",
        instruction: "Rebus mie sampai lentur, jangan kelamaan biar tidak sedih.",
        detailInstruction: "Rebus 1 bungkus mie selama 2 menit, lalu masukkan 1 butir telur.",
      },
    ],
  },
};

describe("saved recipe storage", () => {
  it("serializes and validates saved recipes", () => {
    const storage = createMemoryStorage();

    writeSavedRecipes([savedRecipe], storage);

    expect(storage.getItem(SAVED_RECIPES_KEY)).toContain("Indomie Telur");
    expect(readSavedRecipes(storage)).toEqual([
      {
        ...savedRecipe,
        recipe: {
          ...savedRecipe.recipe,
          imageStatus: "pending",
        },
      },
    ]);
  });

  it("drops corrupted localStorage values", () => {
    const storage = createMemoryStorage();
    storage.setItem(SAVED_RECIPES_KEY, "{broken");

    expect(readSavedRecipes(storage)).toEqual([]);
  });

  it("migrates old saved recipes with defaults for budgetMode and cooking fields", () => {
    const storage = createMemoryStorage();
    const oldSavedRecipe = {
      ...savedRecipe,
      request: {
        sisaDompet: 0,
        pantryMatrix: savedRecipe.request.pantryMatrix,
        vibeProfile: "Anak Kos Survival Mode",
      },
      recipe: {
        recipeName: savedRecipe.recipe.recipeName,
        estimatedCostText: savedRecipe.recipe.estimatedCostText,
        vibeProfileSummary: savedRecipe.recipe.vibeProfileSummary,
        requiresWarungShopping: false,
        additionalWarungShopping: [],
        steps: [
          {
            stepNumber: 1,
            phaseTitle: "Rebus",
            instruction: "Rebus mie sampai matang.",
          },
        ],
      },
    };

    storage.setItem(SAVED_RECIPES_KEY, JSON.stringify([oldSavedRecipe]));

    const migrated = readSavedRecipes(storage)[0];

    expect(migrated.request.budgetMode).toBe("normal");
    expect(migrated.recipe.briefDescription).toBeTruthy();
    expect(migrated.recipe.ingredients).toHaveLength(3);
    expect(migrated.recipe.nutritionEstimate.caloriesKcal).toBeGreaterThan(0);
    expect(migrated.recipe.nutritionEstimate.sodiumMg).toBeGreaterThan(500);
    expect(migrated.recipe.steps[0].detailInstruction).toContain("Rebus");
  });

  it("upserts and removes recipes immutably", () => {
    const inserted = upsertSavedRecipe([], savedRecipe);
    const updated = upsertSavedRecipe(inserted, {
      ...savedRecipe,
      recipe: { ...savedRecipe.recipe, recipeName: "Updated" },
    });

    expect(inserted).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(updated[0].recipe.recipeName).toBe("Updated");
    expect(removeSavedRecipe(updated, "saved-1")).toEqual([]);
  });

  it("persists active cooking sessions and marks recipes complete", () => {
    const storage = createMemoryStorage();
    const session = {
      id: "cook-1",
      recipeId: "saved-1",
      phase: "ingredients" as const,
      checkedIngredients: { "0-owned-carbs-Indomie": true },
      checkedSteps: {},
      currentStepIndex: 0,
      isStepExpanded: false,
      startedAt: "2026-05-25T10:00:00.000Z",
      updatedAt: "2026-05-25T10:01:00.000Z",
    };

    writeActiveCookSession(session, storage);

    expect(storage.getItem(ACTIVE_COOK_SESSION_KEY)).toContain("cook-1");
    expect(readActiveCookSession(storage)).toEqual(session);

    const completed = markSavedRecipeComplete(
      [savedRecipe],
      "saved-1",
      "2026-05-25T10:20:00.000Z",
    );

    expect(completed[0].completedAt).toBe("2026-05-25T10:20:00.000Z");

    clearActiveCookSession(storage);
    expect(readActiveCookSession(storage)).toBeNull();
  });

  it("persists app settings with a safe default", () => {
    const storage = createMemoryStorage();

    expect(readAppSettings(storage)).toEqual({ darkMode: false });

    writeAppSettings({ darkMode: true }, storage);

    expect(storage.getItem(APP_SETTINGS_KEY)).toContain("darkMode");
    expect(readAppSettings(storage)).toEqual({ darkMode: true });
  });

  it("persists pantry memory and late-month planning preferences", () => {
    const storage = createMemoryStorage();

    expect(readPantryMemory(storage)).toEqual({
      enabled: true,
      staples: { carbs: [], proteins: [], veggies: [], condiments: [] },
    });
    expect(readLateMonthPlan(storage)).toEqual({ enabled: false, days: 5, budget: 30000 });

    writePantryMemory(
      {
        enabled: true,
        staples: { carbs: ["Nasi"], proteins: ["Telur"], veggies: [], condiments: ["Kecap"] },
      },
      storage,
    );
    writeLateMonthPlan({ enabled: true, days: 7, budget: 49000 }, storage);

    expect(storage.getItem(PANTRY_MEMORY_KEY)).toContain("Telur");
    expect(storage.getItem(LATE_MONTH_PLAN_KEY)).toContain("49000");
    expect(readPantryMemory(storage).staples.proteins).toEqual(["Telur"]);
    expect(readLateMonthPlan(storage)).toEqual({ enabled: true, days: 7, budget: 49000 });
  });
});
