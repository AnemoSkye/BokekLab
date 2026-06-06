import {
  ArchiveRestore,
  ArrowLeft,
  Beef,
  BookOpenCheck,
  Camera,
  Check,
  ChefHat,
  ChevronDown,
  Crown,
  Egg,
  Flame,
  Heart,
  House,
  ImageUp,
  Keyboard,
  Leaf,
  Menu,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Store,
  Trash2,
  Utensils,
  Wallet,
  Wheat,
  X,
  Moon,
  PinOff,
  Sun,
  LogOut,
} from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useAnimationFrame,
  useMotionValue,
} from "motion/react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActiveCookSession,
  BudgetMode,
  GenerateRecipeRequest,
  IngredientInputRequest,
  IngredientPhotoRequest,
  PantryMatrix,
  RecipeIngredient,
  RecipeResponse,
  SavedRecipe,
  UsageTodayResponse,
  AppConfigResponse,
  VibeProfile,
} from "../shared/recipe";
import { classifyNutriLevel } from "../shared/nutrition";
import {
  MAX_INLINE_IMAGE_BYTES,
  ingredientPhotoMimeTypeSchema,
} from "../shared/recipe";
import {
  countIngredients,
  emptyPantryMatrix,
  initialPantryMatrix,
  pantryGroups,
  standardVibeProfiles,
  sultanVibeProfiles,
} from "./data/pantry";
import {
  analyzeIngredientInput,
  deleteSavedRecipe,
  fetchAppConfig,
  fetchRecipes,
  fetchUsageToday,
  importLegacyRecipes,
  patchSavedRecipe,
  requestRecipe,
  setApiAuthTokenProvider,
} from "./lib/api";
import { formatCompactDate, formatRupiah } from "./lib/format";
import {
  completeGoogleRedirect,
  firebaseAuthErrorMessage,
  listenForAuth,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signOutOfFirebase,
  signUpWithEmail,
} from "./lib/firebaseClient";
import {
  clearActiveCookSession,
  clearSavedRecipes,
  markSavedRecipeComplete,
  normalizeRecipeForRequest,
  normalizeSavedRecipe,
  readAppSettings,
  readActiveCookSession,
  readLateMonthPlan,
  readPantryMemory,
  readSavedRecipes,
  removeSavedRecipe,
  upsertSavedRecipe,
  writeAppSettings,
  type AppSettings,
  type LateMonthPlanState,
  type PantryMemoryState,
  writeActiveCookSession,
  writeLateMonthPlan,
  writePantryMemory,
  writeSavedRecipes,
} from "./lib/storage";
import { type NavIndex, resolveThemeMode, shouldUseRapidSpots } from "./lib/theme";

type GenerationStatus = "idle" | "loading" | "ready" | "error";
type EntryStage = "home" | "setup";
type PhotoStatus = "idle" | "loading" | "error";
type HomeInputMode = "idle" | "type" | "photo";
type AuthView = "signin" | "signup";
type AuthUserState = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getIdToken: () => Promise<string>;
};
type ComposerImage = IngredientInputRequest["images"][number] & {
  id: string;
  name: string;
  previewUrl: string;
  size: number;
};

const NORMAL_BUDGET_MAX = 25000;
const SULTAN_BUDGET_MAX = 250000;
const INITIAL_BUDGET = 15000;
const INITIAL_VIBE: VibeProfile = "Anak Kos Survival Mode";
const INITIAL_SULTAN_VIBE: VibeProfile = "Warung Sultan Flex";
const MORPH_SPRING = { type: "spring", stiffness: 360, damping: 34, mass: 0.8 } as const;
const SOFT_SPRING = { type: "spring", stiffness: 210, damping: 25 } as const;
const NAV_ITEMS: Array<{
  index: NavIndex;
  label: string;
  shortLabel: string;
  tooltip: string;
  icon: typeof House;
}> = [
  {
    index: 0,
    label: "Home",
    shortLabel: "Home",
    tooltip: "Home",
    icon: House,
  },
  {
    index: 1,
    label: "Recipes",
    shortLabel: "Recipes",
    tooltip: "Recipes",
    icon: BookOpenCheck,
  },
  {
    index: 2,
    label: "Settings",
    shortLabel: "Settings",
    tooltip: "Settings",
    icon: SettingsIcon,
  },
];

function createId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `recipe-${Date.now()}`;
}

function buildPayload(
  sisaDompet: number,
  budgetMode: BudgetMode,
  pantryMatrix: PantryMatrix,
  vibeProfile: VibeProfile,
): GenerateRecipeRequest {
  return {
    sisaDompet,
    budgetMode,
    pantryMatrix,
    vibeProfile,
  };
}

function mergePantryMatrix(base: PantryMatrix, next: PantryMatrix): PantryMatrix {
  return {
    carbs: Array.from(new Set([...base.carbs, ...next.carbs])),
    proteins: Array.from(new Set([...base.proteins, ...next.proteins])),
    veggies: Array.from(new Set([...base.veggies, ...next.veggies])),
    condiments: Array.from(new Set([...base.condiments, ...next.condiments])),
  };
}

function removeIngredient(matrix: PantryMatrix, item: string): PantryMatrix {
  return {
    carbs: matrix.carbs.filter((candidate) => candidate !== item),
    proteins: matrix.proteins.filter((candidate) => candidate !== item),
    veggies: matrix.veggies.filter((candidate) => candidate !== item),
    condiments: matrix.condiments.filter((candidate) => candidate !== item),
  };
}

function pantryItemCount(matrix: PantryMatrix) {
  return countIngredients(matrix);
}

function normalizeIngredientName(item: string) {
  return item.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\s]/gi, "").replace(/\s+/g, " ").trim();
}

function removeMemoryIngredient(memory: PantryMemoryState, item: string): PantryMemoryState {
  return {
    ...memory,
    staples: removeIngredient(memory.staples, item),
  };
}

function getSubstitutionSuggestions(ingredient: RecipeIngredient) {
  const item = normalizeIngredientName(ingredient.item);
  const categorySuggestions: Record<RecipeIngredient["category"], string[]> = {
    carbs: ["Nasi sisa 1 piring", "Mie bihun 1 keping", "Roti tawar 2 lembar", "Kentang rebus 1 buah sedang"],
    proteins: ["Telur 1 butir", "Tempe 80 g", "Tahu 2 kotak kecil", "Sarden 1/2 kaleng"],
    veggies: ["Sawi 1 genggam", "Kol iris 1 genggam", "Kangkung 1 ikat kecil", "Tomat 1 buah"],
    condiments: ["Kecap manis 1 sachet", "Saus sambal 1 sdm", "Bawang putih 2 siung", "Cabai rawit 3 buah"],
    warung: ["Telur 1 butir", "Tempe 80 g", "Tahu 2 kotak kecil", "Kerupuk 1 genggam"],
  };

  const specificSuggestions: Array<[RegExp, string[]]> = [
    [/telur/, ["Tempe 80 g", "Tahu 2 kotak kecil", "Sarden 1/2 kaleng"]],
    [/tempe/, ["Tahu 2 kotak kecil", "Telur 1 butir", "Sarden 1/2 kaleng"]],
    [/tahu/, ["Tempe 80 g", "Telur 1 butir", "Bakso 3 butir iris"]],
    [/ayam/, ["Telur 1 butir", "Tempe 100 g", "Tahu 2 kotak kecil"]],
    [/nasi/, ["Mie bihun 1 keping", "Roti tawar 2 lembar", "Kentang 1 buah sedang"]],
    [/bihun|mie/, ["Nasi sisa 1 piring", "Roti tawar 2 lembar", "Kentang rebus 1 buah sedang"]],
    [/kecap/, ["Saus tiram 1 sdt", "Garam 1/4 sdt + gula 1/2 sdt", "Saus sambal 1 sdm"]],
    [/cabai|cabe/, ["Saus sambal 1 sdm", "Lada bubuk 1/4 sdt", "Boncabe 1/2 sachet"]],
  ];

  return specificSuggestions.find(([pattern]) => pattern.test(item))?.[1] ?? categorySuggestions[ingredient.category];
}

function isSupportedPhotoMimeType(mimeType: string): mimeType is IngredientPhotoRequest["mimeType"] {
  return ingredientPhotoMimeTypeSchema.safeParse(mimeType).success;
}

const OBVIOUS_NON_FOOD_TERMS = [
  "shoe",
  "shoes",
  "sepatu",
  "stone",
  "stones",
  "batu",
  "paper",
  "papers",
  "kertas",
  "plastic",
  "plastik",
  "phone",
  "hp",
  "ponsel",
  "charger",
  "cable",
  "kabel",
  "wallet",
  "dompet",
  "coin",
  "coins",
  "uang",
  "remote",
  "pen",
  "pens",
  "pulpen",
  "pencil",
  "pensil",
];

function findObviousNonFoodTerm(text: string) {
  const normalized = text.toLowerCase();
  return OBVIOUS_NON_FOOD_TERMS.find((term) => new RegExp(`\\b${term}\\b`, "i").test(normalized));
}

function playfulNonFoodMessage(item: string) {
  return `Really? do you think ${item} is edible? Try again.`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<{ imageBase64: string; previewUrl: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve({
        imageBase64: result.includes(",") ? result.split(",")[1] : result,
        previewUrl: result,
      });
    };
    reader.onerror = () => reject(new Error("Gagal membaca file foto."));
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [appConfig, setAppConfig] = useState<AppConfigResponse>({
    appVersion: "1.0.0",
    authRequired: false,
    firebase: null,
    aiFeaturesEnabled: true,
    recipeDailyLimit: 10,
  });
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [authUser, setAuthUser] = useState<AuthUserState | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "ready">("loading");
  const [authError, setAuthError] = useState("");
  const [usageToday, setUsageToday] = useState<UsageTodayResponse | null>(null);
  const [hasMigratedLocalRecipes, setHasMigratedLocalRecipes] = useState(false);
  const [activeIndex, setActiveIndex] = useState<NavIndex>(0);
  const [entryStage, setEntryStage] = useState<EntryStage>("home");
  const [sisaDompet, setSisaDompet] = useState(INITIAL_BUDGET);
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("normal");
  const [pantryMatrix, setPantryMatrix] = useState<PantryMatrix>(initialPantryMatrix);
  const [vibeProfile, setVibeProfile] = useState<VibeProfile>(INITIAL_VIBE);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [frozenPayload, setFrozenPayload] = useState<GenerateRecipeRequest | null>(null);
  const [error, setError] = useState("");
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>("idle");
  const [photoError, setPhotoError] = useState("");
  const [photoSummary, setPhotoSummary] = useState("");
  const [homeInputMode, setHomeInputMode] = useState<HomeInputMode>("idle");
  const [typedIngredientText, setTypedIngredientText] = useState("");
  const [composerImages, setComposerImages] = useState<ComposerImage[]>([]);
  const [isDesktopNavExpanded, setIsDesktopNavExpanded] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedRecipeSnapshot, setSelectedRecipeSnapshot] = useState<SavedRecipe | null>(null);
  const [isCookSessionExpanded, setIsCookSessionExpanded] = useState(false);
  const [confettiBurstId, setConfettiBurstId] = useState(0);
  const [recipeFilter, setRecipeFilter] = useState<"all" | "liked">("all");
  const [appSettings, setAppSettings] = useState<AppSettings>(() =>
    typeof window === "undefined" ? { darkMode: false } : readAppSettings(),
  );
  const [pantryMemory, setPantryMemory] = useState<PantryMemoryState>(() =>
    typeof window === "undefined"
      ? { enabled: true, staples: emptyPantryMatrix }
      : readPantryMemory(),
  );
  const [lateMonthPlan, setLateMonthPlan] = useState<LateMonthPlanState>(() =>
    typeof window === "undefined"
      ? { enabled: false, days: 5, budget: 30000 }
      : readLateMonthPlan(),
  );
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>(() =>
    typeof window === "undefined" ? [] : readSavedRecipes(),
  );
  const [activeCookSession, setActiveCookSession] = useState<ActiveCookSession | null>(() =>
    typeof window === "undefined" ? null : readActiveCookSession(),
  );

  const selectedCount = countIngredients(pantryMatrix);
  const selectedSavedRecipe =
    savedRecipes.find((savedRecipe) => savedRecipe.id === selectedRecipeId) ??
    (selectedRecipeSnapshot?.id === selectedRecipeId ? selectedRecipeSnapshot : null);
  const activeCookRecipe = activeCookSession
    ? savedRecipes.find((savedRecipe) => savedRecipe.id === activeCookSession.recipeId) ?? null
    : null;
  const isRecipeFocus = status === "loading" || Boolean(selectedRecipeId || activeCookSession);
  const isRecipeDetail = activeIndex === 1 && Boolean(selectedRecipeId);
  const themeMode = resolveThemeMode(activeIndex, sisaDompet, isRecipeFocus, budgetMode);
  const isRapid = shouldUseRapidSpots(activeIndex, sisaDompet, isRecipeFocus);

  const payload = useMemo(
    () => buildPayload(sisaDompet, budgetMode, pantryMatrix, vibeProfile),
    [budgetMode, pantryMatrix, sisaDompet, vibeProfile],
  );

  useEffect(() => {
    let isMounted = true;

    fetchAppConfig()
      .then((config) => {
        if (!isMounted) return;
        setAppConfig(config);
        setConfigStatus("ready");

        if (!config.authRequired || !config.firebase) {
          setAuthStatus("ready");
        }
      })
      .catch((configError) => {
        if (!isMounted) return;
        setConfigStatus("error");
        setAuthStatus("ready");
        setAuthError(
          configError instanceof Error
            ? configError.message
            : "BokekLab gagal membaca konfigurasi login.",
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!appConfig.authRequired || !appConfig.firebase) {
      setApiAuthTokenProvider(null);
      return;
    }

    setAuthStatus("loading");
    void completeGoogleRedirect(appConfig.firebase).catch((redirectError) => {
      setAuthError(firebaseAuthErrorMessage(redirectError));
    });
    const unsubscribe = listenForAuth(appConfig.firebase, (user) => {
      setAuthUser(
        user
          ? {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              getIdToken: () => user.getIdToken(),
            }
          : null,
      );
      setApiAuthTokenProvider(user ? () => user.getIdToken() : null);
      setAuthStatus("ready");
    });

    return () => {
      unsubscribe();
      setApiAuthTokenProvider(null);
    };
  }, [appConfig]);

  useEffect(() => {
    if (appConfig.authRequired && !authUser) {
      return;
    }

    let cancelled = false;

    async function hydrateServerState() {
      try {
        const localRecipes = readSavedRecipes();

        if (appConfig.authRequired && localRecipes.length > 0 && !hasMigratedLocalRecipes) {
          await importLegacyRecipes(localRecipes);
          clearSavedRecipes();
          setHasMigratedLocalRecipes(true);
        }

        const [recipes, usage] = await Promise.all([
          appConfig.authRequired ? fetchRecipes() : Promise.resolve(readSavedRecipes()),
          appConfig.authRequired
            ? fetchUsageToday()
            : Promise.resolve<UsageTodayResponse>({
                dateKey: "local",
                recipeGenerations: 0,
                recipeDailyLimit: appConfig.recipeDailyLimit,
                ingredientAnalyses: 0,
                ingredientDailyLimit: 30,
                resetAt: new Date(Date.now() + 86_400_000).toISOString(),
                aiFeaturesEnabled: appConfig.aiFeaturesEnabled,
              }),
        ]);

        if (!cancelled) {
          setSavedRecipes(recipes.map((recipe) => normalizeSavedRecipe(recipe)));
          setUsageToday(usage);
        }
      } catch (stateError) {
        if (!cancelled) {
          setError(
            stateError instanceof Error
              ? stateError.message
              : "BokekLab gagal membaca data akun.",
          );
        }
      }
    }

    void hydrateServerState();

    return () => {
      cancelled = true;
    };
  }, [appConfig, authUser, hasMigratedLocalRecipes]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (isCookSessionExpanded) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCookSessionExpanded]);

  function commitSavedRecipes(nextRecipes: SavedRecipe[]) {
    setSavedRecipes(nextRecipes);

    if (appConfig.authRequired) {
      return;
    }

    if (nextRecipes.length === 0) {
      clearSavedRecipes();
      clearActiveCookSession();
      setActiveCookSession(null);
      setSelectedRecipeId(null);
      setSelectedRecipeSnapshot(null);
      return;
    }

    writeSavedRecipes(nextRecipes);
  }

  function commitActiveCookSession(nextSession: ActiveCookSession | null) {
    setActiveCookSession(nextSession);

    if (!nextSession) {
      setIsCookSessionExpanded(false);
      clearActiveCookSession();
      return;
    }

    writeActiveCookSession(nextSession);
  }

  async function generateFromPayload(nextPayload: GenerateRecipeRequest) {
    setFrozenPayload(nextPayload);
    setActiveIndex(1);
    setStatus("loading");
    setError("");
    setSelectedRecipeId(null);
    setSelectedRecipeSnapshot(null);

    try {
      const savedRecipe = normalizeSavedRecipe(await requestRecipe(nextPayload));
      const nextSavedRecipes = upsertSavedRecipe(savedRecipes, savedRecipe);

      commitSavedRecipes(nextSavedRecipes);
      setUsageToday(await fetchUsageToday().catch(() => usageToday));
      setSelectedRecipeId(savedRecipe.id);
      setSelectedRecipeSnapshot(savedRecipe);
      setStatus("ready");
    } catch (requestError) {
      setStatus("error");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "BokekLab gagal meracik menu darurat.",
      );
    }
  }

  function handleToggleIngredient(groupKey: keyof PantryMatrix, item: string) {
    setPantryMatrix((current) => {
      const existingItems = current[groupKey];
      const hasItem = existingItems.includes(item);

      return {
        ...current,
        [groupKey]: hasItem
          ? existingItems.filter((currentItem) => currentItem !== item)
          : [...existingItems, item],
      };
    });
  }

  function handleRemoveIngredient(item: string) {
    setPantryMatrix((current) => removeIngredient(current, item));
  }

  function handleActivateTypeMode() {
    setHomeInputMode("type");
    setPhotoError("");
  }

  function handleClearComposer() {
    setHomeInputMode("idle");
    setTypedIngredientText("");
    setComposerImages([]);
    setPhotoError("");
  }

  async function handleContinueSetup() {
    const hasTypedText = Boolean(typedIngredientText.trim());
    const hasImages = composerImages.length > 0;

    if (!hasTypedText && !hasImages) {
      setPhotoError("");
      setEntryStage("setup");
      return;
    }

    const obviousNonFood = findObviousNonFoodTerm(typedIngredientText);

    if (obviousNonFood) {
      setPhotoStatus("error");
      setPhotoError(playfulNonFoodMessage(obviousNonFood));
      return;
    }

    setPhotoStatus("loading");
    setPhotoError("");

    try {
      const analysis = await analyzeIngredientInput({
        typedText: typedIngredientText.trim() || undefined,
        images: composerImages.map(({ imageBase64, mimeType }) => ({ imageBase64, mimeType })),
        selectedPantryMatrix: pantryMatrix,
      });

      setPantryMatrix((current) => mergePantryMatrix(current, analysis.pantryMatrix));
      setPhotoSummary(analysis.detectedSummary);
      setTypedIngredientText("");
      setComposerImages([]);
      setHomeInputMode("idle");
      setPhotoStatus("idle");
      setEntryStage("setup");
    } catch (inputRequestError) {
      setPhotoStatus("error");
      setPhotoError(
        inputRequestError instanceof Error
          ? inputRequestError.message
          : "BokekLab gagal membaca input bahan.",
      );
    }
  }

  async function handlePhotoFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!isSupportedPhotoMimeType(file.type)) {
      setPhotoStatus("error");
      setPhotoError("Format foto belum didukung. Gunakan PNG, JPG, WEBP, HEIC, atau HEIF.");
      return;
    }

    if (file.size > MAX_INLINE_IMAGE_BYTES) {
      setPhotoStatus("error");
      setPhotoError("Foto terlalu besar. Pakai gambar di bawah 8 MB biar analisis tetap cepat.");
      return;
    }

    if (composerImages.length >= 3) {
      setPhotoStatus("error");
      setPhotoError("Maksimal 3 foto dulu, biar AI tetap fokus.");
      return;
    }

    const nextTotalBytes =
      composerImages.reduce((total, image) => total + image.size, 0) + file.size;

    if (nextTotalBytes > MAX_INLINE_IMAGE_BYTES) {
      setPhotoStatus("error");
      setPhotoError("Total foto terlalu besar. Maksimal gabungan sekitar 8 MB.");
      return;
    }

    setPhotoError("");

    try {
      const imageData = await readFileAsDataUrl(file);
      const nextImage: ComposerImage = {
        id: createId(),
        name: file.name,
        size: file.size,
        mimeType: file.type,
        ...imageData,
      };

      setComposerImages((current) => [...current, nextImage]);
      setHomeInputMode((current) => (current === "type" ? "type" : "photo"));
      setPhotoStatus("idle");
    } catch (photoReadError) {
      setPhotoStatus("error");
      setPhotoError(
        photoReadError instanceof Error ? photoReadError.message : "BokekLab gagal membaca foto.",
      );
    }
  }

  function handleRemoveComposerImage(imageId: string) {
    setComposerImages((current) => {
      const nextImages = current.filter((image) => image.id !== imageId);

      if (nextImages.length === 0 && homeInputMode === "photo") {
        setHomeInputMode("idle");
      }

      return nextImages;
    });
  }

  function handleToggleSultanMode() {
    setBudgetMode((current) => {
      if (current === "normal") {
        setVibeProfile(INITIAL_SULTAN_VIBE);
        return "sultan";
      }

      setSisaDompet((value) => Math.min(value, NORMAL_BUDGET_MAX));
      setVibeProfile(INITIAL_VIBE);
      return "normal";
    });
  }

  function handleNavigate(index: NavIndex) {
    setActiveIndex(index);
    setIsDesktopNavExpanded(false);
    setIsMobileNavOpen(false);
  }

  function handleOpenRecipe(savedRecipe: SavedRecipe) {
    setSisaDompet(savedRecipe.request.sisaDompet);
    setBudgetMode(savedRecipe.request.budgetMode);
    setPantryMatrix(savedRecipe.request.pantryMatrix);
    setVibeProfile(savedRecipe.request.vibeProfile);
    setFrozenPayload(savedRecipe.request);
    setStatus("ready");
    setError("");
    setSelectedRecipeId(savedRecipe.id);
    setSelectedRecipeSnapshot(savedRecipe);
    setActiveIndex(1);
  }

  async function handleDeleteSaved(recipeId: string) {
    commitSavedRecipes(removeSavedRecipe(savedRecipes, recipeId));

    if (selectedRecipeId === recipeId) {
      setSelectedRecipeId(null);
      setSelectedRecipeSnapshot(null);
    }

    if (activeCookSession?.recipeId === recipeId) {
      commitActiveCookSession(null);
    }

    if (appConfig.authRequired) {
      try {
        await deleteSavedRecipe(recipeId);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error ? deleteError.message : "BokekLab gagal menghapus resep.",
        );
      }
    }
  }

  async function handleToggleFavorite(recipeId: string) {
    const currentRecipe = savedRecipes.find((recipe) => recipe.id === recipeId);
    const nextFavorite = !currentRecipe?.isFavorite;
    const nextRecipes = savedRecipes.map((recipe) =>
      recipe.id === recipeId ? { ...recipe, isFavorite: nextFavorite } : recipe,
    );
    const nextSelectedRecipe = nextRecipes.find((recipe) => recipe.id === recipeId) ?? null;

    commitSavedRecipes(nextRecipes);

    if (selectedRecipeId === recipeId && nextSelectedRecipe) {
      setSelectedRecipeSnapshot(nextSelectedRecipe);
    }

    if (appConfig.authRequired) {
      try {
        const patchedRecipe = await patchSavedRecipe(recipeId, { isFavorite: nextFavorite });
        commitSavedRecipes(upsertSavedRecipe(nextRecipes, normalizeSavedRecipe(patchedRecipe)));
      } catch (favoriteError) {
        setError(
          favoriteError instanceof Error
            ? favoriteError.message
            : "BokekLab gagal menyimpan favorit.",
        );
      }
    }
  }

  function handleStartCooking(recipeId: string) {
    const now = new Date().toISOString();

    commitActiveCookSession({
      id: createId(),
      recipeId,
      phase: "ingredients",
      checkedIngredients: {},
      checkedSteps: {},
      currentStepIndex: 0,
      isStepExpanded: false,
      startedAt: now,
      updatedAt: now,
    });
    setIsCookSessionExpanded(false);
    setSelectedRecipeId(null);
    setSelectedRecipeSnapshot(null);
    setActiveIndex(1);
  }

  function handleToggleCookIngredient(savedRecipe: SavedRecipe, ingredientId: string) {
    if (!activeCookSession || activeCookSession.recipeId !== savedRecipe.id) {
      return;
    }

    const ingredientIds = getRecipeIngredientRows(savedRecipe.recipe).map((row) => row.id);
    const checkedIngredients = {
      ...activeCookSession.checkedIngredients,
      [ingredientId]: !activeCookSession.checkedIngredients[ingredientId],
    };
    const isComplete =
      ingredientIds.length > 0 && ingredientIds.every((id) => Boolean(checkedIngredients[id]));

    if (isComplete) {
      setIsCookSessionExpanded(false);
    }

    commitActiveCookSession({
      ...activeCookSession,
      phase: isComplete ? "steps" : "ingredients",
      checkedIngredients,
      checkedSteps: activeCookSession.checkedSteps,
      currentStepIndex: isComplete ? 0 : activeCookSession.currentStepIndex,
      isStepExpanded: false,
      updatedAt: new Date().toISOString(),
    });
  }

  function handleUnpinCooking() {
    if (!activeCookSession) {
      return;
    }

    commitActiveCookSession(null);
  }

  async function handleCompleteCookingStep(savedRecipe: SavedRecipe, stepId: string) {
    if (!activeCookSession || activeCookSession.recipeId !== savedRecipe.id) {
      return;
    }

    if (activeCookSession.checkedSteps[stepId]) {
      return;
    }

    const checkedSteps = {
      ...activeCookSession.checkedSteps,
      [stepId]: true,
    };
    const stepIds = savedRecipe.recipe.steps.map((step) => String(step.stepNumber));
    const isComplete =
      stepIds.length > 0 && stepIds.every((id) => Boolean(checkedSteps[id]));

    if (isComplete) {
      const completedAt = new Date().toISOString();
      commitSavedRecipes(markSavedRecipeComplete(savedRecipes, savedRecipe.id, completedAt));
      commitActiveCookSession(null);
      setConfettiBurstId((current) => current + 1);

      if (appConfig.authRequired) {
        try {
          await patchSavedRecipe(savedRecipe.id, { completedAt });
        } catch (completeError) {
          setError(
            completeError instanceof Error
              ? completeError.message
              : "BokekLab gagal menyimpan status selesai.",
          );
        }
      }
      return;
    }

    commitActiveCookSession({
      ...activeCookSession,
      checkedSteps,
      updatedAt: new Date().toISOString(),
    });
  }

  function handleBackToHomeSetup() {
    setActiveIndex(0);
    setEntryStage("setup");
  }

  function handleBackToRecipeList() {
    setSelectedRecipeId(null);
    setSelectedRecipeSnapshot(null);
    setStatus("idle");
  }

  async function handleWipeRecipes() {
    if (appConfig.authRequired) {
      await Promise.all(savedRecipes.map((recipe) => deleteSavedRecipe(recipe.id).catch(() => undefined)));
    }

    commitSavedRecipes([]);
  }

  function handleSettingsChange(nextSettings: AppSettings) {
    setAppSettings(nextSettings);
    writeAppSettings(nextSettings);
  }

  function handlePantryMemoryChange(nextMemory: PantryMemoryState) {
    setPantryMemory(nextMemory);
    writePantryMemory(nextMemory);
  }

  function handleSavePantryMemory() {
    const nextMemory = {
      ...pantryMemory,
      staples: mergePantryMatrix(pantryMemory.staples, pantryMatrix),
    };

    handlePantryMemoryChange(nextMemory);
  }

  function handleApplyPantryMemory() {
    setPantryMatrix((current) => mergePantryMatrix(current, pantryMemory.staples));
    setEntryStage("setup");
  }

  function handleRemoveMemoryIngredient(item: string) {
    handlePantryMemoryChange(removeMemoryIngredient(pantryMemory, item));
  }

  function handleLateMonthPlanChange(nextPlan: LateMonthPlanState) {
    setLateMonthPlan(nextPlan);
    writeLateMonthPlan(nextPlan);
  }

  function handleUseLateMonthBudget() {
    const dailyBudget = Math.floor(lateMonthPlan.budget / Math.max(1, lateMonthPlan.days));
    setSisaDompet(Math.min(dailyBudget, budgetMode === "sultan" ? SULTAN_BUDGET_MAX : NORMAL_BUDGET_MAX));
  }

  function handleRetryGeneration() {
    if (frozenPayload) {
      void generateFromPayload(frozenPayload);
    }
  }

  async function handleAuthAction(action: () => Promise<unknown>) {
    setAuthError("");

    try {
      await action();
    } catch (authActionError) {
      setAuthError(firebaseAuthErrorMessage(authActionError));
    }
  }

  async function handleSignOut() {
    if (appConfig.firebase) {
      await signOutOfFirebase(appConfig.firebase);
    }
    setAuthUser(null);
    setSavedRecipes([]);
    setUsageToday(null);
  }

  if (configStatus === "loading" || (appConfig.authRequired && authStatus === "loading")) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <ChefHat size={34} aria-hidden="true" />
          <h1>BokekLab</h1>
          <p>Menyiapkan dapur digital...</p>
        </div>
      </div>
    );
  }

  if (appConfig.authRequired && appConfig.firebase && !authUser) {
    return (
      <WelcomeScreen
        config={appConfig}
        authError={authError}
        onGoogle={() => handleAuthAction(() => signInWithGoogle(appConfig.firebase!))}
        onEmailSignIn={(email, password) =>
          handleAuthAction(() => signInWithEmail(appConfig.firebase!, email, password))
        }
        onEmailSignUp={(email, password) =>
          handleAuthAction(() => signUpWithEmail(appConfig.firebase!, email, password))
        }
        onResetPassword={(email) =>
          handleAuthAction(() => resetPassword(appConfig.firebase!, email))
        }
      />
    );
  }

  return (
    <div
      className="app-shell"
      data-theme={themeMode}
      data-color-scheme={appSettings.darkMode ? "dark" : "light"}
      data-cook-expanded={isCookSessionExpanded}
      data-recipe-detail={isRecipeDetail}
      data-mobile-nav-open={isMobileNavOpen}
      data-entry-stage={activeIndex === 0 ? entryStage : undefined}
    >
      <ConfettiBurst burstId={confettiBurstId} />
      <AmbientBackground isRapid={isRapid} />
      <NavigationRail
        activeIndex={activeIndex}
        isDesktopExpanded={isDesktopNavExpanded}
        isMobileOpen={isMobileNavOpen}
        isRecipeDetail={isRecipeDetail}
        isSetupStage={activeIndex === 0 && entryStage === "setup"}
        onNavigate={handleNavigate}
        onToggleDesktop={() => setIsDesktopNavExpanded((current) => !current)}
        onCloseDesktop={() => setIsDesktopNavExpanded(false)}
        onOpenMobile={() => setIsMobileNavOpen(true)}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />
      {activeIndex === 1 && !isRecipeDetail && savedRecipes.length > 0 && (
        <MobileRecipeFilter
          value={recipeFilter}
          onChange={setRecipeFilter}
        />
      )}
      <main className="app-main">
        <AnimatePresence mode="wait">
          {activeIndex === 0 && (
            <DapurDarurat
              key="dapur"
              entryStage={entryStage}
              sisaDompet={sisaDompet}
              budgetMode={budgetMode}
              pantryMatrix={pantryMatrix}
              pantryMemory={pantryMemory}
              lateMonthPlan={lateMonthPlan}
              vibeProfile={vibeProfile}
              selectedCount={selectedCount}
              isGenerating={status === "loading"}
              homeInputMode={homeInputMode}
              typedIngredientText={typedIngredientText}
              composerImages={composerImages}
              photoStatus={photoStatus}
              photoError={photoError}
              photoSummary={photoSummary}
              onBudgetChange={setSisaDompet}
              onVibeChange={setVibeProfile}
              onToggleIngredient={handleToggleIngredient}
              onRemoveIngredient={handleRemoveIngredient}
              onGenerate={() => void generateFromPayload(payload)}
              onApplyPantryMemory={handleApplyPantryMemory}
              onSavePantryMemory={handleSavePantryMemory}
              onPantryMemoryChange={handlePantryMemoryChange}
              onLateMonthPlanChange={handleLateMonthPlanChange}
              onUseLateMonthBudget={handleUseLateMonthBudget}
              onType={handleActivateTypeMode}
              onTypedTextChange={setTypedIngredientText}
              onContinue={handleContinueSetup}
              onPhotoFile={(file) => void handlePhotoFile(file)}
              onRemoveComposerImage={handleRemoveComposerImage}
              onClearComposer={handleClearComposer}
              onBackHome={() => setEntryStage("home")}
              onClearPantry={() => setPantryMatrix(emptyPantryMatrix)}
              onToggleSultanMode={handleToggleSultanMode}
            />
          )}

          {activeIndex === 1 && (
            <RecipesPage
              key="recipes"
              status={status}
              error={error}
              frozenPayload={frozenPayload}
              savedRecipes={savedRecipes}
              selectedRecipe={selectedSavedRecipe}
              activeCookSession={activeCookSession}
              activeCookRecipe={activeCookRecipe}
              onRetry={handleRetryGeneration}
              recipeFilter={recipeFilter}
              onRecipeFilterChange={setRecipeFilter}
              onBackToDesk={handleBackToHomeSetup}
              onBackToList={handleBackToRecipeList}
              onOpen={handleOpenRecipe}
              onDelete={handleDeleteSaved}
              onToggleFavorite={handleToggleFavorite}
              onStartCooking={handleStartCooking}
              onToggleCookIngredient={handleToggleCookIngredient}
              onToggleCookExpanded={() => setIsCookSessionExpanded((current) => !current)}
              onUnpinCooking={handleUnpinCooking}
              onCompleteCookingStep={handleCompleteCookingStep}
              isCookSessionExpanded={isCookSessionExpanded}
            />
          )}

          {activeIndex === 2 && (
            <SettingsPage
              key="settings"
              settings={appSettings}
              appVersion={appConfig.appVersion}
              authUser={authUser}
              usageToday={usageToday}
              savedRecipeCount={savedRecipes.length}
              pantryMemory={pantryMemory}
              lateMonthPlan={lateMonthPlan}
              onSettingsChange={handleSettingsChange}
              onPantryMemoryChange={handlePantryMemoryChange}
              onRemoveMemoryIngredient={handleRemoveMemoryIngredient}
              onLateMonthPlanChange={handleLateMonthPlanChange}
              onWipeRecipes={handleWipeRecipes}
              onSignOut={() => void handleSignOut()}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function AmbientBackground({ isRapid }: { isRapid: boolean }) {
  return (
    <div className="ambient-layer" aria-hidden="true">
      <GradientSpot index={0} isRapid={isRapid} color="var(--spot-one)" size="52vw" />
      <GradientSpot index={1} isRapid={isRapid} color="var(--spot-two)" size="48vw" />
      <GradientSpot index={2} isRapid={isRapid} color="var(--spot-three)" size="42vw" />
    </div>
  );
}

function ConfettiBurst({ burstId }: { burstId: number }) {
  if (burstId === 0) {
    return null;
  }

  const colors = ["#ff6321", "#9333ea", "#f59e0b", "#22c55e", "#2563eb"];
  const pieces = Array.from({ length: 28 }, (_, index) => ({
    id: `${burstId}-${index}`,
    x: (index - 14) * 11 + (index % 4) * 7,
    y: -120 - (index % 6) * 22,
    rotate: index * 41,
    color: colors[index % colors.length],
  }));

  return (
    <motion.div
      key={burstId}
      className="confetti-layer"
      aria-label="Recipe completed"
      role="status"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 1.1, duration: 0.35 }}
    >
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="confetti-piece"
          style={{ background: piece.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.8 }}
          animate={{
            x: piece.x,
            y: piece.y,
            opacity: [1, 1, 0],
            rotate: piece.rotate,
            scale: [0.8, 1, 0.9],
          }}
          transition={{ duration: 1.35, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}

function GradientSpot({
  index,
  isRapid,
  color,
  size,
}: {
  index: number;
  isRapid: boolean;
  color: string;
  size: string;
}) {
  const x = useMotionValue("0vw");
  const y = useMotionValue("0vh");
  const scale = useMotionValue(1);

  useAnimationFrame((time) => {
    const tempo = isRapid ? 520 : 2600;
    const phase = index * 1.7;
    x.set(`${Math.sin(time / tempo + phase) * (8 + index * 4)}vw`);
    y.set(`${Math.cos(time / (tempo * 1.24) + phase) * (6 + index * 3)}vh`);
    scale.set(1 + Math.sin(time / (tempo * 1.4) + phase) * 0.06);
  });

  return (
    <motion.div
      className={`gradient-spot gradient-spot-${index + 1}`}
      style={{ x, y, scale, background: color, width: size, height: size }}
    />
  );
}

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const suppressFocusUntil = useRef(0);

  function closeAfterClick() {
    suppressFocusUntil.current = Date.now() + 450;
    setIsOpen(false);
  }

  return (
    <span
      className="tooltip-wrap"
      data-open={isOpen}
      onPointerEnter={() => setIsOpen(true)}
      onPointerLeave={() => setIsOpen(false)}
      onFocusCapture={() => {
        if (Date.now() > suppressFocusUntil.current) {
          setIsOpen(true);
        }
      }}
      onBlurCapture={() => setIsOpen(false)}
      onPointerDownCapture={closeAfterClick}
      onClickCapture={closeAfterClick}
    >
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}

function ActionButton({
  tooltip,
  children,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }) {
  void tooltip;

  return <button {...buttonProps}>{children}</button>;
}

function RecipeFilterSwitch({
  value,
  onChange,
}: {
  value: "all" | "liked";
  onChange: (value: "all" | "liked") => void;
}) {
  return (
    <div className="recipe-filter-switch" role="group" aria-label="Recipe filter">
      <button
        type="button"
        data-active={value === "all"}
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        All
      </button>
      <button
        type="button"
        data-active={value === "liked"}
        aria-pressed={value === "liked"}
        onClick={() => onChange("liked")}
      >
        <Heart size={15} fill="currentColor" aria-hidden="true" />
        Liked
      </button>
    </div>
  );
}

function MobileRecipeFilter({
  value,
  onChange,
}: {
  value: "all" | "liked";
  onChange: (value: "all" | "liked") => void;
}) {
  return (
    <div className="mobile-recipe-filter">
      <RecipeFilterSwitch value={value} onChange={onChange} />
    </div>
  );
}

function WelcomeScreen({
  config,
  authError,
  onGoogle,
  onEmailSignIn,
  onEmailSignUp,
  onResetPassword,
}: {
  config: AppConfigResponse;
  authError: string;
  onGoogle: () => void;
  onEmailSignIn: (email: string, password: string) => void;
  onEmailSignUp: (email: string, password: string) => void;
  onResetPassword: (email: string) => void;
}) {
  const [authView, setAuthView] = useState<AuthView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="auth-shell">
      <motion.section
        className="auth-card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SOFT_SPRING}
      >
        <div className="auth-brand">
          <span>
            <ChefHat size={28} aria-hidden="true" />
          </span>
          <div>
            <p className="mono-label">BokekLab v{config.appVersion}</p>
            <h1>Masuk dulu, baru kita racik.</h1>
          </div>
        </div>
        <p className="auth-copy">
          Resep, gambar, dan limit harian disimpan aman di akun kamu supaya budget eksperimen
          tetap terkendali.
        </p>

        <button className="auth-google-button" type="button" onClick={onGoogle}>
          <GoogleIcon />
          Sign in with Google
        </button>

        <div className="auth-divider">atau email</div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (authView === "signin") {
              onEmailSignIn(email, password);
            } else {
              onEmailSignUp(email, password);
            }
          }}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={authView === "signin" ? "current-password" : "new-password"}
              value={password}
              minLength={6}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {authError && <p className="auth-error">{authError}</p>}

          <button className="auth-submit" type="submit">
            {authView === "signin" ? "Sign in with email" : "Create account"}
          </button>
        </form>

        <div className="auth-row">
          <button
            type="button"
            onClick={() => setAuthView((current) => (current === "signin" ? "signup" : "signin"))}
          >
            {authView === "signin" ? "Sign up for a new account" : "Already have an account?"}
          </button>
          <button type="button" disabled={!email.trim()} onClick={() => onResetPassword(email)}>
            Reset password
          </button>
        </div>
      </motion.section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.32 2.98-7.52Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.82-1.76-5.61-4.13H3.04v2.59A9.99 9.99 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.89A6.02 6.02 0 0 1 6.07 12c0-.66.11-1.3.32-1.89V7.52H3.04A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.04 4.48l3.35-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.8.51 3.84 1.5l2.87-2.87A9.61 9.61 0 0 0 12 2a9.99 9.99 0 0 0-8.96 5.52l3.35 2.59C7.18 7.74 9.4 5.98 12 5.98Z"
      />
    </svg>
  );
}

function NavigationRail({
  activeIndex,
  isDesktopExpanded,
  isMobileOpen,
  isRecipeDetail,
  isSetupStage,
  onNavigate,
  onToggleDesktop,
  onCloseDesktop,
  onOpenMobile,
  onCloseMobile,
}: {
  activeIndex: NavIndex;
  isDesktopExpanded: boolean;
  isMobileOpen: boolean;
  isRecipeDetail: boolean;
  isSetupStage: boolean;
  onNavigate: (index: NavIndex) => void;
  onToggleDesktop: () => void;
  onCloseDesktop: () => void;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
}) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  function startSwipe(event: ReactPointerEvent<HTMLElement>, capturePointer = false) {
    swipeStart.current = { x: event.clientX, y: event.clientY };

    if (capturePointer && typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function finishOpenSwipe(event: ReactPointerEvent<HTMLElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;

    if (!start) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = Math.abs(event.clientY - start.y);

    if (deltaX > 48 && deltaY < 80) {
      onOpenMobile();
    }
  }

  function finishCloseSwipe(event: ReactPointerEvent<HTMLElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;

    if (!start) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = Math.abs(event.clientY - start.y);

    if (deltaX < -48 && deltaY < 80) {
      onCloseMobile();
    }
  }

  return (
    <>
      {isDesktopExpanded && (
        <button
          className="desktop-nav-dismiss"
          type="button"
          aria-label="Collapse navigation"
          onClick={onCloseDesktop}
        />
      )}

      <nav
        className="nav-rail desktop-nav-rail"
        data-expanded={isDesktopExpanded}
        aria-label="BokekLab navigation"
      >
        <Tooltip label={isDesktopExpanded ? "Collapse navigation" : "Expand navigation"}>
          <button className="avatar-button" type="button" aria-label="BokekLab" onClick={onToggleDesktop}>
            <ChefHat size={22} aria-hidden="true" />
            {isDesktopExpanded && <span>BokekLab</span>}
          </button>
        </Tooltip>

        <div className="nav-stack">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeIndex === item.index;

            return (
              <Tooltip label={item.tooltip} key={item.index}>
                <button
                  className="nav-button"
                  data-active={isActive}
                  type="button"
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onNavigate(item.index)}
                >
                  <span className="nav-icon-shell">
                    <Icon size={24} strokeWidth={isActive ? 2.6 : 2} aria-hidden="true" />
                  </span>
                  {isDesktopExpanded && <span className="nav-label">{item.shortLabel}</span>}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </nav>

      {!isRecipeDetail && !isSetupStage && (
        <Tooltip label={isMobileOpen ? "Tutup navigasi" : "Buka navigasi"}>
          <button
            className="mobile-menu-button"
            type="button"
            aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileOpen}
            onClick={() => (isMobileOpen ? onCloseMobile() : onOpenMobile())}
          >
            {isMobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </Tooltip>
      )}

      <div
        className="mobile-swipe-edge"
        aria-hidden="true"
        onPointerDown={(event) => startSwipe(event, true)}
        onPointerUp={finishOpenSwipe}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      />

      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.button
              className="mobile-nav-backdrop"
              type="button"
              aria-label="Close navigation menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
            />
            <motion.aside
              className="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="BokekLab navigation menu"
              initial={{ x: "-105%" }}
              animate={{ x: 0 }}
              exit={{ x: "-105%" }}
              transition={{ type: "spring", stiffness: 230, damping: 26 }}
              onPointerDown={(event) => startSwipe(event)}
              onPointerUp={finishCloseSwipe}
              onPointerCancel={() => {
                swipeStart.current = null;
              }}
            >
              <div className="mobile-nav-brand">
                <span>
                  <ChefHat size={24} aria-hidden="true" />
                </span>
                <div>
                  <strong>BokekLab</strong>
                </div>
              </div>
              <div className="mobile-nav-items">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeIndex === item.index;

                  return (
                    <button
                      className="mobile-nav-item"
                      data-active={isActive}
                      type="button"
                      aria-label={item.shortLabel}
                      aria-current={isActive ? "page" : undefined}
                      key={item.index}
                      onClick={() => onNavigate(item.index)}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <span className="nav-icon-shell">
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <span>{item.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function DapurDarurat({
  entryStage,
  sisaDompet,
  budgetMode,
  pantryMatrix,
  pantryMemory,
  lateMonthPlan,
  vibeProfile,
  selectedCount,
  isGenerating,
  homeInputMode,
  typedIngredientText,
  composerImages,
  photoStatus,
  photoError,
  photoSummary,
  onBudgetChange,
  onVibeChange,
  onToggleIngredient,
  onRemoveIngredient,
  onGenerate,
  onApplyPantryMemory,
  onSavePantryMemory,
  onPantryMemoryChange,
  onLateMonthPlanChange,
  onUseLateMonthBudget,
  onType,
  onTypedTextChange,
  onContinue,
  onPhotoFile,
  onRemoveComposerImage,
  onClearComposer,
  onBackHome,
  onClearPantry,
  onToggleSultanMode,
}: {
  entryStage: EntryStage;
  sisaDompet: number;
  budgetMode: BudgetMode;
  pantryMatrix: PantryMatrix;
  pantryMemory: PantryMemoryState;
  lateMonthPlan: LateMonthPlanState;
  vibeProfile: VibeProfile;
  selectedCount: number;
  isGenerating: boolean;
  homeInputMode: HomeInputMode;
  typedIngredientText: string;
  composerImages: ComposerImage[];
  photoStatus: PhotoStatus;
  photoError: string;
  photoSummary: string;
  onBudgetChange: (value: number) => void;
  onVibeChange: (value: VibeProfile) => void;
  onToggleIngredient: (groupKey: keyof PantryMatrix, item: string) => void;
  onRemoveIngredient: (item: string) => void;
  onGenerate: () => void;
  onApplyPantryMemory: () => void;
  onSavePantryMemory: () => void;
  onPantryMemoryChange: (memory: PantryMemoryState) => void;
  onLateMonthPlanChange: (plan: LateMonthPlanState) => void;
  onUseLateMonthBudget: () => void;
  onType: () => void;
  onTypedTextChange: (value: string) => void;
  onContinue: () => void;
  onPhotoFile: (file: File | undefined) => void;
  onRemoveComposerImage: (imageId: string) => void;
  onClearComposer: () => void;
  onBackHome: () => void;
  onClearPantry: () => void;
  onToggleSultanMode: () => void;
}) {
  return (
    <motion.section
      className="view-panel dapur-panel"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ type: "spring", stiffness: 160, damping: 22 }}
    >
      {entryStage === "home" ? (
        <HomeLauncher
          pantryMatrix={pantryMatrix}
          selectedCount={selectedCount}
          homeInputMode={homeInputMode}
          typedIngredientText={typedIngredientText}
          composerImages={composerImages}
          photoStatus={photoStatus}
          photoError={photoError}
          onToggleIngredient={onToggleIngredient}
          onPhotoFile={onPhotoFile}
          onType={onType}
          onTypedTextChange={onTypedTextChange}
          onContinue={onContinue}
          onRemoveComposerImage={onRemoveComposerImage}
          onClearComposer={onClearComposer}
        />
      ) : (
        <PantrySetup
          sisaDompet={sisaDompet}
          budgetMode={budgetMode}
          pantryMatrix={pantryMatrix}
          pantryMemory={pantryMemory}
          lateMonthPlan={lateMonthPlan}
          vibeProfile={vibeProfile}
          selectedCount={selectedCount}
          isGenerating={isGenerating}
          photoSummary={photoSummary}
          onBudgetChange={onBudgetChange}
          onVibeChange={onVibeChange}
          onRemoveIngredient={onRemoveIngredient}
          onGenerate={onGenerate}
          onApplyPantryMemory={onApplyPantryMemory}
          onSavePantryMemory={onSavePantryMemory}
          onPantryMemoryChange={onPantryMemoryChange}
          onLateMonthPlanChange={onLateMonthPlanChange}
          onUseLateMonthBudget={onUseLateMonthBudget}
          onBackHome={onBackHome}
          onClearPantry={onClearPantry}
          onToggleSultanMode={onToggleSultanMode}
        />
      )}
    </motion.section>
  );
}

function HomeLauncher({
  pantryMatrix,
  selectedCount,
  homeInputMode,
  typedIngredientText,
  composerImages,
  photoStatus,
  photoError,
  onToggleIngredient,
  onPhotoFile,
  onType,
  onTypedTextChange,
  onContinue,
  onRemoveComposerImage,
  onClearComposer,
}: {
  pantryMatrix: PantryMatrix;
  selectedCount: number;
  homeInputMode: HomeInputMode;
  typedIngredientText: string;
  composerImages: ComposerImage[];
  photoStatus: PhotoStatus;
  photoError: string;
  onToggleIngredient: (groupKey: keyof PantryMatrix, item: string) => void;
  onPhotoFile: (file: File | undefined) => void;
  onType: () => void;
  onTypedTextChange: (value: string) => void;
  onContinue: () => void;
  onRemoveComposerImage: (imageId: string) => void;
  onClearComposer: () => void;
}) {
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [isPhotoSourceOpen, setIsPhotoSourceOpen] = useState(false);
  const isPhotoLoading = photoStatus === "loading";
  const hasComposerContent = Boolean(typedIngredientText.trim()) || composerImages.length > 0;
  const canContinue = selectedCount > 0 || hasComposerContent;
  const hasChipOnlyIntent = homeInputMode === "idle" && selectedCount > 0;
  const showIngredientProcessing = isPhotoLoading && hasComposerContent;
  const handlePhotoFiles = (files: FileList | null) => {
    const remainingSlots = Math.max(0, 3 - composerImages.length);
    Array.from(files ?? [])
      .slice(0, remainingSlots)
      .forEach((file) => onPhotoFile(file));
  };
  const openPhotoSource = () => setIsPhotoSourceOpen((current) => !current);
  const chooseGallery = () => {
    setIsPhotoSourceOpen(false);
    galleryInputRef.current?.click();
  };
  const chooseCamera = () => {
    setIsPhotoSourceOpen(false);
    cameraInputRef.current?.click();
  };

  return (
    <div className="home-stage">
      <header className="home-header">
        <h1>Isi dapur, isi kepala, kita jadikan menu.</h1>
        <p>Bokek bukan buntu. Ini cuma constraint yang minta diakalin.</p>
      </header>

      <section className="home-chip-board" aria-label="Pilih bahan awal">
        {pantryGroups.flatMap((group) =>
          group.items.map((item) => {
            const isSelected = pantryMatrix[group.key].includes(item);
            const Icon = getIngredientIcon(group.key);

            return (
              <motion.button
                key={`${group.key}-${item}`}
                className="home-chip"
                data-selected={isSelected}
                type="button"
                whileTap={{ scale: 0.96, x: 2, y: 2 }}
                onClick={() => onToggleIngredient(group.key, item)}
              >
                <Icon size={16} aria-hidden="true" />
                {item}
              </motion.button>
            );
          }),
        )}
      </section>

      {photoError && <p className="inline-error">{photoError}</p>}

      <input
        ref={galleryInputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        onChange={(event) => {
          handlePhotoFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={(event) => {
          handlePhotoFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <LayoutGroup id="home-composer">
        <motion.div
          className="home-actions"
          data-mode={homeInputMode}
          data-ready={hasChipOnlyIntent}
          data-processing={showIngredientProcessing}
          layout
          transition={MORPH_SPRING}
        >
          <>
            {showIngredientProcessing ? (
              <motion.div
                className="ingredient-processing-pill"
                key="ingredient-processing"
                layout
                initial={{ opacity: 0, scale: 0.94, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 8 }}
                transition={MORPH_SPRING}
              >
                <Sparkles size={20} aria-hidden="true" />
                <span>Processing Ingredients...</span>
              </motion.div>
            ) : homeInputMode === "type" ? (
              <motion.div
                className="composer-card text-composer"
                key="type-composer"
                layout
                layoutId="type-action"
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 10 }}
                transition={MORPH_SPRING}
              >
                <AnimatePresence initial={false}>
                  {composerImages.length > 0 && (
                    <motion.div
                      key="type-images"
                      initial={{ opacity: 0, height: 0, y: 8 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0, y: 8 }}
                      transition={SOFT_SPRING}
                    >
                      <ImagePreviewStrip images={composerImages} onRemove={onRemoveComposerImage} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="text-input-row">
                  <button
                    className="type-inline-clear"
                    type="button"
                    aria-label="Clear typed input"
                    onClick={onClearComposer}
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                  <input
                    type="text"
                    value={typedIngredientText}
                    aria-label="Type ingredients"
                    placeholder="Type your ingredient"
                    onChange={(event) => onTypedTextChange(event.target.value)}
                  />
                </div>
              </motion.div>
            ) : homeInputMode === "photo" ? (
              <motion.div
                className="composer-card photo-composer"
                key="photo-composer"
                layout
                layoutId="photo-action"
                initial={{ opacity: 0, scale: 0.9, x: -18 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: -18 }}
                transition={MORPH_SPRING}
              >
                <ImagePreviewStrip images={composerImages} onRemove={onRemoveComposerImage} />
                {composerImages.length < 3 && (
                  <ActionButton
                    className="circle-action composer-side-action composer-add-photo"
                    type="button"
                    aria-label="Add photo"
                    tooltip="Tambahkan foto bahan lain"
                    disabled={isPhotoLoading}
                    onClick={openPhotoSource}
                  >
                    <Plus size={19} aria-hidden="true" />
                  </ActionButton>
                )}
                <button
                  className="circle-action composer-side-action photo-submit-button"
                  type="button"
                  aria-label="Continue"
                  disabled={!canContinue || isPhotoLoading}
                  onClick={onContinue}
                >
                  <ImageUp size={17} aria-hidden="true" />
                </button>
              </motion.div>
            ) : (
              <motion.div
                className="home-action-slot"
                key="photo-launcher"
                layout
                layoutId="photo-action"
                initial={{ opacity: 0, scale: 0.86, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.86, y: -10 }}
                transition={MORPH_SPRING}
              >
                <ActionButton
                  className={hasChipOnlyIntent ? "circle-action composer-side-action photo-side-action" : "launcher-button primary"}
                  type="button"
                  aria-label="Photo"
                  tooltip="Ambil dari kamera atau galeri"
                  disabled={isPhotoLoading}
                  onClick={openPhotoSource}
                >
                  <Camera size={21} aria-hidden="true" />
                  {hasChipOnlyIntent ? null : isPhotoLoading ? "Membaca..." : "Photo"}
                </ActionButton>
              </motion.div>
            )}

            {homeInputMode === "idle" && (
              <motion.div
                className="home-action-slot"
                key="type-launcher"
                layout
                layoutId="type-action"
                initial={{ opacity: 0, scale: 0.86, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.86, y: -10 }}
                transition={MORPH_SPRING}
              >
                <ActionButton
                  className={hasChipOnlyIntent ? "circle-action composer-side-action type-side-action" : "launcher-button"}
                  type="button"
                  aria-label="Type"
                  tooltip="Ketik bahan secara manual"
                  onClick={onType}
                >
                  <Keyboard size={21} aria-hidden="true" />
                  {hasChipOnlyIntent ? null : "Type"}
                </ActionButton>
              </motion.div>
            )}

            {homeInputMode === "type" && (
              <motion.div
                className="home-action-slot"
                key="type-submit"
                layout
                initial={{ opacity: 0, scale: 0.72, x: 12 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.72, x: 12 }}
                transition={MORPH_SPRING}
              >
                <button
                  className="circle-action composer-side-action composer-submit-button"
                  type="button"
                  aria-label="Continue"
                  disabled={!canContinue || isPhotoLoading}
                  onClick={onContinue}
                >
                  <ImageUp size={18} aria-hidden="true" />
                </button>
              </motion.div>
            )}

            {hasChipOnlyIntent && (
              <motion.div
                className="home-action-slot stretch-slot"
                key="continue-launcher"
                layout
                initial={{ opacity: 0, scaleX: 0.72, x: 18 }}
                animate={{ opacity: 1, scaleX: 1, x: 0 }}
                exit={{ opacity: 0, scaleX: 0.72, x: 18 }}
                transition={MORPH_SPRING}
              >
                <ActionButton
                  className="launcher-button primary stretch-action"
                  type="button"
                  aria-label="Continue"
                  tooltip="Lanjutkan dan susun Pantry Matrix"
                  disabled={!canContinue || isPhotoLoading}
                  onClick={onContinue}
                >
                  <ImageUp size={21} aria-hidden="true" />
                  Continue
                </ActionButton>
              </motion.div>
            )}
          </>
          <AnimatePresence>
            {isPhotoSourceOpen && (
              <motion.div
                className="photo-source-popover"
                key="photo-source-popover"
                initial={{ opacity: 0, scale: 0.92, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 8 }}
                transition={SOFT_SPRING}
              >
                <button type="button" onClick={chooseCamera}>
                  <Camera size={17} aria-hidden="true" />
                  Camera
                </button>
                <button type="button" onClick={chooseGallery}>
                  <ImageUp size={17} aria-hidden="true" />
                  Gallery
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </div>
  );
}

function ImagePreviewStrip({
  images,
  onRemove,
}: {
  images: ComposerImage[];
  onRemove: (imageId: string) => void;
}) {
  return (
    <div className="image-preview-strip">
      <AnimatePresence initial={false}>
        {images.map((image) => (
          <motion.figure
            className="image-preview"
            key={image.id}
            layout
            initial={{ opacity: 0, scale: 0.72, x: -12 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.72, x: -12 }}
            transition={SOFT_SPRING}
          >
            <img src={image.previewUrl} alt={image.name} />
            <button
              type="button"
              aria-label={`Remove ${image.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(image.id);
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </motion.figure>
        ))}
      </AnimatePresence>
    </div>
  );
}

function getIngredientIcon(groupKey: keyof PantryMatrix) {
  const icons = {
    carbs: Wheat,
    proteins: Egg,
    veggies: Leaf,
    condiments: Sparkles,
  };

  return icons[groupKey];
}

function PantrySetup({
  sisaDompet,
  budgetMode,
  pantryMatrix,
  pantryMemory,
  lateMonthPlan,
  vibeProfile,
  selectedCount,
  isGenerating,
  photoSummary,
  onBudgetChange,
  onVibeChange,
  onRemoveIngredient,
  onGenerate,
  onApplyPantryMemory,
  onSavePantryMemory,
  onPantryMemoryChange,
  onLateMonthPlanChange,
  onUseLateMonthBudget,
  onBackHome,
  onClearPantry,
  onToggleSultanMode,
}: {
  sisaDompet: number;
  budgetMode: BudgetMode;
  pantryMatrix: PantryMatrix;
  pantryMemory: PantryMemoryState;
  lateMonthPlan: LateMonthPlanState;
  vibeProfile: VibeProfile;
  selectedCount: number;
  isGenerating: boolean;
  photoSummary: string;
  onBudgetChange: (value: number) => void;
  onVibeChange: (value: VibeProfile) => void;
  onRemoveIngredient: (item: string) => void;
  onGenerate: () => void;
  onApplyPantryMemory: () => void;
  onSavePantryMemory: () => void;
  onPantryMemoryChange: (memory: PantryMemoryState) => void;
  onLateMonthPlanChange: (plan: LateMonthPlanState) => void;
  onUseLateMonthBudget: () => void;
  onBackHome: () => void;
  onClearPantry: () => void;
  onToggleSultanMode: () => void;
}) {
  const canGenerate = selectedCount > 0 && !isGenerating;

  return (
    <div className="setup-stage">
      <div className="setup-topline">
        <ActionButton
          className="setup-back-button"
          type="button"
          aria-label="Back to home"
          tooltip="Kembali ke pemilih bahan awal"
          onClick={onBackHome}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </ActionButton>
        {photoSummary && <span className="photo-summary">{photoSummary}</span>}
      </div>

      <div className="setup-grid">
        <div className="setup-left-stack">
          <PantryMatrixPanel
            pantryMatrix={pantryMatrix}
            selectedCount={selectedCount}
            onRemoveIngredient={onRemoveIngredient}
            onClearPantry={onClearPantry}
          />
          <PantryMemoryPanel
            memory={pantryMemory}
            selectedCount={selectedCount}
            onApply={onApplyPantryMemory}
            onSave={onSavePantryMemory}
            onChange={onPantryMemoryChange}
          />
        </div>
        <div className="setup-side-stack">
          <BudgetPanel
            value={sisaDompet}
            budgetMode={budgetMode}
            onChange={onBudgetChange}
            onToggleSultanMode={onToggleSultanMode}
          />
          <VibePanel budgetMode={budgetMode} value={vibeProfile} onChange={onVibeChange} />
          <LateMonthPlanPanel
            plan={lateMonthPlan}
            onChange={onLateMonthPlanChange}
            onUseDailyBudget={onUseLateMonthBudget}
          />
        </div>
      </div>

      <FloatingExecutionBar
        selectedCount={selectedCount}
        canGenerate={canGenerate}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
      />
    </div>
  );
}

function PantryMatrixPanel({
  pantryMatrix,
  selectedCount,
  onRemoveIngredient,
  onClearPantry,
}: {
  pantryMatrix: PantryMatrix;
  selectedCount: number;
  onRemoveIngredient: (item: string) => void;
  onClearPantry: () => void;
}) {
  const selectedRows = pantryGroups.flatMap((group) =>
    pantryMatrix[group.key].map((item) => ({
      item,
      groupKey: group.key,
      groupLabel: group.label,
      Icon: getIngredientIcon(group.key),
    })),
  );

  return (
    <section className="m3-card pantry-matrix-panel">
      <div className="panel-heading">
        <div>
          <p className="mono-label">Pantry Matrix</p>
          <h2>Bahan yang bisa dipakai</h2>
        </div>
        <span className="count-pill">{selectedCount} item</span>
      </div>

      <div className="matrix-list-shell">
        {selectedRows.length === 0 ? (
          <div className="matrix-empty-state">
            <span className="empty-token">Belum ada bahan dari Home.</span>
          </div>
        ) : (
          <ul className="matrix-ingredient-list" aria-label="Daftar bahan Pantry Matrix">
            {selectedRows.map(({ item, groupKey, groupLabel, Icon }) => (
              <li className="matrix-ingredient-row" key={`${groupKey}-${item}`}>
                <span className="matrix-ingredient-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="matrix-ingredient-copy">
                  <strong>{item}</strong>
                  <small>{groupLabel}</small>
                </span>
                <button type="button" aria-label={`Hapus ${item}`} onClick={() => onRemoveIngredient(item)}>
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ActionButton
        className="ghost-action"
        type="button"
        aria-label="Kosongkan pantry"
        tooltip="Hapus semua bahan dari Pantry Matrix"
        onClick={onClearPantry}
      >
        <X size={16} aria-hidden="true" />
        Kosongkan pantry
      </ActionButton>
    </section>
  );
}

function PantryMemoryPanel({
  memory,
  selectedCount,
  onApply,
  onSave,
  onChange,
}: {
  memory: PantryMemoryState;
  selectedCount: number;
  onApply: () => void;
  onSave: () => void;
  onChange: (memory: PantryMemoryState) => void;
}) {
  const memoryCount = pantryItemCount(memory.staples);
  const previewItems = pantryGroups.flatMap((group) => memory.staples[group.key]).slice(0, 6);

  return (
    <section className="m3-card pantry-memory-panel">
      <div className="panel-heading">
        <div>
          <p className="mono-label">Pantry Memory</p>
          <h2>Dapur yang selalu ada</h2>
          <p>Simpen bahan langganan biar input berikutnya nggak mulai dari nol.</p>
        </div>
        <button
          className="settings-toggle compact"
          type="button"
          data-active={memory.enabled}
          aria-pressed={memory.enabled}
          aria-label="Toggle Pantry Memory"
          onClick={() => onChange({ ...memory, enabled: !memory.enabled })}
        >
          {memory.enabled ? "On" : "Off"}
        </button>
      </div>
      <div className="memory-chip-row" aria-label="Bahan Pantry Memory">
        {previewItems.length > 0 ? (
          previewItems.map((item) => <span key={item}>{item}</span>)
        ) : (
          <span className="empty-token">Belum ada bahan memori.</span>
        )}
      </div>
      <div className="feature-action-row">
        <ActionButton
          className="secondary-button"
          type="button"
          aria-label="Apply Pantry Memory"
          tooltip="Tambahkan bahan memori ke Pantry Matrix"
          disabled={!memory.enabled || memoryCount === 0}
          onClick={onApply}
        >
          <ArchiveRestore size={17} aria-hidden="true" />
          Pakai memori
        </ActionButton>
        <ActionButton
          className="ghost-action"
          type="button"
          aria-label="Save current pantry to memory"
          tooltip="Simpan bahan saat ini ke Pantry Memory"
          disabled={selectedCount === 0}
          onClick={onSave}
        >
          <Plus size={17} aria-hidden="true" />
          Simpan pantry
        </ActionButton>
      </div>
    </section>
  );
}

function LateMonthPlanPanel({
  plan,
  onChange,
  onUseDailyBudget,
}: {
  plan: LateMonthPlanState;
  onChange: (plan: LateMonthPlanState) => void;
  onUseDailyBudget: () => void;
}) {
  const dailyBudget = Math.floor(plan.budget / Math.max(1, plan.days));
  const mealsPerDay = dailyBudget >= 20000 ? 2 : 1;

  return (
    <section className="m3-card late-month-panel">
      <div className="panel-heading">
        <div>
          <p className="mono-label">Late Month Meal</p>
          <h2>Rencana sampai gajian</h2>
          <p>{formatRupiah(dailyBudget)} per hari untuk sekitar {mealsPerDay} menu hemat.</p>
        </div>
        <button
          className="settings-toggle compact"
          type="button"
          data-active={plan.enabled}
          aria-pressed={plan.enabled}
          aria-label="Toggle Late Month Meal Plan"
          onClick={() => onChange({ ...plan, enabled: !plan.enabled })}
        >
          {plan.enabled ? "On" : "Off"}
        </button>
      </div>
      <div className="late-plan-grid">
        <label>
          <span>Hari tersisa</span>
          <input
            type="number"
            min="1"
            max="14"
            value={plan.days}
            onChange={(event) =>
              onChange({ ...plan, days: Math.min(14, Math.max(1, Number(event.target.value) || 1)) })
            }
          />
        </label>
        <label>
          <span>Total budget</span>
          <input
            type="number"
            min="0"
            max="250000"
            step="1000"
            value={plan.budget}
            onChange={(event) =>
              onChange({ ...plan, budget: Math.min(250000, Math.max(0, Number(event.target.value) || 0)) })
            }
          />
        </label>
      </div>
      <ActionButton
        className="secondary-button"
        type="button"
        aria-label="Use daily late-month budget"
        tooltip="Pakai budget harian ini sebagai Sisa Dompet"
        disabled={!plan.enabled}
        onClick={onUseDailyBudget}
      >
        <Wallet size={17} aria-hidden="true" />
        Pakai budget harian
      </ActionButton>
    </section>
  );
}

function BudgetPanel({
  value,
  budgetMode,
  onChange,
  onToggleSultanMode,
}: {
  value: number;
  budgetMode: BudgetMode;
  onChange: (value: number) => void;
  onToggleSultanMode: () => void;
}) {
  const walletClicks = useRef<number[]>([]);
  const max = budgetMode === "sultan" ? SULTAN_BUDGET_MAX : NORMAL_BUDGET_MAX;
  const progress = `${(value / max) * 100}%`;
  const normalCut = budgetMode === "sultan" ? "10%" : "100%";

  function handleWalletClick() {
    const now = Date.now();
    walletClicks.current = [...walletClicks.current.filter((click) => now - click < 700), now];

    if (walletClicks.current.length >= 3) {
      walletClicks.current = [];
      onToggleSultanMode();
    }
  }

  return (
    <section className="m3-card budget-panel" data-budget-mode={budgetMode}>
      <div className="panel-heading budget-heading">
        <div>
          <p className="mono-label">Sisa Dompet</p>
          <h2>{budgetMode === "sultan" ? "SULTAN MODE" : "Realita Dompet"}</h2>
        </div>
        <button
          className="wallet-trigger"
          type="button"
          aria-label="Toggle Sultan Mode"
          onClick={handleWalletClick}
        >
          <Wallet size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="budget-value">{formatRupiah(value)}</div>
      <div
        className="budget-slider-shell"
        style={
          {
            "--budget-progress": progress,
            "--normal-cut": normalCut,
          } as CSSProperties
        }
      >
        <div className="budget-track" aria-hidden="true">
          <span className="track-solid" />
          <span className="track-dotted" />
          <span className="track-fill" />
        </div>
        <input
          className="budget-range"
          type="range"
          min="0"
          max={max}
          step="1000"
          value={value}
          aria-label="Sisa dompet"
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <div className="slider-scale">
        <span>Rp 0</span>
        <span>Rp 25.000</span>
        {budgetMode === "sultan" && <span>Rp 250.000</span>}
      </div>
    </section>
  );
}

function VibePanel({
  budgetMode,
  value,
  onChange,
}: {
  budgetMode: BudgetMode;
  value: VibeProfile;
  onChange: (value: VibeProfile) => void;
}) {
  const options = budgetMode === "sultan" ? sultanVibeProfiles : standardVibeProfiles;

  return (
    <section className="m3-card vibe-panel">
      <div className="panel-heading">
        <div>
          <p className="mono-label">Vibe Profile</p>
          <h2>Pilih gaya racikan</h2>
        </div>
        <Flame size={24} aria-hidden="true" />
      </div>
      <div className="vibe-list">
        {options.map((profile) => {
          const isActive = value === profile.value;
          const Icon = getVibeIcon(profile.icon);

          return (
            <button
              key={profile.value}
              className="vibe-option-button"
              data-active={isActive}
              type="button"
              onClick={() => onChange(profile.value)}
            >
              <span className="vibe-option-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>{profile.title}</strong>
                <small>{profile.caption}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function getVibeIcon(icon: string) {
  const icons = {
    flame: Flame,
    store: Store,
    leaf: Leaf,
    crown: Crown,
    sparkles: Sparkles,
    beef: Beef,
  };

  return icons[icon as keyof typeof icons] ?? Sparkles;
}

function FloatingExecutionBar({
  selectedCount,
  canGenerate,
  isGenerating,
  onGenerate,
}: {
  selectedCount: number;
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  return (
    <section className="floating-execute-bar" aria-label="Execution controls">
      <div className="execute-status-copy">
        <p className="mono-label">Execution</p>
        <strong>
          {selectedCount > 0
            ? `${selectedCount} bahan siap diracik`
            : "Pilih bahan dulu biar AI punya pegangan"}
        </strong>
      </div>
      <ActionButton
        className="execute-pill-button"
        type="button"
        aria-label="Execute"
        tooltip="Kunci input saat ini dan mulai proses generasi resep"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        <Utensils size={20} aria-hidden="true" />
        {isGenerating ? "Executing..." : "Execute"}
      </ActionButton>
    </section>
  );
}

type RecipeIngredientRow = RecipeIngredient & {
  id: string;
};

function getRecipeIngredientRows(recipe: RecipeResponse): RecipeIngredientRow[] {
  return recipe.ingredients.map((ingredient, index) => ({
    ...ingredient,
    id: `${index}-${ingredient.source}-${ingredient.category}-${ingredient.item}`,
  }));
}

function RecipesPage({
  status,
  error,
  frozenPayload,
  savedRecipes,
  selectedRecipe,
  activeCookSession,
  activeCookRecipe,
  isCookSessionExpanded,
  recipeFilter,
  onRetry,
  onRecipeFilterChange,
  onBackToDesk,
  onBackToList,
  onOpen,
  onDelete,
  onToggleFavorite,
  onStartCooking,
  onToggleCookIngredient,
  onToggleCookExpanded,
  onUnpinCooking,
  onCompleteCookingStep,
}: {
  status: GenerationStatus;
  error: string;
  frozenPayload: GenerateRecipeRequest | null;
  savedRecipes: SavedRecipe[];
  selectedRecipe: SavedRecipe | null;
  activeCookSession: ActiveCookSession | null;
  activeCookRecipe: SavedRecipe | null;
  isCookSessionExpanded: boolean;
  recipeFilter: "all" | "liked";
  onRetry: () => void;
  onRecipeFilterChange: (value: "all" | "liked") => void;
  onBackToDesk: () => void;
  onBackToList: () => void;
  onOpen: (recipe: SavedRecipe) => void;
  onDelete: (recipeId: string) => void;
  onToggleFavorite: (recipeId: string) => void;
  onStartCooking: (recipeId: string) => void;
  onToggleCookIngredient: (recipe: SavedRecipe, ingredientId: string) => void;
  onToggleCookExpanded: () => void;
  onUnpinCooking: () => void;
  onCompleteCookingStep: (recipe: SavedRecipe, stepId: string) => void;
}) {
  return (
    <motion.section
      className="view-panel recipes-panel"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ type: "spring", stiffness: 160, damping: 22 }}
    >
      {status === "loading" && <LoadingCanvas />}

      {status === "error" && (
        <StateCard
          title="Racikan ketahan di pintu API."
          body={error || "Cek konfigurasi VERTEX_API_KEY lalu coba lagi."}
          actionLabel={frozenPayload ? "Coba lagi" : "Balik ke Home"}
          actionTooltip={
            frozenPayload
              ? "Kirim ulang payload yang sama ke AI"
              : "Kembali ke halaman setup Pantry Matrix"
          }
          onAction={frozenPayload ? onRetry : onBackToDesk}
        />
      )}

      {status !== "loading" && status !== "error" && selectedRecipe && (
        <RecipeDetail
          savedRecipe={selectedRecipe}
          onBack={onBackToList}
          onDelete={() => onDelete(selectedRecipe.id)}
          onToggleFavorite={() => onToggleFavorite(selectedRecipe.id)}
          onStartCooking={() => onStartCooking(selectedRecipe.id)}
        />
      )}

      {status !== "loading" && status !== "error" && !selectedRecipe && (
        <RecipeLibrary
          savedRecipes={savedRecipes}
          activeCookSession={activeCookSession}
          activeCookRecipe={activeCookRecipe}
          isCookSessionExpanded={isCookSessionExpanded}
          recipeFilter={recipeFilter}
          onRecipeFilterChange={onRecipeFilterChange}
          onOpen={onOpen}
          onDelete={onDelete}
          onBackToDesk={onBackToDesk}
          onToggleCookIngredient={onToggleCookIngredient}
          onToggleCookExpanded={onToggleCookExpanded}
          onUnpinCooking={onUnpinCooking}
          onCompleteCookingStep={onCompleteCookingStep}
        />
      )}
    </motion.section>
  );
}

function LoadingCanvas() {
  return (
    <div className="loader-shell">
      <div className="loader-card">
        <div className="orb-loader">
          <span className="orb-ring ring-one" />
          <span className="orb-ring ring-two" />
          <Sparkles size={42} aria-hidden="true" />
        </div>
        <div>
          <h2>Sabar ya...</h2>
          <p>AI lagi meracik bumbu rahasia buat kamu...</p>
        </div>
        <div className="loading-bar">
          <span />
        </div>
      </div>
    </div>
  );
}

function StateCard({
  title,
  body,
  actionLabel,
  actionTooltip,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  actionTooltip: string;
  onAction: () => void;
}) {
  return (
    <div className="state-card">
      <Sparkles size={38} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{body}</p>
      <ActionButton
        className="secondary-button"
        type="button"
        aria-label={actionLabel}
        tooltip={actionTooltip}
        onClick={onAction}
      >
        {actionLabel}
      </ActionButton>
    </div>
  );
}

function SettingsPage({
  settings,
  appVersion,
  authUser,
  usageToday,
  savedRecipeCount,
  pantryMemory,
  lateMonthPlan,
  onSettingsChange,
  onPantryMemoryChange,
  onRemoveMemoryIngredient,
  onLateMonthPlanChange,
  onWipeRecipes,
  onSignOut,
}: {
  settings: AppSettings;
  appVersion: string;
  authUser: AuthUserState | null;
  usageToday: UsageTodayResponse | null;
  savedRecipeCount: number;
  pantryMemory: PantryMemoryState;
  lateMonthPlan: LateMonthPlanState;
  onSettingsChange: (settings: AppSettings) => void;
  onPantryMemoryChange: (memory: PantryMemoryState) => void;
  onRemoveMemoryIngredient: (item: string) => void;
  onLateMonthPlanChange: (plan: LateMonthPlanState) => void;
  onWipeRecipes: () => void | Promise<void>;
  onSignOut: () => void;
}) {
  const recipeLimitPercent = usageToday
    ? Math.min(100, Math.round((usageToday.recipeGenerations / usageToday.recipeDailyLimit) * 100))
    : 0;

  return (
    <motion.section
      className="view-panel settings-panel"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ type: "spring", stiffness: 160, damping: 22 }}
    >
      <div className="settings-grid">
        <article className="settings-card">
          <div>
            <p className="mono-label">appearance</p>
            <h2>Dark mode</h2>
            <p>Mode gelap tetap mengikuti warna Home, Recipes, dan Campaign.</p>
          </div>
          <button
            className="settings-toggle"
            type="button"
            data-active={settings.darkMode}
            aria-pressed={settings.darkMode}
            aria-label="Toggle dark mode"
            onClick={() => onSettingsChange({ ...settings, darkMode: !settings.darkMode })}
          >
            <span>{settings.darkMode ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}</span>
            {settings.darkMode ? "Dark" : "Light"}
          </button>
        </article>

        <article className="settings-card danger-zone">
          <div>
            <p className="mono-label">recipe log</p>
            <h2>Wipe Recipe Log</h2>
            <p>{savedRecipeCount} resep tersimpan akan dihapus permanen dari perangkat ini.</p>
          </div>
          <ActionButton
            className="wipe-button"
            type="button"
            aria-label="Wipe Log"
            tooltip="Hapus permanen semua resep tersimpan"
            disabled={savedRecipeCount === 0}
            onClick={onWipeRecipes}
          >
            <Trash2 size={18} aria-hidden="true" />
            Wipe Log
          </ActionButton>
        </article>

        <article className="settings-card usage-card">
          <div>
            <p className="mono-label">daily limit</p>
            <h2>Recipe limit</h2>
            <p>
              {usageToday
                ? `${usageToday.recipeGenerations} / ${usageToday.recipeDailyLimit} resep hari ini. Reset ${formatCompactDate(usageToday.resetAt)}.`
                : "Limit harian akan tampil setelah akun tersambung."}
            </p>
            <div className="usage-meter" aria-label="Recipe daily limit gauge">
              <span style={{ width: `${recipeLimitPercent}%` }} />
            </div>
          </div>
          <Sparkles size={28} aria-hidden="true" />
        </article>

        <article className="settings-card pantry-memory-settings">
          <div>
            <p className="mono-label">pantry memory</p>
            <h2>{pantryItemCount(pantryMemory.staples)} bahan diingat</h2>
            <p>Memori ini lokal di browser dulu, aman buat eksperimen branch sebelum Firestore sync.</p>
            <div className="memory-chip-row settings-memory-list">
              {pantryGroups.flatMap((group) => pantryMemory.staples[group.key]).length > 0 ? (
                pantryGroups.flatMap((group) =>
                  pantryMemory.staples[group.key].map((item) => (
                    <button type="button" key={`${group.key}-${item}`} onClick={() => onRemoveMemoryIngredient(item)}>
                      {item}
                      <X size={13} aria-hidden="true" />
                    </button>
                  )),
                )
              ) : (
                <span className="empty-token">Belum ada staples.</span>
              )}
            </div>
          </div>
          <button
            className="settings-toggle"
            type="button"
            data-active={pantryMemory.enabled}
            aria-pressed={pantryMemory.enabled}
            aria-label="Toggle Pantry Memory"
            onClick={() => onPantryMemoryChange({ ...pantryMemory, enabled: !pantryMemory.enabled })}
          >
            <span><ArchiveRestore size={17} aria-hidden="true" /></span>
            {pantryMemory.enabled ? "On" : "Off"}
          </button>
        </article>

        <article className="settings-card">
          <div>
            <p className="mono-label">late month</p>
            <h2>{lateMonthPlan.enabled ? "Planner aktif" : "Planner nonaktif"}</h2>
            <p>
              {lateMonthPlan.days} hari, total {formatRupiah(lateMonthPlan.budget)}, sekitar{" "}
              {formatRupiah(Math.floor(lateMonthPlan.budget / Math.max(1, lateMonthPlan.days)))} per hari.
            </p>
          </div>
          <button
            className="settings-toggle"
            type="button"
            data-active={lateMonthPlan.enabled}
            aria-pressed={lateMonthPlan.enabled}
            aria-label="Toggle Late Month Plan"
            onClick={() => onLateMonthPlanChange({ ...lateMonthPlan, enabled: !lateMonthPlan.enabled })}
          >
            <span><Wallet size={17} aria-hidden="true" /></span>
            {lateMonthPlan.enabled ? "On" : "Off"}
          </button>
        </article>

        <article className="settings-card">
          <div>
            <p className="mono-label">account</p>
            <h2>{authUser?.displayName || authUser?.email || "Local mode"}</h2>
            <p>BokekLab v{appVersion}</p>
          </div>
          {authUser && (
            <ActionButton
              className="secondary-button"
              type="button"
              aria-label="Sign out"
              tooltip="Keluar dari akun"
              onClick={onSignOut}
            >
              <LogOut size={18} aria-hidden="true" />
              Sign out
            </ActionButton>
          )}
        </article>

        <article className="settings-card future-settings">
          <div>
            <p className="mono-label">soon</p>
            <h2>Future controls</h2>
            <p>Slot ini disiapkan untuk image generator, preferensi nutrisi, dan preset dapur.</p>
          </div>
          <Sparkles size={28} aria-hidden="true" />
        </article>
      </div>
    </motion.section>
  );
}

function RecipeLibrary({
  savedRecipes,
  activeCookSession,
  activeCookRecipe,
  isCookSessionExpanded,
  recipeFilter,
  onRecipeFilterChange,
  onOpen,
  onDelete,
  onBackToDesk,
  onToggleCookIngredient,
  onToggleCookExpanded,
  onUnpinCooking,
  onCompleteCookingStep,
}: {
  savedRecipes: SavedRecipe[];
  activeCookSession: ActiveCookSession | null;
  activeCookRecipe: SavedRecipe | null;
  isCookSessionExpanded: boolean;
  recipeFilter: "all" | "liked";
  onRecipeFilterChange: (value: "all" | "liked") => void;
  onOpen: (recipe: SavedRecipe) => void;
  onDelete: (recipeId: string) => void;
  onBackToDesk: () => void;
  onToggleCookIngredient: (recipe: SavedRecipe, ingredientId: string) => void;
  onToggleCookExpanded: () => void;
  onUnpinCooking: () => void;
  onCompleteCookingStep: (recipe: SavedRecipe, stepId: string) => void;
}) {
  const filteredRecipes = recipeFilter === "liked"
    ? savedRecipes.filter((savedRecipe) => savedRecipe.isFavorite)
    : savedRecipes;

  return (
    <motion.div
      className="recipes-library"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={SOFT_SPRING}
    >
      {activeCookSession && activeCookRecipe && (
        <CookSessionPanel
          session={activeCookSession}
          savedRecipe={activeCookRecipe}
          isExpanded={isCookSessionExpanded}
          onToggleIngredient={(ingredientId) => onToggleCookIngredient(activeCookRecipe, ingredientId)}
          onToggleExpanded={onToggleCookExpanded}
          onUnpin={onUnpinCooking}
          onCompleteStep={(stepId) => onCompleteCookingStep(activeCookRecipe, stepId)}
        />
      )}

      <div className="recipes-library-content" data-cook-expanded={isCookSessionExpanded}>
        {savedRecipes.length === 0 ? (
          <div className="state-card saved-empty">
          <ArchiveRestore size={42} aria-hidden="true" />
          <h2>Belum ada resep.</h2>
          <p>Generate dari Home dulu, nanti hasilnya otomatis masuk ke Recipes.</p>
          <ActionButton
            className="secondary-button"
            type="button"
            aria-label="Open Home"
            tooltip="Kembali ke Home untuk meracik resep baru"
            onClick={onBackToDesk}
          >
            Open Home
          </ActionButton>
          </div>
        ) : (
          <>
            <div className="recipes-library-toolbar">
              <div />
              <RecipeFilterSwitch value={recipeFilter} onChange={onRecipeFilterChange} />
            </div>

            {filteredRecipes.length === 0 ? (
              <div className="state-card saved-empty compact-empty">
                <Heart size={34} aria-hidden="true" />
                <h2>Belum ada resep favorit.</h2>
                <p>Tekan ikon hati di detail resep untuk masuk ke daftar ini.</p>
              </div>
            ) : (
              <motion.div className="recipes-grid" layout>
                <AnimatePresence mode="popLayout">
                  {filteredRecipes.map((savedRecipe) => (
                    <RecipeCard
                      key={savedRecipe.id}
                      savedRecipe={savedRecipe}
                      onOpen={() => onOpen(savedRecipe)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function RecipeCard({
  savedRecipe,
  onOpen,
}: {
  savedRecipe: SavedRecipe;
  onOpen: () => void;
}) {
  const ingredientCount = getRecipeIngredientRows(savedRecipe.recipe).length;
  const nutriLevel = classifyNutriLevel(savedRecipe.recipe.nutritionEstimate);

  return (
    <motion.article
      className="saved-card recipe-card"
      role="button"
      tabIndex={0}
      aria-label={`Buka ${savedRecipe.recipe.recipeName}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.98 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      transition={SOFT_SPRING}
    >
      <RecipeImage recipe={savedRecipe.recipe} compact />
      <div>
        <p className="mono-label">{formatCompactDate(savedRecipe.createdAt)}</p>
        <h2>{savedRecipe.recipe.recipeName}</h2>
      </div>
      <div className="saved-meta">
        <span className="nutri-meta" data-level={nutriLevel.level}>NutriLevel {nutriLevel.level}</span>
        <span>{savedRecipe.recipe.estimatedCostText}</span>
        <span>{ingredientCount} bahan</span>
        {savedRecipe.completedAt && <span className="complete-meta">Complete</span>}
      </div>
    </motion.article>
  );
}

function RecipeDetail({
  savedRecipe,
  onBack,
  onDelete,
  onToggleFavorite,
  onStartCooking,
}: {
  savedRecipe: SavedRecipe;
  onBack: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onStartCooking: () => void;
}) {
  const recipe = savedRecipe.recipe;
  const nutriLevel = classifyNutriLevel(recipe.nutritionEstimate);

  return (
    <motion.div
      className="recipe-detail-shell"
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.985 }}
      transition={SOFT_SPRING}
    >
      <section className="recipe-detail-hero">
        <RecipeImage recipe={recipe} />
        <div className="recipe-back-anchor">
          <ActionButton
            className="recipe-back-float"
            type="button"
            aria-label="Back to recipes"
            tooltip="Kembali ke daftar Recipes"
            onClick={onBack}
          >
            <ArrowLeft size={24} aria-hidden="true" />
          </ActionButton>
        </div>
        <div className="recipe-hero-actions">
          <ActionButton
            className="recipe-hero-icon"
            type="button"
            aria-label={savedRecipe.isFavorite ? "Remove favorite recipe" : "Favorite recipe"}
            tooltip={savedRecipe.isFavorite ? "Hapus dari favorit" : "Tandai favorit"}
            data-active={savedRecipe.isFavorite}
            onClick={onToggleFavorite}
          >
            <Heart size={21} fill={savedRecipe.isFavorite ? "currentColor" : "none"} aria-hidden="true" />
          </ActionButton>
          <ActionButton
            className="recipe-hero-icon danger"
            type="button"
            aria-label="Delete recipe"
            tooltip="Hapus resep ini"
            onClick={onDelete}
          >
            <Trash2 size={21} aria-hidden="true" />
          </ActionButton>
        </div>
        <div className="recipe-hero-copy">
          <div className="recipe-hero-chip-row">
            <span className="nutri-pill" data-level={nutriLevel.level}>NutriLevel {nutriLevel.level}</span>
            <span className="cost-pill">{recipe.estimatedCostText}</span>
          </div>
          <h1>{recipe.recipeName}</h1>
        </div>
      </section>

      <section className="recipe-detail-intro">
        <p>{recipe.briefDescription}</p>
        <div className="hero-actions">
          {savedRecipe.completedAt && <span className="complete-pill">Complete</span>}
        </div>
      </section>

      <section className="nutrition-panel">
        <div className="panel-heading">
          <div>
            <p className="mono-label">nutrition per portion</p>
            <h2>
              <strong>{Math.round(recipe.nutritionEstimate.caloriesKcal)}</strong>
              <span>kcal</span>
            </h2>
          </div>
          <Sparkles size={24} aria-hidden="true" />
        </div>
        <div className="nutrition-chip-row">
          <span>{recipe.nutritionEstimate.proteinGrams}g Protein</span>
          <span>{recipe.nutritionEstimate.fiberGrams}g Fibre</span>
          <span>{recipe.nutritionEstimate.carbsGrams}g Carb</span>
          <span>{recipe.nutritionEstimate.sugarGrams}g Sugar</span>
          <span>{recipe.nutritionEstimate.fatGrams}g Fat</span>
          <span>{recipe.nutritionEstimate.sodiumMg}mg Natrium</span>
        </div>
        <p className="mono-label nutri-level-label">Kemenkes Nutrilevel</p>
        <div className="nutri-level-grid" aria-label="NutriLevel breakdown">
          <span>Gula <strong>{nutriLevel.sugarLevel}</strong></span>
          <span>Natrium <strong>{nutriLevel.sodiumLevel}</strong></span>
          <span>Lemak <strong>{nutriLevel.fatLevel}</strong></span>
        </div>
        {recipe.nutritionEstimate.warnings.length > 0 && (
          <div className="nutrition-warnings" role="list" aria-label="Peringatan nutrisi">
            {recipe.nutritionEstimate.warnings.map((warning) => (
              <p role="listitem" key={warning}>
                {warning}
              </p>
            ))}
          </div>
        )}
      </section>

      <IngredientPreviewPanel recipe={recipe} />

      <section className="step-sequence recipe-steps-timeline" aria-label="Preview langkah memasak">
        <div className="panel-heading">
          <div>
            <p className="mono-label">cooking steps</p>
            <h2>Langkah memasak</h2>
          </div>
        </div>
        {recipe.steps.map((step) => (
          <motion.article
            className="step-card"
            key={`${step.stepNumber}-${step.phaseTitle}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 170, damping: 20 }}
          >
            <div className="step-badge">{step.stepNumber}</div>
            <div>
              <p className="mono-label">{step.phaseTitle}</p>
              <p className="step-instruction">{step.detailInstruction}</p>
            </div>
          </motion.article>
        ))}
      </section>

      <div className="make-fab-shell">
        <ActionButton
          className="make-fab"
          type="button"
          aria-label="Mari Masak!"
          tooltip="Mulai checklist bahan dan langkah memasak"
          onClick={onStartCooking}
        >
          <Utensils size={20} aria-hidden="true" />
          <span>Mari Masak!</span>
        </ActionButton>
      </div>
    </motion.div>
  );
}

function RecipeImage({ recipe, compact = false }: { recipe: RecipeResponse; compact?: boolean }) {
  const hasImage = recipe.imageStatus === "ready" && recipe.imageUrl;

  return (
    <div
      className="recipe-placeholder"
      data-compact={compact}
      data-image-status={recipe.imageStatus}
      aria-label={hasImage ? `${recipe.recipeName} image` : "Recipe image unavailable"}
    >
      {hasImage ? (
        <img src={recipe.imageUrl} alt={recipe.recipeName} />
      ) : (
        <>
          <Sparkles size={compact ? 22 : 34} aria-hidden="true" />
          <span>{recipe.imageStatus === "failed" ? "Image unavailable" : "Preparing recipe image"}</span>
        </>
      )}
    </div>
  );
}

function IngredientPreviewPanel({ recipe }: { recipe: RecipeResponse }) {
  const [activeSubstitutionId, setActiveSubstitutionId] = useState<string | null>(null);
  const rows = getRecipeIngredientRows(recipe);

  return (
    <section className="warung-panel ingredient-preview-panel">
      <div className="warung-heading">
        <div>
          <h2>Ingredients</h2>
        </div>
        <Store size={26} aria-hidden="true" />
      </div>
      <div className="ingredient-preview-grid">
        {rows.map((ingredient) => {
          const isOpen = activeSubstitutionId === ingredient.id;
          const suggestions = getSubstitutionSuggestions(ingredient);

          return (
            <div className="ingredient-preview-stack" key={ingredient.id}>
              <div className="ingredient-preview-row">
                <span className="ingredient-source-dot" data-source={ingredient.source} />
                <span>
                  <strong>{ingredient.item}</strong>
                  <small>{ingredient.amountText}</small>
                </span>
                <span className="warung-cost">
                  {ingredient.source === "warung"
                    ? formatRupiah(ingredient.estimatedLocalCost ?? 0)
                    : "Pantry"}
                </span>
                <button
                  className="swap-helper-button"
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`Lihat pengganti ${ingredient.item}`}
                  onClick={() => setActiveSubstitutionId(isOpen ? null : ingredient.id)}
                >
                  Ganti
                </button>
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="substitution-panel"
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={SOFT_SPRING}
                  >
                    <p className="mono-label">Smart substitutions</p>
                    <div className="memory-chip-row">
                      {suggestions.map((suggestion) => (
                        <span key={suggestion}>{suggestion}</span>
                      ))}
                    </div>
                    <small>
                      Pakai takaran mendekati bahan asli, lalu cek rasa sebelum lanjut masak.
                    </small>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CookSessionPanel({
  session,
  savedRecipe,
  isExpanded,
  onToggleIngredient,
  onToggleExpanded,
  onUnpin,
  onCompleteStep,
}: {
  session: ActiveCookSession;
  savedRecipe: SavedRecipe;
  isExpanded: boolean;
  onToggleIngredient: (ingredientId: string) => void;
  onToggleExpanded: () => void;
  onUnpin: () => void;
  onCompleteStep: (stepId: string) => void;
}) {
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const rows = getRecipeIngredientRows(savedRecipe.recipe);
  const checkedCount = rows.filter((row) => session.checkedIngredients[row.id]).length;
  const missingRows = rows.filter((row) => !session.checkedIngredients[row.id]);
  const checkedStepCount = savedRecipe.recipe.steps.filter((step) =>
    session.checkedSteps[String(step.stepNumber)],
  ).length;
  const nextStep = savedRecipe.recipe.steps.find(
    (step) => !session.checkedSteps[String(step.stepNumber)],
  );
  const isIngredientsPhase = session.phase === "ingredients";
  const compactMeta = isIngredientsPhase
    ? missingRows.length > 0
      ? `${missingRows.length} bahan belum siap`
      : "Bahan siap, lanjut masak"
    : `${checkedStepCount}/${savedRecipe.recipe.steps.length} langkah selesai`;
  const compactHint = isIngredientsPhase
    ? missingRows[0]
      ? `${missingRows[0].item} - ${missingRows[0].amountText}`
      : "Semua bahan sudah dicek."
    : nextStep
      ? `Langkah berikutnya: ${nextStep.phaseTitle}`
      : "Semua langkah selesai.";
  const phaseStatus = isIngredientsPhase
    ? `Ingredients - ${missingRows.length} bahan belum siap`
    : `${checkedStepCount}/${savedRecipe.recipe.steps.length} langkah selesai - Menyiapkan bahan`;

  function isCookInteractiveTarget(target: EventTarget) {
    return target instanceof HTMLElement && Boolean(target.closest(
      "button,input,label,.cook-check-row,.cook-step-row",
    ));
  }

  function handlePanelPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (isCookInteractiveTarget(event.target)) {
      gestureStart.current = null;
      return;
    }

    gestureStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePanelPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = gestureStart.current;
    gestureStart.current = null;

    if (!start || isCookInteractiveTarget(event.target)) {
      return;
    }

    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = event.clientY - start.y;

    if (deltaX > 90 || Math.abs(deltaY) < 42) {
      return;
    }

    if (!isExpanded && deltaY < 0) {
      onToggleExpanded();
    }

    if (isExpanded && deltaY > 0) {
      onToggleExpanded();
    }
  }

  function handlePanelClick(event: ReactMouseEvent<HTMLElement>) {
    if (isExpanded || isCookInteractiveTarget(event.target)) {
      return;
    }

    onToggleExpanded();
  }

  return (
    <>
      <AnimatePresence>
        {isExpanded && (
          <motion.button
            className="cook-focus-backdrop"
            type="button"
            aria-label="Collapse cooking plan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggleExpanded}
          />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.section
          className="cook-session-panel warung-panel"
          data-expanded={isExpanded}
          data-phase={session.phase}
          layout
          role={!isExpanded ? "button" : undefined}
          tabIndex={!isExpanded ? 0 : undefined}
          aria-label={!isExpanded ? "Expand cooking plan" : undefined}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={SOFT_SPRING}
          onClick={handlePanelClick}
          onKeyDown={(event) => {
            if (!isExpanded && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onToggleExpanded();
            }
          }}
          onPointerDown={handlePanelPointerDown}
          onPointerUp={handlePanelPointerUp}
          onPointerCancel={() => {
            gestureStart.current = null;
          }}
        >
          <motion.div className="warung-heading" transition={SOFT_SPRING}>
            <motion.div>
              <h2>{savedRecipe.recipe.recipeName}</h2>
              <small>{phaseStatus}</small>
            </motion.div>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  className="cook-panel-actions"
                  key="expanded-cook-actions"
                  initial={{ opacity: 0, scale: 0.92, x: 10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.92, x: 10 }}
                  transition={SOFT_SPRING}
                >
                  <motion.span
                    className="count-pill"
                    key="cook-count"
                    layout
                    transition={SOFT_SPRING}
                  >
                    {isIngredientsPhase ? `${checkedCount}/${rows.length}` : `${checkedStepCount}/${savedRecipe.recipe.steps.length}`}
                  </motion.span>
                  <button
                    className="cook-icon-button"
                    type="button"
                    aria-label="Collapse cooking plan"
                    onClick={onToggleExpanded}
                  >
                    <ChevronDown size={20} aria-hidden="true" />
                  </button>
                  <button
                    className="cook-icon-button danger"
                    type="button"
                    aria-label="Unpin recipe"
                    onClick={onUnpin}
                  >
                    <PinOff size={18} aria-hidden="true" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence initial={false} mode="popLayout">
            {!isExpanded && (
              <motion.div
                className="cook-compact-copy"
                key="compact-copy"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SOFT_SPRING}
              >
                <strong>{compactMeta}</strong>
                <span>{compactHint}</span>
              </motion.div>
            )}

            {isExpanded && isIngredientsPhase && (
              <motion.div
                className="cook-check-grid"
                key="ingredient-checks"
                layout
                initial={{ opacity: 0, y: 22, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={SOFT_SPRING}
              >
                {rows.map((ingredient, index) => {
                  const checked = Boolean(session.checkedIngredients[ingredient.id]);

                  return (
                    <motion.label
                      className="cook-check-row"
                      data-checked={checked}
                      key={ingredient.id}
                      layout
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...SOFT_SPRING, delay: Math.min(index * 0.025, 0.14) }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        aria-label={`Siapkan ${ingredient.item}`}
                        onChange={() => onToggleIngredient(ingredient.id)}
                      />
                      <span className="custom-check">
                        <Check size={15} aria-hidden="true" />
                      </span>
                      <span className="cook-check-copy">
                        <strong>{ingredient.item}</strong>
                        <small>{ingredient.amountText}</small>
                      </span>
                      <span className="warung-cost">
                        {ingredient.source === "warung"
                          ? formatRupiah(ingredient.estimatedLocalCost ?? 0)
                          : "Pantry"}
                      </span>
                    </motion.label>
                  );
                })}
              </motion.div>
            )}

            {isExpanded && !isIngredientsPhase && (
              <motion.div
                className="cook-check-grid cook-step-grid"
                key="step-checks"
                layout
                initial={{ opacity: 0, y: 22, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={SOFT_SPRING}
              >
                {savedRecipe.recipe.steps.map((step, index) => {
                  const stepId = String(step.stepNumber);
                  const checked = Boolean(session.checkedSteps[stepId]);

                  return (
                    <motion.label
                      className="cook-step-row"
                      data-checked={checked}
                      key={stepId}
                      layout
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...SOFT_SPRING, delay: Math.min(index * 0.025, 0.14) }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={checked}
                        aria-label={`Selesaikan ${step.phaseTitle}`}
                        onChange={() => onCompleteStep(stepId)}
                      />
                      <span className="custom-check">
                        <Check size={15} aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{step.stepNumber}. {step.phaseTitle}</strong>
                        <small>{step.detailInstruction}</small>
                      </span>
                    </motion.label>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </AnimatePresence>
    </>
  );
}
