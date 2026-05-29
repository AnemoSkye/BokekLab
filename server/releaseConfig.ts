import type { AppConfigResponse, FirebasePublicConfig } from "../shared/recipe";
import { VERTEX_API_KEY_ENV } from "../shared/geminiConfig";

export const APP_VERSION = process.env.BOKEKLAB_APP_VERSION || "1.0.0";
export const RECIPE_DAILY_LIMIT = Number(process.env.RECIPE_DAILY_LIMIT || 10);
export const INGREDIENT_DAILY_LIMIT = Number(process.env.INGREDIENT_DAILY_LIMIT || 30);
export const AI_FEATURES_ENABLED = process.env.AI_FEATURES_ENABLED !== "false";
const explicitAuthRequired = process.env.BOKEKLAB_AUTH_REQUIRED;
export const AUTH_REQUIRED =
  explicitAuthRequired === undefined ? process.env.NODE_ENV === "production" : explicitAuthRequired !== "false";
export const IMAGE_PROMPT_VERSION = "bokeklab-food-image-v1";

export function readFirebasePublicConfig(): FirebasePublicConfig | null {
  const apiKey = process.env.FIREBASE_API_KEY;
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const appId = process.env.FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || undefined,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || undefined,
  };
}

export function buildPublicConfig(): AppConfigResponse {
  return {
    appVersion: APP_VERSION,
    authRequired: AUTH_REQUIRED,
    firebase: readFirebasePublicConfig(),
    aiFeaturesEnabled: AI_FEATURES_ENABLED,
    recipeDailyLimit: RECIPE_DAILY_LIMIT,
  };
}

export function assertProductionReleaseConfig(isProduction: boolean) {
  if (!isProduction) {
    return;
  }

  if (AUTH_REQUIRED && !readFirebasePublicConfig()) {
    throw new Error("Production auth is enabled, but Firebase public config is incomplete.");
  }

  if (AI_FEATURES_ENABLED && !process.env[VERTEX_API_KEY_ENV]) {
    throw new Error(`Production AI is enabled, but ${VERTEX_API_KEY_ENV} is not configured.`);
  }
}

export function getJakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}${month}${day}`;
}

export function getJakartaResetIso(date = new Date()) {
  const dateKey = getJakartaDateKey(date);
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  const nextJakartaMidnightAsUtc = new Date(Date.UTC(year, month - 1, day, 17, 0, 0));

  return nextJakartaMidnightAsUtc.toISOString();
}
