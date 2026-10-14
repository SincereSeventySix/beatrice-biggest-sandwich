export type Phase =
  | "ready"
  | "showing"
  | "recalling"
  | "success"
  | "miss"
  | "milestone"
  | "victory";

export type MissReason = "wrong" | "time" | null;

export type GameState = {
  order: string[];
  layout: string[];
  round: number;
  phase: Phase;
  elapsed: number;
  placed: number;
  placedIds: string[];
  wrongId: string | null;
  missReason: MissReason;
  attemptsThisRound: number;
  bestCompleted: number;
};

export const SUCCESS_HOLD = 1.8;
export const MILESTONE_HOLD = 4.4;

export function durations(round: number): { show: number; recall: number } {
  const tier = Math.floor((Math.max(1, round) - 1) / 5);
  const show = 5 + tier * 5;
  return { show, recall: show + 5 };
}

export function createGame(order: string[], bestCompleted = 0, layout: string[] = []): GameState {
  return {
    order,
    layout,
    round: 1,
    phase: "ready",
    elapsed: 0,
    placed: 0,
    placedIds: [],
    wrongId: null,
    missReason: null,
    attemptsThisRound: 0,
    bestCompleted,
  };
}

export function phaseLimit(state: GameState): number | null {
  if (state.phase === "showing") return durations(state.round).show;
  if (state.phase === "recalling") return durations(state.round).recall;
  if (state.phase === "success") return SUCCESS_HOLD;
  if (state.phase === "milestone") return MILESTONE_HOLD;
  return null;
}

export function sequence(state: GameState): string[] {
  return state.order.slice(0, state.round);
}

export function stackLayers(ids: string[]): string[] {
  const bottom = ids.filter((id) => id === "bottom-bun");
  const top = ids.filter((id) => id === "top-bun");
  const middle = ids.filter((id) => id !== "bottom-bun" && id !== "top-bun");
  return [...bottom, ...middle, ...top];
}

/** What the player must click this round. Buns lock after round 3. */
export function recallList(state: GameState): string[] {
  const stacked = stackLayers(sequence(state));
  if (state.round <= 3) return stacked;
  return stacked.filter((id) => id !== "bottom-bun" && id !== "top-bun");
}

export function bunsLocked(round: number): boolean {
  return round > 3;
}

function withBest(state: GameState, completedRound: number): GameState {
  return {
    ...state,
    bestCompleted: Math.max(state.bestCompleted, completedRound),
  };
}

function advanceRound(state: GameState): GameState {
  return {
    ...state,
    round: state.round + 1,
    phase: "showing",
    elapsed: 0,
    placed: 0,
    placedIds: [],
    wrongId: null,
    missReason: null,
    attemptsThisRound: 0,
  };
}

function afterSuccess(state: GameState): GameState {
  const remembered = withBest(state, state.round);
  if (state.round % 10 === 0) {
    return { ...remembered, phase: "milestone", elapsed: 0, wrongId: null, missReason: null };
  }
  return advanceRound(remembered);
}

export function startSandwich(state: GameState): GameState {
  if (state.phase !== "ready") return state;
  return {
    ...state,
    phase: "showing",
    round: 1,
    elapsed: 0,
    placed: 0,
    placedIds: [],
    wrongId: null,
    missReason: null,
    attemptsThisRound: 0,
  };
}

export function resetToReady(order: string[], bestCompleted: number, layout: string[]): GameState {
  return createGame(order, bestCompleted, layout);
}

export function retryRound(state: GameState): GameState {
  if (state.phase !== "miss") return state;
  return {
    ...state,
    phase: "showing",
    elapsed: 0,
    placed: 0,
    placedIds: [],
    wrongId: null,
    missReason: null,
    attemptsThisRound: state.attemptsThisRound + 1,
  };
}

export function chooseIngredient(state: GameState, id: string): GameState {
  if (state.phase !== "recalling") return state;
  if (bunsLocked(state.round) && (id === "bottom-bun" || id === "top-bun")) return state;
  if (state.placedIds.includes(id)) return state;
  const targets = recallList(state);
  const expected = targets[state.placed];
  if (id !== expected) {
    return {
      ...state,
      phase: "miss",
      elapsed: 0,
      wrongId: id,
      missReason: "wrong",
    };
  }
  const placedIds = [...state.placedIds, id];
  const placed = state.placed + 1;
  if (placed >= targets.length) {
    return {
      ...state,
      placed,
      placedIds,
      phase: "success",
      elapsed: 0,
      wrongId: null,
      missReason: null,
    };
  }
  return { ...state, placed, placedIds, wrongId: null };
}

export function advanceClock(state: GameState, dt: number): GameState {
  const limit = phaseLimit(state);
  if (limit === null) return state;
  const step = Math.min(0.1, Math.max(0, dt));
  const elapsed = state.elapsed + step;
  if (elapsed < limit) return { ...state, elapsed };

  if (state.phase === "showing") {
    return {
      ...state,
      phase: "recalling",
      elapsed: 0,
      placed: 0,
      placedIds: [],
      wrongId: null,
      missReason: null,
    };
  }
  if (state.phase === "recalling") {
    return {
      ...state,
      phase: "miss",
      elapsed: 0,
      wrongId: null,
      missReason: "time",
    };
  }
  if (state.phase === "success") return afterSuccess(state);
  if (state.phase === "milestone") {
    if (state.round >= state.order.length) {
      return { ...state, phase: "victory", elapsed: 0 };
    }
    return advanceRound(state);
  }
  return state;
}

export function visibleLayers(state: GameState): string[] {
  if (state.phase === "ready") return [];
  const full = stackLayers(sequence(state));
  if (state.phase === "recalling" || state.phase === "miss") {
    if (!bunsLocked(state.round)) return stackLayers(state.placedIds);
    const middle = state.placedIds.filter((id) => id !== "bottom-bun" && id !== "top-bun");
    return ["bottom-bun", ...middle, "top-bun"];
  }
  return full;
}

export function beatriceMood(phase: Phase): "idle" | "think" | "cheer" | "oops" {
  if (phase === "miss") return "oops";
  if (phase === "success" || phase === "milestone" || phase === "victory") return "cheer";
  if (phase === "showing" || phase === "recalling") return "think";
  return "idle";
}

export function speech(state: GameState): string {
  const { phase, round, attemptsThisRound, placed, missReason } = state;
  if (phase === "ready") {
    return "Watch the sandwich, then stack every bite in the order it landed.";
  }
  if (phase === "showing") {
    if (attemptsThisRound > 0) return "Same sandwich. Have another look.";
    if (round === 1) return "One bite to start. Eyes on the plate.";
    return "The whole stack, first bite to last.";
  }
  if (phase === "recalling") {
    if (placed === 0) return "Your turn. First bite first.";
    return `${placed} in place. Keep the order.`;
  }
  if (phase === "success") return "That stack is right.";
  if (phase === "miss") {
    return missReason === "time" ? "Time's up." : "Out of order.";
  }
  if (phase === "milestone") {
    if (round >= 30) return "Thirty bites. This is my biggest sandwich.";
    if (round >= 20) return "Twenty layers. I can barely see over it.";
    return "Ten layers. The plate is getting nervous.";
  }
  return "You remembered every bite. I am wonderfully full.";
}
