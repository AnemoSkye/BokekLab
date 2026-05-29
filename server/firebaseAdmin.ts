import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import type {
  RecipePatchRequest,
  SavedRecipe,
  UsageTodayResponse,
} from "../shared/recipe";
import {
  INGREDIENT_DAILY_LIMIT,
  RECIPE_DAILY_LIMIT,
  getJakartaDateKey,
  getJakartaResetIso,
} from "./releaseConfig";

type AuthedUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
};

type UsageRecord = {
  dateKey: string;
  recipeGenerations: number;
  ingredientAnalyses: number;
};

const memoryUsers = new Map<string, AuthedUser>();
const memoryRecipes = new Map<string, SavedRecipe[]>();
const memoryUsage = new Map<string, UsageRecord>();

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    return initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
      storageBucket,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    storageBucket,
  });
}

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  );
}

export async function verifyFirebaseToken(idToken: string): Promise<AuthedUser> {
  if (!isFirebaseAdminConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw Object.assign(new Error("Firebase Admin is not configured."), {
        statusCode: 503,
        code: "firebase_admin_missing",
      });
    }

    const uid = idToken.replace(/^dev:/, "") || "local-dev-user";
    const user = { uid, email: `${uid}@dev.local`, name: "Local Dev" };
    memoryUsers.set(uid, user);
    return user;
  }

  const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);

  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
  };
}

export async function touchUser(user: AuthedUser) {
  if (!isFirebaseAdminConfigured()) {
    memoryUsers.set(user.uid, user);
    return;
  }

  const db = getFirestore(getAdminApp());
  const userRef = db.collection("users").doc(user.uid);

  await userRef.set(
    {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.name ?? null,
      photoURL: user.picture ?? null,
      createdAt: FieldValue.serverTimestamp(),
      lastSeen: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getUsageToday(uid: string, aiFeaturesEnabled: boolean): Promise<UsageTodayResponse> {
  const dateKey = getJakartaDateKey();

  if (!isFirebaseAdminConfigured()) {
    const usage = memoryUsage.get(`${uid}:${dateKey}`);
    return formatUsage(dateKey, usage, aiFeaturesEnabled);
  }

  const snapshot = await getFirestore(getAdminApp())
    .collection("users")
    .doc(uid)
    .collection("usageDaily")
    .doc(dateKey)
    .get();

  return formatUsage(dateKey, snapshot.exists ? (snapshot.data() as UsageRecord) : undefined, aiFeaturesEnabled);
}

export async function reserveDailyUsage(
  uid: string,
  field: "recipeGenerations" | "ingredientAnalyses",
  limit: number,
) {
  const dateKey = getJakartaDateKey();

  if (!isFirebaseAdminConfigured()) {
    const key = `${uid}:${dateKey}`;
    const usage = memoryUsage.get(key) ?? {
      dateKey,
      recipeGenerations: 0,
      ingredientAnalyses: 0,
    };

    if (usage[field] >= limit) {
      throw quotaError(field, limit);
    }

    usage[field] += 1;
    memoryUsage.set(key, usage);
    return;
  }

  const db = getFirestore(getAdminApp());
  const ref = db.collection("users").doc(uid).collection("usageDaily").doc(dateKey);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? Number(snapshot.get(field) ?? 0) : 0;

    if (current >= limit) {
      throw quotaError(field, limit);
    }

    transaction.set(
      ref,
      {
        dateKey,
        [field]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function refundDailyUsage(
  uid: string,
  field: "recipeGenerations" | "ingredientAnalyses",
) {
  const dateKey = getJakartaDateKey();

  if (!isFirebaseAdminConfigured()) {
    const key = `${uid}:${dateKey}`;
    const usage = memoryUsage.get(key);
    if (usage) usage[field] = Math.max(0, usage[field] - 1);
    return;
  }

  await getFirestore(getAdminApp())
    .collection("users")
    .doc(uid)
    .collection("usageDaily")
    .doc(dateKey)
    .set({ [field]: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function listRecipes(uid: string): Promise<SavedRecipe[]> {
  if (!isFirebaseAdminConfigured()) {
    return memoryRecipes.get(uid) ?? [];
  }

  const snapshot = await getFirestore(getAdminApp())
    .collection("users")
    .doc(uid)
    .collection("recipes")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => deserializeRecipe(doc.data()));
}

export async function getRecipe(uid: string, recipeId: string): Promise<SavedRecipe | null> {
  if (!isFirebaseAdminConfigured()) {
    return (memoryRecipes.get(uid) ?? []).find((recipe) => recipe.id === recipeId) ?? null;
  }

  const snapshot = await getFirestore(getAdminApp())
    .collection("users")
    .doc(uid)
    .collection("recipes")
    .doc(recipeId)
    .get();

  return snapshot.exists ? deserializeRecipe(snapshot.data() ?? {}) : null;
}

export async function saveRecipe(uid: string, recipe: SavedRecipe): Promise<SavedRecipe> {
  if (!isFirebaseAdminConfigured()) {
    const recipes = memoryRecipes.get(uid) ?? [];
    memoryRecipes.set(uid, [recipe, ...recipes.filter((candidate) => candidate.id !== recipe.id)]);
    return recipe;
  }

  await getFirestore(getAdminApp())
    .collection("users")
    .doc(uid)
    .collection("recipes")
    .doc(recipe.id)
    .set(serializeRecipe(recipe), { merge: true });

  return recipe;
}

export async function importRecipes(uid: string, recipes: SavedRecipe[]) {
  const existing = await listRecipes(uid);
  const existingIds = new Set(existing.map((recipe) => recipe.id));
  const newRecipes = recipes.filter((recipe) => !existingIds.has(recipe.id));

  if (!isFirebaseAdminConfigured()) {
    memoryRecipes.set(uid, [...newRecipes, ...existing]);
    return newRecipes.length;
  }

  const db = getFirestore(getAdminApp());
  const batch = db.batch();

  newRecipes.forEach((recipe) => {
    batch.set(
      db.collection("users").doc(uid).collection("recipes").doc(recipe.id),
      serializeRecipe(recipe),
      { merge: true },
    );
  });

  await batch.commit();
  return newRecipes.length;
}

export async function patchRecipe(uid: string, recipeId: string, patch: RecipePatchRequest) {
  const existing = await getRecipe(uid, recipeId);

  if (!existing) {
    throw Object.assign(new Error("Recipe not found."), { statusCode: 404, code: "recipe_not_found" });
  }

  const nextRecipe = {
    ...existing,
    isFavorite: patch.isFavorite ?? existing.isFavorite,
    completedAt: patch.completedAt === null ? undefined : patch.completedAt ?? existing.completedAt,
  };

  return saveRecipe(uid, nextRecipe);
}

export async function deleteRecipe(uid: string, recipeId: string) {
  if (!isFirebaseAdminConfigured()) {
    memoryRecipes.set(
      uid,
      (memoryRecipes.get(uid) ?? []).filter((recipe) => recipe.id !== recipeId),
    );
    return;
  }

  await getFirestore(getAdminApp())
    .collection("users")
    .doc(uid)
    .collection("recipes")
    .doc(recipeId)
    .delete();
}

export async function uploadRecipeImage(
  uid: string,
  recipeId: string,
  imageBytes: Buffer,
  mimeType: string,
) {
  if (!isFirebaseAdminConfigured() || !process.env.FIREBASE_STORAGE_BUCKET) {
    throw Object.assign(new Error("Firebase Storage is not configured."), {
      statusCode: 503,
      code: "storage_not_configured",
    });
  }

  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const storagePath = `users/${uid}/recipes/${recipeId}/hero.${extension}`;
  const bucket = getStorage(getAdminApp()).bucket();
  const bucketName = bucket.name;
  const file = bucket.file(storagePath);
  const downloadToken = randomUUID();

  await file.save(imageBytes, {
    metadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
    resumable: false,
  });

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    storagePath,
  )}?alt=media&token=${downloadToken}`;

  return { imageUrl, imageStoragePath: storagePath };
}

function serializeRecipe(recipe: SavedRecipe) {
  return stripUndefined({
    ...recipe,
    createdAtTimestamp: Timestamp.fromDate(new Date(recipe.createdAt)),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function deserializeRecipe(data: DocumentData): SavedRecipe {
  const { createdAtTimestamp: _createdAtTimestamp, updatedAt: _updatedAt, ...recipe } = data;
  return recipe as SavedRecipe;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === "object") {
    if (value instanceof Timestamp || value instanceof FieldValue) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)]),
    ) as T;
  }

  return value;
}

function formatUsage(
  dateKey: string,
  usage: Partial<UsageRecord> | undefined,
  aiFeaturesEnabled: boolean,
): UsageTodayResponse {
  return {
    dateKey,
    recipeGenerations: Number(usage?.recipeGenerations ?? 0),
    recipeDailyLimit: RECIPE_DAILY_LIMIT,
    ingredientAnalyses: Number(usage?.ingredientAnalyses ?? 0),
    ingredientDailyLimit: INGREDIENT_DAILY_LIMIT,
    resetAt: getJakartaResetIso(),
    aiFeaturesEnabled,
  };
}

function quotaError(field: "recipeGenerations" | "ingredientAnalyses", limit: number) {
  return Object.assign(
    new Error(
      field === "recipeGenerations"
        ? `Limit harian ${limit} resep sudah habis. Coba lagi setelah reset harian.`
        : `Limit harian analisis bahan sudah habis. Coba lagi setelah reset harian.`,
    ),
    {
      statusCode: 429,
      code: field === "recipeGenerations" ? "recipe_quota_exceeded" : "ingredient_quota_exceeded",
    },
  );
}
