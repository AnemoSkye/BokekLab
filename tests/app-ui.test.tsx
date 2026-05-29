import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

const defaultConfig = {
  appVersion: "1.0.0",
  authRequired: false,
  firebase: null,
  aiFeaturesEnabled: true,
  recipeDailyLimit: 10,
};

const generatedRecipe = {
  recipeName: "Indomie Telur Fokus",
  briefDescription: "Indomie dengan telur untuk satu porsi cepat.",
  estimatedCostText: "Rp 2.500",
  vibeProfileSummary: "Budget masih cukup untuk upgrade protein sederhana.",
  requiresWarungShopping: true,
  additionalWarungShopping: [{ item: "Telur ayam", estimatedLocalCost: 2500 }],
  ingredients: [
    {
      item: "Indomie",
      category: "carbs",
      amountText: "1 bungkus",
      source: "owned",
    },
    {
      item: "Telur ayam",
      category: "warung",
      amountText: "1 butir",
      source: "warung",
      estimatedLocalCost: 2500,
    },
  ],
  nutritionEstimate: {
    caloriesText: "540 kkal",
    proteinText: "18 g",
    carbsText: "63 g",
    fatText: "22 g",
    sodiumText: "tinggi",
    sugarText: "rendah",
    caloriesKcal: 540,
    proteinGrams: 18,
    carbsGrams: 63,
    fiberGrams: 3,
    fatGrams: 22,
    sugarGrams: 4,
    sodiumMg: 990,
    warnings: ["Sodium tinggi karena bumbu instan."],
  },
  steps: [
    {
      stepNumber: 1,
      phaseTitle: "Rebus",
      instruction: "Rebus mie dan telur sampai matang.",
      detailInstruction: "Rebus 1 bungkus mie selama 2 menit, lalu masukkan 1 butir telur dan masak 1 menit lagi.",
    },
    {
      stepNumber: 2,
      phaseTitle: "Bumbui",
      instruction: "Campur bumbu sampai merata.",
      detailInstruction: "Masukkan bumbu instan sedikit demi sedikit, aduk dengan mie dan telur sampai rata.",
    },
  ],
};

const generatedSavedRecipe = {
  id: "generated-recipe-1",
  createdAt: "2026-05-28T10:00:00.000Z",
  isFavorite: false,
  request: {
    sisaDompet: 15000,
    budgetMode: "normal",
    pantryMatrix: {
      carbs: ["Indomie"],
      proteins: [],
      veggies: [],
      condiments: [],
    },
    vibeProfile: "Anak Kos Survival Mode",
  },
  recipe: generatedRecipe,
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function renderApp() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/config")) {
        return {
          ok: true,
          json: async () => defaultConfig,
        };
      }

      if (url.endsWith("/api/usage/today")) {
        return {
          ok: true,
          json: async () => ({
            dateKey: "20260528",
            recipeGenerations: 0,
            recipeDailyLimit: 10,
            ingredientAnalyses: 0,
            ingredientDailyLimit: 30,
            resetAt: "2026-05-29T17:00:00.000Z",
            aiFeaturesEnabled: true,
          }),
        };
      }

      if (url.endsWith("/api/recipes")) {
        return {
          ok: true,
          json: async () => ({ recipes: [] }),
        };
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    }),
  );
  return render(<App />);
}

async function renderReadyApp() {
  const result = renderApp();
  await screen.findByText("Isi dapur, isi kepala, kita jadikan menu.");
  return result;
}

async function waitForHome() {
  await screen.findByText("Isi dapur, isi kepala, kita jadikan menu.");
}

async function openSetupWithChip() {
  fireEvent.click(await screen.findByRole("button", { name: "Indomie" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("BokekLab staged UI", () => {
  it("starts with calm home chips, short nav tooltips, and non-sticky tooltip behavior", async () => {
    const { container } = await renderReadyApp();

    expect(screen.getByText("Isi dapur, isi kepala, kita jadikan menu.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recipes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByText("HOME")).toBeNull();
    expect(container.querySelector(".app-shell")?.getAttribute("data-entry-stage")).toBe("home");
    expect(screen.queryByText("Ambil dari kamera atau galeri")).toBeNull();
    expect(screen.queryByText("MULAI DARI AWAL (RESET)")).toBeNull();
    expect(screen.queryByText("Realita Dompet")).toBeNull();
    expect(container.querySelector(".home-ingredient-column")).toBeNull();

    const dapurButton = screen.getByRole("button", { name: "Home" });
    const dapurTooltip = dapurButton.closest(".tooltip-wrap") as HTMLElement;

    fireEvent.pointerEnter(dapurTooltip);
    expect(dapurTooltip.dataset.open).toBe("true");
    fireEvent.pointerDown(dapurButton);
    fireEvent.click(dapurButton);
    expect(dapurTooltip.dataset.open).toBe("false");
  }, 15000);

  it("uses an accent circle for the active navbar icon", async () => {
    const { container } = await renderReadyApp();
    const activeNav = screen.getByRole("button", { name: "Home" });

    expect(activeNav.dataset.active).toBe("true");
    expect(activeNav.querySelector(".nav-icon-shell")).toBeTruthy();
    expect(container.querySelector(".nav-indicator")).toBeNull();
  }, 15000);

  it("expands desktop navigation labels from the BokekLab avatar", async () => {
    const { container } = await renderReadyApp();
    const rail = container.querySelector(".desktop-nav-rail") as HTMLElement;

    expect(rail.dataset.expanded).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "BokekLab" }));

    expect(rail.dataset.expanded).toBe("true");
    expect(container.querySelectorAll(".desktop-nav-rail .nav-label")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Collapse navigation" })).toBeTruthy();
  }, 15000);

  it("opens and closes the mobile drawer by button, selection, and swipe", async () => {
    const { container } = await renderReadyApp();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawerDialog = screen.getByRole("dialog", { name: "BokekLab navigation menu" });
    expect(drawerDialog).toBeTruthy();
    fireEvent.click(within(drawerDialog).getByRole("button", { name: "Recipes" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "BokekLab navigation menu" })).toBeNull(),
    );

    const edge = container.querySelector(".mobile-swipe-edge") as HTMLElement;
    fireEvent.pointerDown(edge, { clientX: 0, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(edge, { clientX: 90, clientY: 124, pointerId: 1 });
    expect(screen.getByRole("dialog", { name: "BokekLab navigation menu" })).toBeTruthy();

    const drawer = container.querySelector(".mobile-nav-drawer") as HTMLElement;
    fireEvent.pointerDown(drawer, { clientX: 250, clientY: 120, pointerId: 2 });
    fireEvent.pointerUp(drawer, { clientX: 170, clientY: 122, pointerId: 2 });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "BokekLab navigation menu" })).toBeNull(),
    );
  }, 15000);

  it("moves from selected chips into setup containers", async () => {
    const { container } = await renderReadyApp();

    await openSetupWithChip();

    expect(screen.getByText("Pantry Matrix")).toBeTruthy();
    expect(screen.getByText("Sisa Dompet")).toBeTruthy();
    expect(screen.getByText("Vibe Profile")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Execute" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Execution controls" })).toBeTruthy();
    expect(screen.queryByText("Execution Node")).toBeNull();
    expect(screen.queryByText("Dapur awal")).toBeNull();
    expect(screen.getByRole("button", { name: "Back to home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open navigation menu" })).toBeNull();
    expect(screen.getByRole("list", { name: "Daftar bahan Pantry Matrix" })).toBeTruthy();
    expect(container.querySelector(".matrix-ingredient-row")).toBeTruthy();
    expect(container.querySelector(".matrix-chip-columns")).toBeNull();
  }, 15000);

  it("turns chip selection into a focused Continue composer state", async () => {
    const { container } = await renderReadyApp();

    fireEvent.click(await screen.findByRole("button", { name: "Indomie" }));

    const actions = container.querySelector(".home-actions") as HTMLElement;
    expect(actions.dataset.ready).toBe("true");
    expect(screen.getByRole("button", { name: "Photo" }).className).toContain("circle-action");
    expect(screen.getByRole("button", { name: "Type" }).className).toContain("circle-action");
    expect(screen.getByRole("button", { name: "Continue" }).className).toContain("stretch-action");
  }, 15000);

  it("expands Type into a composer and sends typed text on Continue", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/config")) {
        return { ok: true, json: async () => defaultConfig };
      }

      return {
        ok: true,
        json: async () => ({
          pantryMatrix: {
            carbs: ["Nasi"],
            proteins: ["Telur"],
            veggies: [],
            condiments: ["Cabe"],
          },
          detectedSummary: "Teks berhasil dibaca.",
          ignoredItems: [],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await waitForHome();

    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    fireEvent.change(screen.getByLabelText("Type ingredients"), {
      target: { value: "nasi sisa, telur, cabe" },
    });
    expect(screen.queryByRole("button", { name: "Photo" })).toBeNull();

    const actions = screen.getByRole("button", { name: "Clear typed input" }).closest(".home-actions") as HTMLElement;
    const actionChildren = Array.from(actions.children);
    expect(actionChildren[0].classList.contains("text-composer")).toBe(true);
    expect(actionChildren[0].querySelector('[aria-label="Clear typed input"]')).toBeTruthy();
    expect(actionChildren[1].querySelector('[aria-label="Continue"]')).toBeTruthy();
    expect(actionChildren).toHaveLength(2);
    expect(actionChildren[0].querySelector('[aria-label="Continue"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/ingredients/analyze-input",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(screen.getByText("Pantry Matrix")).toBeTruthy());
  }, 15000);

  it("shows selected image previews and validates max three images", async () => {
    const { container } = await renderReadyApp();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [1, 2, 3, 4].map(
      (index) => new File([`image-${index}`], `bahan-${index}.jpg`, { type: "image/jpeg" }),
    );

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(container.querySelectorAll(".image-preview")).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Type" })).toBeNull();
    expect(container.querySelector(".photo-composer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" }).className).toContain("photo-submit-button");
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  }, 15000);

  it("toggles Sultan Mode with wallet triple-click and swaps vibe options", async () => {
    const { container } = await renderReadyApp();
    await openSetupWithChip();

    const walletButton = screen.getByRole("button", { name: "Toggle Sultan Mode" });
    fireEvent.click(walletButton);
    fireEvent.click(walletButton);
    fireEvent.click(walletButton);

    expect(screen.getByText("SULTAN MODE")).toBeTruthy();
    expect(screen.getByText("Warung Sultan Flex")).toBeTruthy();
    expect(screen.getByLabelText("Sisa dompet").getAttribute("max")).toBe("250000");
    expect(container.querySelector(".app-shell")?.getAttribute("data-theme")).toBe("sultan");

    fireEvent.click(walletButton);
    fireEvent.click(walletButton);
    fireEvent.click(walletButton);

    expect(screen.getByText("Realita Dompet")).toBeTruthy();
    expect(screen.getByText("Anak Kos Survival Mode")).toBeTruthy();
    expect(screen.getByLabelText("Sisa dompet").getAttribute("max")).toBe("25000");
    expect(container.querySelector(".app-shell")?.getAttribute("data-theme")).toBe("brand");
  }, 15000);

  it("auto-saves generated recipes and opens the detail without a save button", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/config")) {
        return { ok: true, json: async () => defaultConfig };
      }

      if (url.endsWith("/api/usage/today")) {
        return {
          ok: true,
          json: async () => ({
            dateKey: "20260528",
            recipeGenerations: 1,
            recipeDailyLimit: 10,
            ingredientAnalyses: 0,
            ingredientDailyLimit: 30,
            resetAt: "2026-05-29T17:00:00.000Z",
            aiFeaturesEnabled: true,
          }),
        };
      }

      return {
        ok: true,
        json: async () => generatedSavedRecipe,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await waitForHome();

    await openSetupWithChip();
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));

    await waitFor(() => expect(screen.getByText("Indomie Telur Fokus")).toBeTruthy(), {
      timeout: 10000,
    });
    expect(screen.getAllByText("Generating image").length).toBeGreaterThan(0);
    expect(screen.getByText("NutriLevel D")).toBeTruthy();
    expect(screen.getByText("540")).toBeTruthy();
    expect(screen.getByText("18g Protein")).toBeTruthy();
    expect(screen.getByText("990mg Natrium")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mari Masak!" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Simpan resep/i })).toBeNull();
    expect(window.localStorage.getItem("bokeklab.savedRecipes.v1")).toContain("Indomie Telur Fokus");

    fireEvent.click(screen.getByRole("button", { name: "Back to recipes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Buka Indomie Telur Fokus" })).toBeTruthy());
    expect(screen.getAllByRole("group", { name: "Recipe filter" }).length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it("pins Warung Run, advances into cooking steps, and marks a recipe complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/api/config")) {
          return { ok: true, json: async () => defaultConfig };
        }

        if (url.endsWith("/api/usage/today")) {
          return {
            ok: true,
            json: async () => ({
              dateKey: "20260528",
              recipeGenerations: 1,
              recipeDailyLimit: 10,
              ingredientAnalyses: 0,
              ingredientDailyLimit: 30,
              resetAt: "2026-05-29T17:00:00.000Z",
              aiFeaturesEnabled: true,
            }),
          };
        }

        return {
          ok: true,
          json: async () => generatedSavedRecipe,
        };
      }),
    );
    render(<App />);
    await waitForHome();

    await openSetupWithChip();
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    await waitFor(() => expect(screen.getByText("Indomie Telur Fokus")).toBeTruthy(), {
      timeout: 10000,
    });

    if (!screen.queryByRole("button", { name: "Mari Masak!" })) {
      fireEvent.click(screen.getByRole("button", { name: "Buka Indomie Telur Fokus" }));
    }

    await waitFor(() => expect(screen.getByRole("button", { name: "Mari Masak!" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Mari Masak!" }));
    expect(screen.getAllByText("Indomie Telur Fokus").length).toBeGreaterThan(0);
    expect(screen.getByText("2 bahan belum siap")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unpin recipe" })).toBeNull();

    fireEvent.click(screen.getByText("2 bahan belum siap").closest(".cook-session-panel") as HTMLElement);
    expect(screen.getByRole("button", { name: "Unpin recipe" })).toBeTruthy();
    expect(screen.getByLabelText("Siapkan Indomie")).toBeTruthy();
    expect(screen.getByLabelText("Siapkan Telur ayam")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Siapkan Indomie"));
    fireEvent.click(screen.getByLabelText("Siapkan Telur ayam"));

    await waitFor(() => expect(screen.getByText("0/2 langkah selesai - Menyiapkan bahan")).toBeTruthy());
    expect(screen.queryByText("Cooking Prep")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lihat detail" })).toBeNull();
    const stepPanel = screen.getByText("0/2 langkah selesai - Menyiapkan bahan").closest(".cook-session-panel") as HTMLElement;
    fireEvent.pointerDown(stepPanel, { clientX: 160, clientY: 500, pointerId: 3 });
    fireEvent.pointerUp(stepPanel, { clientX: 160, clientY: 430, pointerId: 3 });
    expect(screen.getByText(/Rebus 1 bungkus mie/)).toBeTruthy();
    fireEvent.pointerDown(stepPanel, { clientX: 160, clientY: 430, pointerId: 4 });
    fireEvent.pointerUp(stepPanel, { clientX: 160, clientY: 500, pointerId: 4 });
    expect(screen.getByRole("button", { name: "Expand cooking plan" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand cooking plan" }));
    fireEvent.click(screen.getByLabelText("Selesaikan Rebus"));
    expect((screen.getByLabelText("Selesaikan Rebus") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Selesaikan Bumbui"));

    await waitFor(() => expect(screen.queryByText("0/2 langkah selesai - Menyiapkan bahan")).toBeNull());
    expect(screen.getByText("Complete")).toBeTruthy();
  }, 15000);

  it("opens Settings, toggles dark mode, and hosts Wipe Log there", async () => {
    const { container } = await renderReadyApp();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => expect(screen.getByText("Dark mode")).toBeTruthy());
    expect(screen.getByText("BokekLab v1.0.0")).toBeTruthy();
    expect(screen.getByText("Recipe limit")).toBeTruthy();
    expect(screen.queryByText("Pengaturan dapur.")).toBeNull();
    expect(screen.getByRole("button", { name: "Toggle dark mode" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Wipe Log" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".app-shell")?.getAttribute("data-color-scheme")).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));

    expect(container.querySelector(".app-shell")?.getAttribute("data-color-scheme")).toBe("dark");
    expect(window.localStorage.getItem("bokeklab.settings.v1")).toContain("darkMode");
  }, 15000);
});
