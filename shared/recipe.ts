import { z } from "zod";

export const standardVibeProfileSchema = z.enum([
  "Anak Kos Survival Mode",
  "Street Food Level Upgrade",
  "Healthy-ish Attempt",
]);

export const sultanVibeProfileSchema = z.enum([
  "Warung Sultan Flex",
  "Fancy Anak Kos Dinner",
  "Protein Royal Treatment",
]);

export const vibeProfileSchema = z.union([
  standardVibeProfileSchema,
  sultanVibeProfileSchema,
]);

export const budgetModeSchema = z.enum(["normal", "sultan"]);

export const pantryMatrixSchema = z.object({
  carbs: z.array(z.string()).default([]),
  proteins: z.array(z.string()).default([]),
  veggies: z.array(z.string()).default([]),
  condiments: z.array(z.string()).default([]),
});

export const generateRecipeRequestSchema = z
  .object({
    sisaDompet: z.number().int().min(0).max(250000),
    budgetMode: budgetModeSchema.default("normal"),
    pantryMatrix: pantryMatrixSchema,
    vibeProfile: vibeProfileSchema,
  })
  .superRefine((request, ctx) => {
    if (request.budgetMode === "normal" && request.sisaDompet > 25000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sisaDompet"],
        message: "Normal mode budget cannot exceed Rp 25.000.",
      });
    }

    if (
      request.budgetMode === "normal" &&
      !standardVibeProfileSchema.safeParse(request.vibeProfile).success
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vibeProfile"],
        message: "Normal mode requires a standard vibe profile.",
      });
    }

    if (
      request.budgetMode === "sultan" &&
      !sultanVibeProfileSchema.safeParse(request.vibeProfile).success
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vibeProfile"],
        message: "Sultan mode requires a Sultan vibe profile.",
      });
    }
  });

export const warungItemSchema = z.object({
  item: z.string().min(1),
  estimatedLocalCost: z.number().min(0),
});

export const recipeIngredientSchema = z
  .object({
    item: z.string().min(1),
    category: z.enum(["carbs", "proteins", "veggies", "condiments", "warung"]),
    amountText: z.string().min(1),
    source: z.enum(["owned", "warung"]),
    estimatedLocalCost: z.number().min(0).optional(),
  })
  .superRefine((ingredient, ctx) => {
    if (ingredient.source === "warung" && ingredient.estimatedLocalCost === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedLocalCost"],
        message: "Warung ingredients must include an estimated local cost.",
      });
    }
  });

export const nutritionEstimateSchema = z.object({
  caloriesText: z.string().min(1),
  proteinText: z.string().min(1),
  carbsText: z.string().min(1),
  fatText: z.string().min(1),
  sodiumText: z.string().min(1),
  sugarText: z.string().min(1),
  caloriesKcal: z.number().min(0),
  proteinGrams: z.number().min(0),
  carbsGrams: z.number().min(0),
  fiberGrams: z.number().min(0),
  fatGrams: z.number().min(0),
  sugarGrams: z.number().min(0),
  sodiumMg: z.number().min(0),
  warnings: z.array(z.string()),
});

export const recipeImageStatusSchema = z.enum(["pending", "ready", "failed"]);

export const recipeStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  phaseTitle: z.string().min(1),
  instruction: z.string().min(1),
  detailInstruction: z.string().min(1).default("Ikuti instruksi utama dengan api sedang dan cek tekstur sebelum lanjut."),
});

export const recipeResponseSchema = z
  .object({
    recipeName: z.string().min(1),
    briefDescription: z.string().default("Resep hemat yang diracik dari bahan tersedia."),
    estimatedCostText: z.string().min(1),
    vibeProfileSummary: z.string().min(1),
    requiresWarungShopping: z.boolean(),
    additionalWarungShopping: z.array(warungItemSchema),
    ingredients: z.array(recipeIngredientSchema).default([]),
    nutritionEstimate: nutritionEstimateSchema,
    imageStatus: recipeImageStatusSchema.optional(),
    imageUrl: z.string().url().optional(),
    imageStoragePath: z.string().min(1).optional(),
    imageModel: z.string().min(1).optional(),
    imagePromptVersion: z.string().min(1).optional(),
    imageGeneratedAt: z.string().min(1).optional(),
    imageError: z.string().min(1).optional(),
    steps: z.array(recipeStepSchema).min(1),
  })
  .superRefine((recipe, ctx) => {
    if (!recipe.requiresWarungShopping && recipe.additionalWarungShopping.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["additionalWarungShopping"],
        message: "Warung shopping must be empty when it is not required.",
      });
    }

    if (recipe.requiresWarungShopping && recipe.additionalWarungShopping.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["additionalWarungShopping"],
        message: "Warung shopping must contain at least one item when required.",
      });
    }

    const warungIngredientTotal = recipe.ingredients
      .filter((ingredient) => ingredient.source === "warung")
      .reduce((total, ingredient) => total + (ingredient.estimatedLocalCost ?? 0), 0);
    const shoppingTotal = recipe.additionalWarungShopping.reduce(
      (total, item) => total + item.estimatedLocalCost,
      0,
    );

    if (recipe.ingredients.some((ingredient) => ingredient.source === "warung") && shoppingTotal > 0) {
      const difference = Math.abs(warungIngredientTotal - shoppingTotal);

      if (difference > 1000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ingredients"],
          message: "Warung ingredient costs should match the shopping list total.",
        });
      }
    }
  });

export type VibeProfile = z.infer<typeof vibeProfileSchema>;
export type StandardVibeProfile = z.infer<typeof standardVibeProfileSchema>;
export type SultanVibeProfile = z.infer<typeof sultanVibeProfileSchema>;
export type BudgetMode = z.infer<typeof budgetModeSchema>;
export type PantryMatrix = z.infer<typeof pantryMatrixSchema>;
export type GenerateRecipeRequest = z.infer<typeof generateRecipeRequestSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type NutritionEstimate = z.infer<typeof nutritionEstimateSchema>;
export type RecipeResponse = z.infer<typeof recipeResponseSchema>;

export const savedRecipeSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  completedAt: z.string().min(1).optional(),
  isFavorite: z.boolean().default(false),
  request: generateRecipeRequestSchema,
  recipe: recipeResponseSchema,
});

export type SavedRecipe = z.infer<typeof savedRecipeSchema>;

export const activeCookSessionSchema = z.object({
  id: z.string().min(1),
  recipeId: z.string().min(1),
  phase: z.enum(["ingredients", "steps"]),
  checkedIngredients: z.record(z.boolean()).default({}),
  checkedSteps: z.record(z.boolean()).default({}),
  currentStepIndex: z.number().int().min(0).default(0),
  isStepExpanded: z.boolean().default(false),
  startedAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type ActiveCookSession = z.infer<typeof activeCookSessionSchema>;

export const ingredientPhotoMimeTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_INLINE_IMAGE_BASE64_LENGTH = Math.ceil((MAX_INLINE_IMAGE_BYTES * 4) / 3) + 16;

export const ingredientPhotoRequestSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_INLINE_IMAGE_BASE64_LENGTH),
  mimeType: ingredientPhotoMimeTypeSchema,
});

export const ingredientInputImageSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_INLINE_IMAGE_BASE64_LENGTH),
  mimeType: ingredientPhotoMimeTypeSchema,
});

export const ingredientInputRequestSchema = z
  .object({
    typedText: z.string().max(1000).optional(),
    images: z.array(ingredientInputImageSchema).max(3),
    selectedPantryMatrix: pantryMatrixSchema,
  })
  .superRefine((request, ctx) => {
    const hasText = Boolean(request.typedText?.trim());
    const hasImages = request.images.length > 0;
    const hasSelectedIngredients = Object.values(request.selectedPantryMatrix).some(
      (items) => items.length > 0,
    );

    if (!hasText && !hasImages && !hasSelectedIngredients) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["typedText"],
        message: "Provide typed text, images, or selected pantry chips.",
      });
    }
  });

export const ingredientAnalysisResponseSchema = z.object({
  pantryMatrix: pantryMatrixSchema,
  detectedSummary: z.string().min(1),
  ignoredItems: z.array(z.string()),
});

export type IngredientPhotoRequest = z.infer<typeof ingredientPhotoRequestSchema>;
export type IngredientInputRequest = z.infer<typeof ingredientInputRequestSchema>;
export type IngredientAnalysisResponse = z.infer<typeof ingredientAnalysisResponseSchema>;

export const firebasePublicConfigSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  appId: z.string().min(1),
  storageBucket: z.string().min(1).optional(),
  messagingSenderId: z.string().min(1).optional(),
  measurementId: z.string().min(1).optional(),
});

export const appConfigResponseSchema = z.object({
  appVersion: z.string().min(1),
  authRequired: z.boolean(),
  firebase: firebasePublicConfigSchema.nullable(),
  aiFeaturesEnabled: z.boolean(),
  recipeDailyLimit: z.number().int().min(1),
});

export const usageTodayResponseSchema = z.object({
  dateKey: z.string().min(1),
  recipeGenerations: z.number().int().min(0),
  recipeDailyLimit: z.number().int().min(1),
  ingredientAnalyses: z.number().int().min(0),
  ingredientDailyLimit: z.number().int().min(1),
  resetAt: z.string().min(1),
  aiFeaturesEnabled: z.boolean(),
});

export const recipeListResponseSchema = z.object({
  recipes: z.array(savedRecipeSchema),
});

export const recipePatchRequestSchema = z.object({
  isFavorite: z.boolean().optional(),
  completedAt: z.string().min(1).nullable().optional(),
});

export const legacyRecipeMigrationRequestSchema = z.object({
  recipes: z.array(savedRecipeSchema).max(100),
});

export type FirebasePublicConfig = z.infer<typeof firebasePublicConfigSchema>;
export type AppConfigResponse = z.infer<typeof appConfigResponseSchema>;
export type UsageTodayResponse = z.infer<typeof usageTodayResponseSchema>;
export type RecipeListResponse = z.infer<typeof recipeListResponseSchema>;
export type RecipePatchRequest = z.infer<typeof recipePatchRequestSchema>;
export type LegacyRecipeMigrationRequest = z.infer<typeof legacyRecipeMigrationRequestSchema>;

export const ingredientAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  propertyOrdering: ["pantryMatrix", "detectedSummary", "ignoredItems"],
  properties: {
    pantryMatrix: {
      type: "object",
      additionalProperties: false,
      propertyOrdering: ["carbs", "proteins", "veggies", "condiments"],
      properties: {
        carbs: {
          type: "array",
          items: { type: "string" },
        },
        proteins: {
          type: "array",
          items: { type: "string" },
        },
        veggies: {
          type: "array",
          items: { type: "string" },
        },
        condiments: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["carbs", "proteins", "veggies", "condiments"],
    },
    detectedSummary: {
      type: "string",
      description: "Short Indonesian summary of detected edible pantry ingredients.",
    },
    ignoredItems: {
      type: "array",
      items: { type: "string" },
      description: "Visible non-food or unusable items ignored by the pantry detector.",
    },
  },
  required: ["pantryMatrix", "detectedSummary", "ignoredItems"],
} as const;

export const recipeJsonSchema = {
  type: "object",
  additionalProperties: false,
  propertyOrdering: [
    "recipeName",
    "briefDescription",
    "estimatedCostText",
    "vibeProfileSummary",
    "requiresWarungShopping",
    "additionalWarungShopping",
    "ingredients",
    "nutritionEstimate",
    "steps",
  ],
  properties: {
    recipeName: {
      type: "string",
      description: "Short Indonesian recipe title.",
    },
    briefDescription: {
      type: "string",
      description: "One short practical description of the dish without jokes.",
    },
    estimatedCostText: {
      type: "string",
      description: "Localized cost summary such as Rp 0 or Rp 8.000.",
    },
    vibeProfileSummary: {
      type: "string",
      description:
        "Empathy-driven, humorous Indonesian youth commentary about the budget state, budget mode, and selected vibe.",
    },
    requiresWarungShopping: {
      type: "boolean",
      description:
        "True only when the user has budget and the recipe benefits from additional warung shopping.",
    },
    additionalWarungShopping: {
      type: "array",
      description: "Short list of optional warung items that fit within the remaining budget.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: {
            type: "string",
            description: "Ingredient name in casual Indonesian.",
          },
          estimatedLocalCost: {
            type: "number",
            description: "Estimated local price in Indonesian rupiah.",
          },
        },
        required: ["item", "estimatedLocalCost"],
        propertyOrdering: ["item", "estimatedLocalCost"],
      },
    },
    ingredients: {
      type: "array",
      minItems: 1,
      description:
        "Complete prep checklist, including owned ingredients and warung shopping ingredients with practical amounts.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: {
            type: "string",
            description: "Ingredient name in Indonesian.",
          },
          category: {
            type: "string",
            enum: ["carbs", "proteins", "veggies", "condiments", "warung"],
          },
          amountText: {
            type: "string",
            description: "How much to use, such as 1 butir, 1 porsi, 2 sdm, or secukupnya.",
          },
          source: {
            type: "string",
            enum: ["owned", "warung"],
          },
          estimatedLocalCost: {
            type: "number",
            description: "Required for source warung; omit for owned ingredients.",
          },
        },
        required: ["item", "category", "amountText", "source"],
        propertyOrdering: ["item", "category", "amountText", "source", "estimatedLocalCost"],
      },
    },
    nutritionEstimate: {
      type: "object",
      additionalProperties: false,
      description: "Estimated nutrition facts for one serving.",
      properties: {
        caloriesText: { type: "string" },
        proteinText: { type: "string" },
        carbsText: { type: "string" },
        fatText: { type: "string" },
        sodiumText: { type: "string" },
        sugarText: { type: "string" },
        caloriesKcal: {
          type: "number",
          description: "Estimated calories per portion in kcal.",
        },
        proteinGrams: {
          type: "number",
          description: "Estimated protein per portion in grams.",
        },
        carbsGrams: {
          type: "number",
          description: "Estimated carbohydrates per portion in grams.",
        },
        fiberGrams: {
          type: "number",
          description: "Estimated fiber per portion in grams.",
        },
        fatGrams: {
          type: "number",
          description: "Estimated total fat per portion in grams.",
        },
        sugarGrams: {
          type: "number",
          description: "Estimated sugar per portion in grams.",
        },
        sodiumMg: {
          type: "number",
          description: "Estimated sodium/natrium per portion in milligrams.",
        },
        warnings: {
          type: "array",
          description: "Warnings when sodium or sugar is likely high.",
          items: { type: "string" },
        },
      },
      required: [
        "caloriesText",
        "proteinText",
        "carbsText",
        "fatText",
        "sodiumText",
        "sugarText",
        "caloriesKcal",
        "proteinGrams",
        "carbsGrams",
        "fiberGrams",
        "fatGrams",
        "sugarGrams",
        "sodiumMg",
        "warnings",
      ],
      propertyOrdering: [
        "caloriesText",
        "proteinText",
        "carbsText",
        "fatText",
        "sodiumText",
        "sugarText",
        "caloriesKcal",
        "proteinGrams",
        "carbsGrams",
        "fiberGrams",
        "fatGrams",
        "sugarGrams",
        "sodiumMg",
        "warnings",
      ],
    },
    steps: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stepNumber: {
            type: "number",
            description: "One-based cooking step number.",
          },
          phaseTitle: {
            type: "string",
            description: "Short milestone name.",
          },
          instruction: {
            type: "string",
            description:
              "Focused Indonesian cooking instruction with practical quantities and minimal slang.",
          },
          detailInstruction: {
            type: "string",
            description:
              "Expandable cooking detail with heat level, texture target, timing, and ingredient amounts.",
          },
        },
        required: ["stepNumber", "phaseTitle", "instruction", "detailInstruction"],
        propertyOrdering: ["stepNumber", "phaseTitle", "instruction", "detailInstruction"],
      },
    },
  },
  required: [
    "recipeName",
    "briefDescription",
    "estimatedCostText",
    "vibeProfileSummary",
    "requiresWarungShopping",
    "additionalWarungShopping",
    "ingredients",
    "nutritionEstimate",
    "steps",
  ],
} as const;
