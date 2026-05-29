import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import {
  legacyRecipeMigrationRequestSchema,
  type RecipeResponse,
  generateRecipeRequestSchema,
  ingredientInputRequestSchema,
  ingredientPhotoRequestSchema,
  recipePatchRequestSchema,
} from "../shared/recipe";
import { FIXED_IMAGE_MODEL } from "../shared/geminiConfig";
import { requireAuth } from "./auth";
import { loadLocalEnv } from "./env";
import {
  analyzeIngredientsWithGemini,
  analyzeInputWithGemini,
  generateRecipeImageWithGemini,
  generateRecipeWithGemini,
} from "./gemini";
import {
  deleteRecipe,
  getRecipe,
  getUsageToday,
  importRecipes,
  listRecipes,
  patchRecipe,
  refundDailyUsage,
  reserveDailyUsage,
  saveRecipe,
  uploadRecipeImage,
} from "./firebaseAdmin";
import {
  AI_FEATURES_ENABLED,
  APP_VERSION,
  IMAGE_PROMPT_VERSION,
  INGREDIENT_DAILY_LIMIT,
  RECIPE_DAILY_LIMIT,
  assertProductionReleaseConfig,
  buildPublicConfig,
} from "./releaseConfig";

loadLocalEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 5173);
const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--preview");
const unauthenticatedBursts = new Map<string, { count: number; resetAt: number }>();

assertProductionReleaseConfig(isProduction);
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://storage.googleapis.com",
          "https://firebasestorage.googleapis.com",
        ],
        connectSrc: [
          "'self'",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://firestore.googleapis.com",
          "https://firebasestorage.googleapis.com",
          "https://www.googleapis.com",
        ],
        frameSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com"],
        formAction: ["'self'"],
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use("/api", noStoreApiResponses);
app.use("/api", requireJsonApiBody);
app.use(express.json({ limit: "12mb" }));

app.get("/api/config", basicBurstLimit, (_req, res) => {
  res.json(buildPublicConfig());
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/usage/today", requireAuth, async (req, res, next) => {
  try {
    res.json(await getUsageToday(req.user!.uid, AI_FEATURES_ENABLED));
  } catch (error) {
    next(error);
  }
});

app.get("/api/recipes", requireAuth, async (req, res, next) => {
  try {
    res.json({ recipes: await listRecipes(req.user!.uid) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/recipes/:id", requireAuth, async (req, res, next) => {
  try {
    const recipe = await getRecipe(req.user!.uid, String(req.params.id));

    if (!recipe) {
      res.status(404).json({
        error: {
          code: "recipe_not_found",
          message: "Recipe not found.",
        },
      });
      return;
    }

    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/recipes/:id", requireAuth, async (req, res, next) => {
  try {
    const parsed = recipePatchRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "invalid_recipe_patch",
          message: "Recipe patch does not match the BokekLab contract.",
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    res.json(await patchRecipe(req.user!.uid, String(req.params.id), parsed.data));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/recipes/:id", requireAuth, async (req, res, next) => {
  try {
    await deleteRecipe(req.user!.uid, String(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/recipes/import", requireAuth, async (req, res, next) => {
  try {
    const parsed = legacyRecipeMigrationRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "invalid_recipe_import",
          message: "Recipe import payload does not match the BokekLab contract.",
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    res.json({ importedCount: await importRecipes(req.user!.uid, parsed.data.recipes) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ingredients/analyze-photo", requireAuth, requireAiEnabled, async (req, res, next) => {
  try {
    const parsed = ingredientPhotoRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "invalid_photo_request",
          message: "Photo payload does not match the BokekLab ingredient analysis contract.",
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    await reserveDailyUsage(req.user!.uid, "ingredientAnalyses", INGREDIENT_DAILY_LIMIT);

    try {
      const analysis = await analyzeIngredientsWithGemini(parsed.data);
      res.json(analysis);
    } catch (error) {
      await refundDailyUsage(req.user!.uid, "ingredientAnalyses");
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post("/api/ingredients/analyze-input", requireAuth, requireAiEnabled, async (req, res, next) => {
  try {
    const parsed = ingredientInputRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "invalid_input_request",
          message: "Input payload does not match the BokekLab ingredient analysis contract.",
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    await reserveDailyUsage(req.user!.uid, "ingredientAnalyses", INGREDIENT_DAILY_LIMIT);

    try {
      const analysis = await analyzeInputWithGemini(parsed.data);
      res.json(analysis);
    } catch (error) {
      await refundDailyUsage(req.user!.uid, "ingredientAnalyses");
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post("/api/recipes/generate", requireAuth, requireAiEnabled, async (req, res, next) => {
  try {
    const parsed = generateRecipeRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "invalid_request",
          message: "Payload does not match the BokekLab recipe contract.",
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    await reserveDailyUsage(req.user!.uid, "recipeGenerations", RECIPE_DAILY_LIMIT);

    try {
      const recipeId = randomUUID();
      const generatedRecipe = await generateRecipeWithGemini(parsed.data);
      let recipe: RecipeResponse = {
        ...generatedRecipe,
        imageStatus: "failed" as const,
        imageError: "Image generation did not complete.",
      };

      try {
        const image = await generateRecipeImageWithGemini(generatedRecipe);
        const uploaded = await uploadRecipeImage(req.user!.uid, recipeId, image.imageBytes, image.mimeType);
        recipe = {
          ...generatedRecipe,
          imageStatus: "ready" as const,
          imageUrl: uploaded.imageUrl,
          imageStoragePath: uploaded.imageStoragePath,
          imageModel: process.env.GEMINI_IMAGE_MODEL || FIXED_IMAGE_MODEL,
          imagePromptVersion: IMAGE_PROMPT_VERSION,
          imageGeneratedAt: new Date().toISOString(),
        };
      } catch (imageError) {
        recipe = {
          ...recipe,
          imageError:
            imageError instanceof Error
              ? imageError.message
              : "Image generation failed before the image could be stored.",
        };
      }

      const savedRecipe = await saveRecipe(req.user!.uid, {
        id: recipeId,
        createdAt: new Date().toISOString(),
        isFavorite: false,
        request: parsed.data,
        recipe,
      });

      res.json(savedRecipe);
    } catch (error) {
      await refundDailyUsage(req.user!.uid, "recipeGenerations");
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

function requireAiEnabled(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (AI_FEATURES_ENABLED) {
    next();
    return;
  }

  res.status(503).json({
    error: {
      code: "ai_disabled",
      message: "Fitur AI BokekLab sedang dimatikan sementara oleh admin.",
    },
  });
}

function noStoreApiResponses(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function requireJsonApiBody(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (["POST", "PATCH", "PUT"].includes(req.method) && !req.is("application/json")) {
    res.status(415).json({
      error: {
        code: "unsupported_media_type",
        message: "Gunakan Content-Type application/json untuk request API BokekLab.",
      },
    });
    return;
  }

  next();
}

function basicBurstLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const existing = unauthenticatedBursts.get(key);

  if (!existing || existing.resetAt < now) {
    unauthenticatedBursts.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }

  if (existing.count > 120) {
    res.status(429).json({
      error: {
        code: "too_many_requests",
        message: "Terlalu banyak request. Coba lagi sebentar lagi.",
      },
    });
    return;
  }

  existing.count += 1;
  next();
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 502;

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "recipe_generation_failed";

  const message =
    error instanceof Error
      ? error.message
      : "Recipe generation failed before BokekLab could validate the response.";

  res.status(statusCode).json({
    error: {
      code,
      message: isProduction && statusCode >= 500
        ? "BokekLab gagal memproses request dengan aman. Coba lagi sebentar lagi."
        : message,
    },
  });
};

if (isProduction) {
  const distPath = path.resolve(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
  app.use(errorHandler);
  app.listen(port, () => {
    console.log(`BokekLab v${APP_VERSION} is serving production assets at http://127.0.0.1:${port}`);
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
  app.use(errorHandler);
  app.listen(port, () => {
    console.log(`BokekLab v${APP_VERSION} dev server is running at http://127.0.0.1:${port}`);
  });
}
