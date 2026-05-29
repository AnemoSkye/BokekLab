import {
  type AppConfigResponse,
  type GenerateRecipeRequest,
  type IngredientAnalysisResponse,
  type IngredientInputRequest,
  type IngredientPhotoRequest,
  type RecipePatchRequest,
  type RecipeResponse,
  type SavedRecipe,
  type UsageTodayResponse,
  appConfigResponseSchema,
  ingredientAnalysisResponseSchema,
  recipeListResponseSchema,
  savedRecipeSchema,
  usageTodayResponseSchema,
} from "../../shared/recipe";
import { parseStructuredRecipe } from "../../shared/recipeParsing";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

let authTokenProvider: (() => Promise<string | null>) | null = null;

export function setApiAuthTokenProvider(provider: (() => Promise<string | null>) | null) {
  authTokenProvider = provider;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = authTokenProvider ? await authTokenProvider() : null;

  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseApiResponse(response: Response) {
  return (await response.json().catch(() => ({}))) as ApiErrorPayload | unknown;
}

export async function fetchAppConfig(): Promise<AppConfigResponse> {
  const response = await fetch("/api/config");
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error("BokekLab gagal membaca konfigurasi aplikasi.");
  }

  const parsed = appConfigResponseSchema.safeParse(data);

  if (!parsed.success) {
    return {
      appVersion: "1.0.0",
      authRequired: false,
      firebase: null,
      aiFeaturesEnabled: true,
      recipeDailyLimit: 10,
    };
  }

  return parsed.data;
}

export async function fetchUsageToday(): Promise<UsageTodayResponse> {
  const response = await fetch("/api/usage/today", {
    headers: {
      ...(await authHeaders()),
    },
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error((data as ApiErrorPayload).error?.message || "Gagal membaca limit harian.");
  }

  return usageTodayResponseSchema.parse(data);
}

export async function fetchRecipes(): Promise<SavedRecipe[]> {
  const response = await fetch("/api/recipes", {
    headers: {
      ...(await authHeaders()),
    },
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error((data as ApiErrorPayload).error?.message || "Gagal membaca recipes.");
  }

  return recipeListResponseSchema.parse(data).recipes;
}

export async function importLegacyRecipes(recipes: SavedRecipe[]): Promise<void> {
  if (recipes.length === 0) {
    return;
  }

  const response = await fetch("/api/recipes/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({ recipes }),
  });

  if (!response.ok) {
    const data = (await parseApiResponse(response)) as ApiErrorPayload;
    throw new Error(data.error?.message || "Gagal memigrasikan resep lokal.");
  }
}

export async function patchSavedRecipe(recipeId: string, patch: RecipePatchRequest): Promise<SavedRecipe> {
  const response = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(patch),
  });
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error((data as ApiErrorPayload).error?.message || "Gagal menyimpan perubahan resep.");
  }

  return savedRecipeSchema.parse(data);
}

export async function deleteSavedRecipe(recipeId: string): Promise<void> {
  const response = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, {
    method: "DELETE",
    headers: {
      ...(await authHeaders()),
    },
  });

  if (!response.ok) {
    const data = (await parseApiResponse(response)) as ApiErrorPayload;
    throw new Error(data.error?.message || "Gagal menghapus resep.");
  }
}

export async function requestRecipe(payload: GenerateRecipeRequest): Promise<SavedRecipe> {
  const response = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const errorPayload = data as ApiErrorPayload;
    throw new Error(
      errorPayload.error?.message ||
        "BokekLab gagal meracik menu. Coba lagi setelah koneksi API siap.",
    );
  }

  const parsedSaved = savedRecipeSchema.safeParse(data);

  if (parsedSaved.success) {
    return parsedSaved.data;
  }

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    isFavorite: false,
    request: payload,
    recipe: parseStructuredRecipe(JSON.stringify(data)) as RecipeResponse,
  };
}

export async function analyzeIngredientPhoto(
  payload: IngredientPhotoRequest,
): Promise<IngredientAnalysisResponse> {
  const response = await fetch("/api/ingredients/analyze-photo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const errorPayload = data as ApiErrorPayload;
    throw new Error(
      errorPayload.error?.message ||
        "BokekLab gagal membaca foto bahan. Coba foto lain atau lanjut manual.",
    );
  }

  return ingredientAnalysisResponseSchema.parse(data);
}

export async function analyzeIngredientInput(
  payload: IngredientInputRequest,
): Promise<IngredientAnalysisResponse> {
  const response = await fetch("/api/ingredients/analyze-input", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const errorPayload = data as ApiErrorPayload;
    throw new Error(
      errorPayload.error?.message ||
        "BokekLab gagal membaca input bahan. Coba foto lain atau lanjut manual.",
    );
  }

  return ingredientAnalysisResponseSchema.parse(data);
}
