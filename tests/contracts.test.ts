import { describe, expect, it } from "vitest";
import {
  FALLBACK_IMAGE_MODEL,
  FIXED_IMAGE_MODEL,
  FIXED_VERTEX_MODEL,
  VERTEX_API_KEY_ENV,
} from "../shared/geminiConfig";
import {
  generateRecipeRequestSchema,
  ingredientAnalysisResponseSchema,
  ingredientInputRequestSchema,
  ingredientPhotoRequestSchema,
  appConfigResponseSchema,
  usageTodayResponseSchema,
  recipeResponseSchema,
} from "../shared/recipe";
import {
  parseStructuredIngredientAnalysis,
  parseStructuredRecipe,
} from "../shared/recipeParsing";
import {
  classifyFatLevel,
  classifyNutriLevel,
  classifySodiumLevel,
  classifySugarLevel,
} from "../shared/nutrition";

const validRecipe = {
  recipeName: "Nasi Kecap Penyelamat",
  briefDescription: "Nasi sisa dibumbui kecap dan cabe untuk satu porsi cepat.",
  estimatedCostText: "Rp 0",
  vibeProfileSummary: "Tanggal tua boleh tipis, tapi rasa masih bisa ngangkat mood.",
  requiresWarungShopping: false,
  additionalWarungShopping: [],
  ingredients: [
    {
      item: "Nasi sisa",
      category: "carbs",
      amountText: "1 piring",
      source: "owned",
    },
    {
      item: "Kecap",
      category: "condiments",
      amountText: "1 sdm",
      source: "owned",
    },
  ],
  nutritionEstimate: {
    caloriesText: "380 kkal",
    proteinText: "7 g",
    carbsText: "72 g",
    fatText: "6 g",
    sodiumText: "sedang",
    sugarText: "sedang",
    caloriesKcal: 380,
    proteinGrams: 7,
    carbsGrams: 72,
    fiberGrams: 2,
    fatGrams: 6,
    sugarGrams: 7,
    sodiumMg: 240,
    warnings: ["Gula bisa naik kalau kecap ditambah terlalu banyak."],
  },
  steps: [
    {
      stepNumber: 1,
      phaseTitle: "Panaskan",
      instruction: "Panaskan nasi sisa sebentar sampai pulih dari dinginnya kulkas.",
      detailInstruction: "Panaskan 1 piring nasi di wajan selama 2 menit dengan api sedang.",
    },
    {
      stepNumber: 2,
      phaseTitle: "Bumbui",
      instruction: "Aduk dengan kecap dan cabe sampai wangi sederhana tapi niat.",
      detailInstruction: "Masukkan 1 sdm kecap dan cabe secukupnya, lalu aduk 1 menit.",
    },
  ],
};

describe("recipe contracts", () => {
  it("keeps the server model and key source fixed", () => {
    expect(VERTEX_API_KEY_ENV).toBe("VERTEX_API_KEY");
    expect(FIXED_VERTEX_MODEL).toBe("gemini-3.1-flash-lite");
    expect(FIXED_IMAGE_MODEL).toBe("gemini-3.1-flash-image");
    expect(FALLBACK_IMAGE_MODEL).toBe("gemini-2.5-flash-image");
  });

  it("validates public release config and daily usage contracts", () => {
    expect(
      appConfigResponseSchema.safeParse({
        appVersion: "1.0.0",
        authRequired: true,
        firebase: {
          apiKey: "public-web-key",
          authDomain: "bokeklab.firebaseapp.com",
          projectId: "bokeklab",
          appId: "app-id",
        },
        aiFeaturesEnabled: true,
        recipeDailyLimit: 10,
      }).success,
    ).toBe(true);

    expect(
      usageTodayResponseSchema.safeParse({
        dateKey: "20260529",
        recipeGenerations: 3,
        recipeDailyLimit: 10,
        ingredientAnalyses: 4,
        ingredientDailyLimit: 30,
        resetAt: "2026-05-29T17:00:00.000Z",
        aiFeaturesEnabled: true,
      }).success,
    ).toBe(true);
  });

  it("validates the generation request bounds", () => {
    expect(
      generateRecipeRequestSchema.safeParse({
        sisaDompet: 26000,
        budgetMode: "normal",
        pantryMatrix: { carbs: [], proteins: [], veggies: [], condiments: [] },
        vibeProfile: "Anak Kos Survival Mode",
      }).success,
    ).toBe(false);

    expect(
      generateRecipeRequestSchema.safeParse({
        sisaDompet: 250000,
        budgetMode: "sultan",
        pantryMatrix: { carbs: ["Nasi"], proteins: ["Ayam"], veggies: [], condiments: [] },
        vibeProfile: "Warung Sultan Flex",
      }).success,
    ).toBe(true);

    expect(
      generateRecipeRequestSchema.safeParse({
        sisaDompet: 100000,
        budgetMode: "sultan",
        pantryMatrix: { carbs: ["Nasi"], proteins: [], veggies: [], condiments: [] },
        vibeProfile: "Healthy-ish Attempt",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid minified Gemini JSON payload", () => {
    const parsed = parseStructuredRecipe(JSON.stringify(validRecipe));
    expect(parsed.recipeName).toBe("Nasi Kecap Penyelamat");
    expect(parsed.ingredients[0].amountText).toBe("1 piring");
    expect(parsed.nutritionEstimate.caloriesKcal).toBe(380);
    expect(parsed.nutritionEstimate.warnings[0]).toContain("Gula");

    const wrapped = parseStructuredRecipe(JSON.stringify({ recipe: validRecipe }));
    expect(wrapped.steps).toHaveLength(2);
  });

  it("requires numeric nutrition estimates for new recipe responses", () => {
    const incompleteNutrition = {
      ...validRecipe,
      nutritionEstimate: {
        caloriesText: "380 kkal",
        proteinText: "7 g",
        carbsText: "72 g",
        fatText: "6 g",
        sodiumText: "sedang",
        sugarText: "sedang",
        warnings: [],
      },
    };

    expect(recipeResponseSchema.safeParse(incompleteNutrition).success).toBe(false);
  });

  it("normalizes older Gemini recipe payloads that omit nutrition estimates", () => {
    const legacyModelPayload = { ...validRecipe };
    delete (legacyModelPayload as Partial<typeof validRecipe>).nutritionEstimate;

    const parsed = parseStructuredRecipe(JSON.stringify(legacyModelPayload));

    expect(parsed.nutritionEstimate.caloriesKcal).toBeGreaterThan(0);
    expect(parsed.nutritionEstimate.sodiumMg).toBeGreaterThan(500);
    expect(parsed.nutritionEstimate.warnings[0]).toContain("Natrium");
  });

  it("replaces generic recipe descriptions with ingredient-specific copy", () => {
    const parsed = parseStructuredRecipe(
      JSON.stringify({
        ...validRecipe,
        briefDescription: "Resep hemat yang diracik dari bahan tersedia.",
      }),
    );

    expect(parsed.briefDescription).toContain("Nasi Kecap Penyelamat");
    expect(parsed.briefDescription).toContain("Nasi sisa");
    expect(parsed.briefDescription).not.toBe("Resep hemat yang diracik dari bahan tersedia.");
  });

  it("reconciles implausibly low model nutrition estimates against pantry baselines", () => {
    const parsed = parseStructuredRecipe(
      JSON.stringify({
        ...validRecipe,
        ingredients: [
          {
            item: "Telur",
            category: "proteins",
            amountText: "1 butir",
            source: "warung",
            estimatedLocalCost: 2000,
          },
        ],
        requiresWarungShopping: true,
        additionalWarungShopping: [{ item: "Telur", estimatedLocalCost: 2000 }],
        nutritionEstimate: {
          ...validRecipe.nutritionEstimate,
          caloriesKcal: 25,
          proteinGrams: 1.5,
          carbsGrams: 0,
          fiberGrams: 0,
          fatGrams: 0.2,
          sugarGrams: 0,
          sodiumMg: 15,
        },
      }),
    );

    expect(parsed.nutritionEstimate.proteinGrams).toBeGreaterThanOrEqual(6);
    expect(parsed.nutritionEstimate.caloriesKcal).toBeGreaterThanOrEqual(75);
    expect(parsed.nutritionEstimate.proteinText).toBe("6 g");
  });

  it("classifies NutriLevel from per-portion sugar, sodium, and fat", () => {
    expect(classifySugarLevel(0.5)).toBe("A");
    expect(classifySugarLevel(6)).toBe("B");
    expect(classifySugarLevel(12.5)).toBe("C");
    expect(classifySugarLevel(12.6)).toBe("D");
    expect(classifySodiumLevel(120)).toBe("B");
    expect(classifyFatLevel(17.1)).toBe("D");
    expect(classifyNutriLevel(validRecipe.nutritionEstimate).level).toBe("C");
  });

  it("rejects markdown and invalid warung logic", () => {
    expect(() =>
      parseStructuredRecipe(`\`\`\`json\n${JSON.stringify(validRecipe)}\n\`\`\``),
    ).toThrow(/markdown/);

    expect(
      recipeResponseSchema.safeParse({
        ...validRecipe,
        requiresWarungShopping: true,
      }).success,
    ).toBe(false);

    expect(
      recipeResponseSchema.safeParse({
        ...validRecipe,
        additionalWarungShopping: [{ item: "Daun bawang", estimatedLocalCost: 2000 }],
      }).success,
    ).toBe(false);
  });

  it("validates photo analysis contracts and rejects non-json analysis text", () => {
    expect(
      ingredientPhotoRequestSchema.safeParse({
        imageBase64: "abc123",
        mimeType: "image/jpeg",
      }).success,
    ).toBe(true);

    expect(
      ingredientPhotoRequestSchema.safeParse({
        imageBase64: "abc123",
        mimeType: "image/gif",
      }).success,
    ).toBe(false);

    const validAnalysis = {
      pantryMatrix: {
        carbs: ["Nasi"],
        proteins: ["Telur"],
        veggies: ["Kangkung"],
        condiments: ["Cabe"],
      },
      detectedSummary: "Terdeteksi bahan warung yang masih bisa dipakai.",
      ignoredItems: ["Piring"],
    };

    expect(ingredientAnalysisResponseSchema.parse(validAnalysis).pantryMatrix.proteins).toEqual([
      "Telur",
    ]);
    expect(parseStructuredIngredientAnalysis(JSON.stringify(validAnalysis)).ignoredItems).toEqual([
      "Piring",
    ]);
    expect(() => parseStructuredIngredientAnalysis("bukan json")).toThrow(/non-JSON/);
  });

  it("validates combined typed-text and image analysis input", () => {
    expect(
      ingredientInputRequestSchema.safeParse({
        typedText: "nasi sisa, telur, cabe",
        images: [
          {
            imageBase64: "abc123",
            mimeType: "image/jpeg",
          },
        ],
        selectedPantryMatrix: {
          carbs: ["Indomie"],
          proteins: [],
          veggies: [],
          condiments: [],
        },
      }).success,
    ).toBe(true);

    expect(
      ingredientInputRequestSchema.safeParse({
        typedText: "",
        images: [],
        selectedPantryMatrix: {
          carbs: [],
          proteins: [],
          veggies: [],
          condiments: [],
        },
      }).success,
    ).toBe(false);

    expect(
      ingredientInputRequestSchema.safeParse({
        typedText: "telur",
        images: new Array(4).fill({ imageBase64: "abc123", mimeType: "image/jpeg" }),
        selectedPantryMatrix: {
          carbs: [],
          proteins: [],
          veggies: [],
          condiments: [],
        },
      }).success,
    ).toBe(false);
  });
});
