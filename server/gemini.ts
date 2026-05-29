import { GoogleGenAI } from "@google/genai";
import {
  type GenerateRecipeRequest,
  type IngredientAnalysisResponse,
  type IngredientInputRequest,
  type IngredientPhotoRequest,
  type RecipeResponse,
  ingredientAnalysisJsonSchema,
  recipeJsonSchema,
} from "../shared/recipe";
import { FIXED_VERTEX_MODEL, VERTEX_API_KEY_ENV } from "../shared/geminiConfig";
import { FIXED_IMAGE_MODEL } from "../shared/geminiConfig";
import {
  parseStructuredIngredientAnalysis,
  parseStructuredRecipe,
} from "../shared/recipeParsing";

type TextCarrier = {
  text?: string | (() => string);
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
};

type ImageCarrier = TextCarrier;

function extractResponseText(response: unknown) {
  const carrier = response as TextCarrier;

  if (typeof carrier.text === "function") {
    return carrier.text();
  }

  if (typeof carrier.text === "string") {
    return carrier.text;
  }

  const partText = carrier.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => typeof text === "string")
    .join("");

  return partText ?? "";
}

function buildPrompt(payload: GenerateRecipeRequest) {
  const selectedIngredients = [
    ...payload.pantryMatrix.carbs.map((item) => `carb:${item}`),
    ...payload.pantryMatrix.proteins.map((item) => `protein:${item}`),
    ...payload.pantryMatrix.veggies.map((item) => `veggie:${item}`),
    ...payload.pantryMatrix.condiments.map((item) => `condiment:${item}`),
  ];

  return [
    "You are BokekLab, a hyper-localized behavioral budget catalyst for Indonesian youth in late-month cash constraints.",
    "Treat low-resource food limits as a creative playground, not a pity story.",
    "Return only one flawless minified JSON object that matches the provided schema. Do not include markdown, code fences, prose wrappers, comments, or extra keys.",
    "Use casual Indonesian phrasing. Keep the humor empathetic and youth-coded without insulting the user.",
    "If sisaDompet is 0, requiresWarungShopping must be false and additionalWarungShopping must be an empty array.",
    "If budgetMode is sultan, recommend a more abundant, celebratory, still locally plausible recipe.",
    "If requiresWarungShopping is true, keep the sum of additionalWarungShopping estimatedLocalCost within sisaDompet.",
    "Use ingredients already owned as the base. Additional warung items should be optional boosts, not the entire recipe.",
    "briefDescription must be unique to the recipe, mention one or two defining ingredients or techniques, and never use generic placeholder copy like 'Resep hemat yang diracik dari bahan tersedia.'",
    "Return a complete ingredients array that includes every owned ingredient and every warung item needed for prep.",
    "Every ingredient must include a specific amountText for one portion. Use weights/counts like 2 lembar, 1 butir, 100 g, 1 sdm, or 2 siung. Avoid vague phrases like secukupnya except for salt/pepper/water, and even then give a starting amount.",
    "Cooking steps are safety-critical. Use clear Indonesian instructions with no slang, no jokes, no metaphors, and no comedic phrasing.",
    "Each cooking step must mention exact ingredient amounts, timing, heat level, doneness/texture target, and when to taste or stop.",
    "The final finishing step may be warm in tone, but must still stay practical and precise.",
    "Generate 3 to 7 practical cooking steps, each with a short instruction and a detailed expandable instruction.",
    "The nutritionEstimate object is mandatory. Never omit it, even when the estimate is approximate.",
    "Estimate one-serving nutrition facts with both display text and numeric fields: caloriesKcal, proteinGrams, carbsGrams, fiberGrams, fatGrams, sugarGrams, sodiumMg.",
    "Use common nutrition references for staple ingredients. For example, one chicken egg contributes about 6 grams of protein, so never estimate a full egg below that.",
    "Numeric nutrition fields must be practical per-portion estimates, not per package unless the full package is eaten.",
    "Add warnings when sodium, sugar, or fat is likely high. Do not choose NutriLevel; the app calculates it.",
    "Do not invent or reference generated images. The UI will use a placeholder image.",
    "",
    `sisaDompet: ${payload.sisaDompet}`,
    `budgetMode: ${payload.budgetMode}`,
    `vibeProfile: ${payload.vibeProfile}`,
    `selectedIngredients: ${selectedIngredients.join(", ") || "none"}`,
  ].join("\n");
}

function buildRecipeImagePrompt(recipe: RecipeResponse) {
  const ingredients = recipe.ingredients
    .map((ingredient) => `${ingredient.amountText} ${ingredient.item}`)
    .slice(0, 12)
    .join(", ");

  return [
    "Create a polished appetizing food photo for the BokekLab recipe detail hero.",
    "Use realistic Indonesian home-cooking styling, warm natural light, and a clean plate or bowl.",
    "Do not add text, labels, logos, watermarks, people, hands, or UI elements.",
    "The image must visually match the recipe and core ingredients.",
    "",
    `Recipe: ${recipe.recipeName}`,
    `Description: ${recipe.briefDescription}`,
    `Ingredients: ${ingredients}`,
  ].join("\n");
}

function buildIngredientAnalysisPrompt() {
  return [
    "You are BokekLab's pantry photo analyst for Indonesian youth.",
    "Inspect the image and identify only visible, edible ingredients that are useful for cooking.",
    "Return only one flawless minified JSON object matching the schema. Do not include markdown, code fences, prose wrappers, comments, or extra keys.",
    "Classify each ingredient into pantryMatrix carbs, proteins, veggies, or condiments.",
    "Use concise Indonesian market names where possible, such as Nasi, Telur, Tempe, Kangkung, Cabe, Kecap, Bawang.",
    "Ignore utensils, plates, packaging with no food visible, people, pets, appliances, and unsafe/unusable items.",
    "If no usable ingredients are visible, return empty arrays and explain briefly in detectedSummary.",
  ].join("\n");
}

function buildCombinedInputAnalysisPrompt(payload: IngredientInputRequest) {
  const selectedIngredients = [
    ...payload.selectedPantryMatrix.carbs.map((item) => `carb:${item}`),
    ...payload.selectedPantryMatrix.proteins.map((item) => `protein:${item}`),
    ...payload.selectedPantryMatrix.veggies.map((item) => `veggie:${item}`),
    ...payload.selectedPantryMatrix.condiments.map((item) => `condiment:${item}`),
  ];

  return [
    "You are BokekLab's combined pantry input analyst for Indonesian youth.",
    "Merge selected pantry chips, typed ingredient text, and uploaded pantry images into one clean PantryMatrix.",
    "Return only one flawless minified JSON object matching the schema. Do not include markdown, code fences, prose wrappers, comments, or extra keys.",
    "Classify each usable ingredient into carbs, proteins, veggies, or condiments.",
    "Use concise Indonesian market names where possible, such as Nasi, Telur, Tempe, Kangkung, Cabe, Kecap, Bawang.",
    "Preserve user-selected chips unless they are obviously non-food.",
    "Ignore utensils, plates, packaging with no food visible, people, appliances, and unsafe/unusable items.",
    "If typed text has comma-separated or casual lists, normalize them into individual ingredients.",
    "",
    `typedText: ${payload.typedText?.trim() || "none"}`,
    `selectedIngredients: ${selectedIngredients.join(", ") || "none"}`,
  ].join("\n");
}

async function generateContent(
  ai: GoogleGenAI,
  model: string,
  contents: unknown,
  temperature: number,
  responseSchema: unknown,
  useGoogleSearch = false,
) {
  const request = {
    model,
    contents,
    config: {
      temperature,
      responseMimeType: "application/json",
      responseSchema,
      ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  } as unknown as Parameters<typeof ai.models.generateContent>[0];

  return ai.models.generateContent(request);
}

export async function generateRecipeWithGemini(
  payload: GenerateRecipeRequest,
): Promise<RecipeResponse> {
  const apiKey = process.env[VERTEX_API_KEY_ENV];

  if (!apiKey) {
    throw Object.assign(new Error(`${VERTEX_API_KEY_ENV} is not configured.`), {
      statusCode: 503,
      code: "missing_api_key",
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const contents = buildPrompt(payload);

  let response: Awaited<ReturnType<typeof generateContent>>;

  try {
    response = await generateContent(ai, FIXED_VERTEX_MODEL, contents, 0.85, recipeJsonSchema, true);
  } catch (error) {
    if (!isGroundingUnsupportedError(error)) {
      throw error;
    }

    response = await generateContent(ai, FIXED_VERTEX_MODEL, contents, 0.85, recipeJsonSchema);
  }

  return parseStructuredRecipe(extractResponseText(response));
}

export async function generateRecipeImageWithGemini(
  recipe: RecipeResponse,
): Promise<{ imageBytes: Buffer; mimeType: string }> {
  const apiKey = process.env[VERTEX_API_KEY_ENV];

  if (!apiKey) {
    throw Object.assign(new Error(`${VERTEX_API_KEY_ENV} is not configured.`), {
      statusCode: 503,
      code: "missing_api_key",
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = (await ai.models.generateContent({
    model: process.env.GEMINI_IMAGE_MODEL || FIXED_IMAGE_MODEL,
    contents: buildRecipeImagePrompt(recipe),
    config: {
      temperature: 0.75,
      responseModalities: ["IMAGE"],
    },
  } as unknown as Parameters<typeof ai.models.generateContent>[0])) as ImageCarrier;
  const imagePart = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data);
  const data = imagePart?.inlineData?.data;

  if (!data) {
    throw Object.assign(new Error("Gemini image generation did not return image data."), {
      statusCode: 502,
      code: "image_generation_failed",
    });
  }

  return {
    imageBytes: Buffer.from(data, "base64"),
    mimeType: imagePart.inlineData?.mimeType || "image/png",
  };
}

function isGroundingUnsupportedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /google\s*search|googlesearch|grounding|tool/i.test(message);
}

export async function analyzeIngredientsWithGemini(
  payload: IngredientPhotoRequest,
): Promise<IngredientAnalysisResponse> {
  const apiKey = process.env[VERTEX_API_KEY_ENV];

  if (!apiKey) {
    throw Object.assign(new Error(`${VERTEX_API_KEY_ENV} is not configured.`), {
      statusCode: 503,
      code: "missing_api_key",
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const contents = [
    {
      inlineData: {
        mimeType: payload.mimeType,
        data: payload.imageBase64,
      },
    },
    { text: buildIngredientAnalysisPrompt() },
  ];

  const response = await generateContent(
    ai,
    FIXED_VERTEX_MODEL,
    contents,
    0.2,
    ingredientAnalysisJsonSchema,
  );

  return parseStructuredIngredientAnalysis(extractResponseText(response));
}

export async function analyzeInputWithGemini(
  payload: IngredientInputRequest,
): Promise<IngredientAnalysisResponse> {
  const apiKey = process.env[VERTEX_API_KEY_ENV];

  if (!apiKey) {
    throw Object.assign(new Error(`${VERTEX_API_KEY_ENV} is not configured.`), {
      statusCode: 503,
      code: "missing_api_key",
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const contents = [
    ...payload.images.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.imageBase64,
      },
    })),
    { text: buildCombinedInputAnalysisPrompt(payload) },
  ];

  const response = await generateContent(
    ai,
    FIXED_VERTEX_MODEL,
    contents,
    0.2,
    ingredientAnalysisJsonSchema,
  );

  return parseStructuredIngredientAnalysis(extractResponseText(response));
}

export const geminiInternalsForTests = {
  buildPrompt,
  buildRecipeImagePrompt,
  buildIngredientAnalysisPrompt,
  buildCombinedInputAnalysisPrompt,
  parseStructuredRecipe,
};
