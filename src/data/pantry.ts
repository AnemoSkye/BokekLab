import type {
  PantryMatrix,
  StandardVibeProfile,
  SultanVibeProfile,
  VibeProfile,
} from "../../shared/recipe";

export const pantryGroups: Array<{
  key: keyof PantryMatrix;
  label: string;
  eyebrow: string;
  items: string[];
}> = [
  {
    key: "carbs",
    label: "Carbs",
    eyebrow: "base kenyang",
    items: ["Indomie", "Nasi Sisa", "Roti Tawar", "Mie Bihun"],
  },
  {
    key: "proteins",
    label: "Proteins",
    eyebrow: "tenaga murah",
    items: ["Telur", "Tempe", "Tahu", "Sarden Sisa"],
  },
  {
    key: "veggies",
    label: "Veggies",
    eyebrow: "biar berasa hidup",
    items: ["Kangkung", "Kol", "Sawi", "Tomat"],
  },
  {
    key: "condiments",
    label: "Condiments",
    eyebrow: "jurus penyelamat",
    items: ["Cabe", "Kecap", "Saus Sambal", "Bawang"],
  },
];

export const standardVibeProfiles: Array<{
  value: StandardVibeProfile;
  title: string;
  caption: string;
  icon: "flame" | "store" | "leaf";
}> = [
  {
    value: "Anak Kos Survival Mode",
    title: "Anak Kos Survival Mode",
    caption: "Kalori aman, dompet tetap bernapas.",
    icon: "flame",
  },
  {
    value: "Street Food Level Upgrade",
    title: "Street Food Level Upgrade",
    caption: "Rasa gerobak, modal dapur.",
    icon: "store",
  },
  {
    value: "Healthy-ish Attempt",
    title: "Healthy-ish Attempt",
    caption: "Niat sehat, realistis dulu.",
    icon: "leaf",
  },
];

export const sultanVibeProfiles: Array<{
  value: SultanVibeProfile;
  title: string;
  caption: string;
  icon: "crown" | "sparkles" | "beef";
}> = [
  {
    value: "Warung Sultan Flex",
    title: "Warung Sultan Flex",
    caption: "Budget lega, upgrade topping tanpa mikir dua kali.",
    icon: "crown",
  },
  {
    value: "Fancy Anak Kos Dinner",
    title: "Fancy Anak Kos Dinner",
    caption: "Bahan tetap lokal, plating naik kelas.",
    icon: "sparkles",
  },
  {
    value: "Protein Royal Treatment",
    title: "Protein Royal Treatment",
    caption: "Lauk serius, energi aman sampai besok.",
    icon: "beef",
  },
];

export const vibeProfiles = [...standardVibeProfiles, ...sultanVibeProfiles] satisfies Array<{
  value: VibeProfile;
  title: string;
  caption: string;
  icon: string;
}>;

export const initialPantryMatrix: PantryMatrix = {
  carbs: [],
  proteins: [],
  veggies: [],
  condiments: [],
};

export const emptyPantryMatrix: PantryMatrix = {
  carbs: [],
  proteins: [],
  veggies: [],
  condiments: [],
};

export function countIngredients(matrix: PantryMatrix) {
  return Object.values(matrix).reduce((total, items) => total + items.length, 0);
}

export function flattenPantry(matrix: PantryMatrix) {
  return Object.values(matrix).flat();
}
