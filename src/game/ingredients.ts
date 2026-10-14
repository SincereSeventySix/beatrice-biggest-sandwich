import { publicUrl } from "./public-url";

export type IngredientGroup = "classic" | "weird";

export type Ingredient = {
  id: string;
  name: string;
  group: IngredientGroup;
};

export const INGREDIENTS: Ingredient[] = [
  { id: "bottom-bun", name: "Bottom bun", group: "classic" },
  { id: "patty", name: "Hamburger", group: "classic" },
  { id: "cheese", name: "Cheese", group: "classic" },
  { id: "lettuce", name: "Lettuce", group: "classic" },
  { id: "tomato", name: "Tomato", group: "classic" },
  { id: "onion", name: "Onion", group: "classic" },
  { id: "pickle", name: "Pickle", group: "classic" },
  { id: "bacon", name: "Bacon", group: "classic" },
  { id: "ketchup", name: "Ketchup", group: "classic" },
  { id: "top-bun", name: "Top bun", group: "classic" },
  { id: "banana", name: "Banana", group: "weird" },
  { id: "strawberry", name: "Strawberry", group: "weird" },
  { id: "broccoli", name: "Broccoli", group: "weird" },
  { id: "ice-cream", name: "Ice cream", group: "weird" },
  { id: "pineapple", name: "Pineapple", group: "weird" },
  { id: "watermelon", name: "Watermelon", group: "weird" },
  { id: "donut", name: "Donut", group: "weird" },
  { id: "grapes", name: "Grapes", group: "weird" },
  { id: "carrot", name: "Carrot", group: "weird" },
  { id: "cupcake", name: "Cupcake", group: "weird" },
  { id: "pretzel", name: "Pretzel", group: "weird" },
  { id: "chili", name: "Chili", group: "weird" },
  { id: "marshmallow", name: "Marshmallow", group: "weird" },
  { id: "peach", name: "Peach", group: "weird" },
  { id: "popcorn", name: "Popcorn", group: "weird" },
  { id: "chocolate", name: "Chocolate", group: "weird" },
  { id: "cookie", name: "Cookie", group: "weird" },
  { id: "sushi", name: "Sushi", group: "weird" },
  { id: "pizza", name: "Pizza", group: "weird" },
  { id: "lemon", name: "Lemon", group: "weird" },
];

export const INGREDIENT_IDS = INGREDIENTS.map((item) => item.id);

const BY_ID = new Map(INGREDIENTS.map((item) => [item.id, item]));

export function ingredientById(id: string): Ingredient {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown ingredient ${id}`);
  return found;
}

export function foodSrc(id: string): string {
  return publicUrl(`/food/${id}.png?v=4`);
}

export function shuffleIds(ids: readonly string[], rng: () => number = Math.random): string[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i] as string;
    copy[i] = copy[j] as string;
    copy[j] = swap;
  }
  return copy;
}

/** Same result on the server and the first client paint. */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Bottom bun, hamburger, then top bun. The other bites follow, weird ones shuffled. */
export function buildOrder(rng: () => number = Math.random): string[] {
  const classics = INGREDIENTS.filter((item) => item.group === "classic").map((item) => item.id);
  const head = ["bottom-bun", "patty", "top-bun"];
  const rest = classics.filter((id) => !head.includes(id));
  const weird = INGREDIENTS.filter((item) => item.group === "weird").map((item) => item.id);
  for (let i = weird.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = weird[i];
    weird[i] = weird[j] ?? weird[i];
    weird[j] = swap ?? weird[j];
  }
  return [...head, ...rest, ...weird];
}
