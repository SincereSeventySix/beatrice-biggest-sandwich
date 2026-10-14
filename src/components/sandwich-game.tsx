import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  advanceClock,
  bunsLocked,
  chooseIngredient,
  createGame,
  durations,
  phaseLimit,
  recallList,
  resetToReady,
  retryRound,
  sequence,
  speech,
  startSandwich,
  visibleLayers,
  type GameState,
} from "@/game/logic";
import {
  playClick,
  playMilestone,
  playMiss,
  playPlace,
  playStart,
  playSuccess,
  playTick,
  resumeAudio,
  setMuted,
  unlockAudio,
} from "@/game/audio";
import { INGREDIENT_IDS, buildOrder, foodSrc, ingredientById, seededRng, shuffleIds } from "@/game/ingredients";
import { publicUrl } from "@/game/public-url";

const SAVE_KEY = "beatrice-biggest-sandwich-v1";
const SLICE_SHARE = 0.88;
const LAYER_PEEK = 0.28;

type Save = { version: 1; bestCompleted: number; muted: boolean };

function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { version: 1, bestCompleted: 0, muted: false };
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (parsed.version !== 1) return { version: 1, bestCompleted: 0, muted: false };
    return {
      version: 1,
      bestCompleted: typeof parsed.bestCompleted === "number" ? parsed.bestCompleted : 0,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return { version: 1, bestCompleted: 0, muted: false };
  }
}

function moodSrc() {
  return publicUrl("/beatrice/head.png?v=3");
}

export function SandwichGame() {
  const [state, setState] = useState<GameState>(() =>
    createGame(buildOrder(seededRng(3)), 0, shuffleIds(INGREDIENT_IDS, seededRng(9))),
  );
  const [muted, setMutedFlag] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [boomed, setBoomed] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const phaseRef = useRef(state.phase);
  const tickSecond = useRef<number | null>(null);

  useEffect(() => {
    const saved = loadSave();
    setMutedFlag(saved.muted);
    setMuted(saved.muted);
    setState((current) => ({ ...current, bestCompleted: saved.bestCompleted }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let bank = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      bank += dt;
      if (bank >= 0.05) {
        const step = bank;
        bank = 0;
        setState((current) => advanceClock(current, step));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (phaseRef.current === state.phase) return;
    phaseRef.current = state.phase;
    if (state.phase === "miss") playMiss();
    if (state.phase === "milestone") {
      playMilestone();
      setBoomed(true);
    }
    if (state.phase === "showing" || state.phase === "victory") {
      if (state.phase === "showing" && state.round % 10 !== 1) setBoomed(false);
    }
    if (state.phase !== "milestone" && state.phase !== "victory") setBoomed(false);
  }, [state.phase, state.round]);

  useEffect(() => {
    if (state.phase !== "recalling") {
      tickSecond.current = null;
      return;
    }
    const left = Math.ceil(durations(state.round).recall - state.elapsed);
    if (tickSecond.current === null) {
      tickSecond.current = left;
      return;
    }
    if (left !== tickSecond.current) {
      tickSecond.current = left;
      if (left > 0 && left <= 3) playTick();
    }
  }, [state.elapsed, state.phase, state.round]);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Save = { version: 1, bestCompleted: state.bestCompleted, muted };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }, [hydrated, state.bestCompleted, muted]);

  const limit = phaseLimit(state);
  const ratio = limit ? Math.max(0, 1 - state.elapsed / limit) : 0;
  const times = durations(state.round);
  const layers = visibleLayers(state);
  const targets = recallList(state);
  const full = sequence(state);
  const recallLeft = state.phase === "recalling" ? Math.max(0, Math.ceil(times.recall - state.elapsed)) : null;
  const showLeft = state.phase === "showing" ? Math.max(0, Math.ceil(times.show - state.elapsed)) : null;
  const fireworks = boomed && (state.phase === "milestone" || state.phase === "victory");

  function freshSandwich(best: number) {
    return resetToReady(buildOrder(), best, shuffleIds(INGREDIENT_IDS));
  }

  function begin() {
    unlockAudio();
    setRulesOpen(false);
    setPeek(null);
    const current = stateRef.current;
    if (current.phase === "ready" || current.phase === "victory") {
      playStart();
      setState(startSandwich(freshSandwich(current.bestCompleted)));
      return;
    }
    setState(freshSandwich(current.bestCompleted));
  }

  function playAgain() {
    unlockAudio();
    setState((current) => retryRound(current));
  }

  function onTile(id: string) {
    unlockAudio();
    playClick();
    if (stateRef.current.phase === "ready") {
      setPeek(id);
      return;
    }
    choose(id);
  }

  function choose(id: string) {
    unlockAudio();
    const before = stateRef.current;
    if (before.phase !== "recalling" || before.placedIds.includes(id)) return;
    if (bunsLocked(before.round) && (id === "bottom-bun" || id === "top-bun")) return;
    const expected = recallList(before)[before.placed];
    if (id === expected) {
      const needed = recallList(before).length;
      if (before.placed + 1 >= needed) playSuccess();
      else playPlace(before.placed);
    }
    setState((current) => chooseIngredient(current, id));
  }

  function toggleMute() {
    unlockAudio();
    setMutedFlag((current) => {
      const next = !current;
      setMuted(next);
      return next;
    });
  }

  const primaryLabel = state.phase === "ready" ? "Start" : state.phase === "victory" ? "Another sandwich" : "New sandwich";

  return (
    <main className="stage" data-phase={state.phase} data-round={state.round}>
      <header className="topbar">
        <div className="title-block">
          <p className="eyebrow">A memory sandwich</p>
          <h1>Beatrice's Biggest Sandwich</h1>
        </div>
        <figure className="beatrice">
          <p className="bubble">I'm good with it</p>
          <img src={moodSrc()} alt="Beatrice" />
        </figure>
        <div className="top-actions">
          <button type="button" className="start" onClick={begin}>
            {primaryLabel}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
          </button>
        </div>
      </header>

      <div className="meter" aria-hidden>
        <div className="meter-fill" style={{ transform: `scaleX(${limit ? ratio : 0})` }} />
      </div>

      <div className="status">
        <p className="status-main" aria-live="polite">
          {speech(state)}
        </p>
        <div className="status-meta">
          <span>{state.phase === "ready" ? "Ready" : `Round ${state.round} of 30`}</span>
          <span>
            {recallLeft !== null
              ? `${recallLeft}s to stack`
              : showLeft !== null
                ? `Look ${showLeft}s`
                : `Look ${times.show}s · Answer ${times.recall}s`}
          </span>
          <span>
            {state.phase === "recalling" || state.phase === "miss"
              ? `${state.placed} of ${targets.length} bites`
              : `Tallest ${state.bestCompleted}`}
          </span>
        </div>
      </div>

      <div className="board">
        <section className="pantry" aria-label="Ingredient tiles" data-dim={state.phase === "showing"}>
          {state.layout.map((id) => {
            const item = ingredientById(id);
            const locked = bunsLocked(state.round) && (item.id === "bottom-bun" || item.id === "top-bun");
            const step = state.placedIds.indexOf(item.id);
            const placed = step >= 0;
            const wrong = state.wrongId === item.id;
            const canPeek = state.phase === "ready";
            const active = (state.phase === "recalling" && !placed && !locked) || canPeek;
            return (
              <button
                key={item.id}
                type="button"
                className={`tile${placed ? " is-placed" : ""}${wrong ? " is-wrong" : ""}${locked ? " is-locked" : ""}${canPeek ? " is-peekable" : ""}`}
                disabled={!active}
                onClick={() => onTile(item.id)}
                data-ingredient={item.id}
                aria-label={
                  canPeek
                    ? `Look at ${item.name}`
                    : locked
                      ? `${item.name}, already on the hamburger`
                      : placed
                        ? `${item.name}, bite ${step + 1}`
                        : item.name
                }
              >
                <span className="tile-art">
                  <img src={foodSrc(item.id)} alt="" draggable={false} />
                  {placed ? <span className="badge">{step + 1}</span> : null}
                </span>
                <span className="tile-name">{item.name}</span>
              </button>
            );
          })}
        </section>

        <aside className="kitchen" aria-label="Hamburger">
          <div className="plate-wrap">
            {state.phase !== "ready" ? (
              <p className="plate-label">
                {state.phase === "recalling" || state.phase === "miss" ? "Your stack" : "The hamburger"}
              </p>
            ) : null}
            <FittingBurger layers={layers} popId={state.phase === "showing" ? full[full.length - 1] : undefined} />
            <p className="stack-count">
              {state.phase === "ready"
                ? "Thirty bites are waiting in the pantry."
                : `${full.length} layer${full.length === 1 ? "" : "s"} in this round`}
            </p>
          </div>
        </aside>
      </div>
      {fireworks ? <Fireworks key={`${state.round}-${state.phase}`} /> : null}
      {peek && state.phase === "ready" ? (
        <button type="button" className="peek" onClick={() => setPeek(null)} aria-label={`Close ${ingredientById(peek).name}`}>
          <img src={foodSrc(peek)} alt="" />
          <span>{ingredientById(peek).name}</span>
        </button>
      ) : null}
      {rulesOpen ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
          <div className="overlay-card">
            <h2 id="rules-title">How to play</h2>
            <ol className="rules">
              <li>Build the biggest hamburger Beatrice!</li>
              <li>Look at what's on the plate!</li>
              <li>When it disappears, put them back on by clicking on the pictures before the time runs out</li>
            </ol>
            <button type="button" className="start" onClick={begin}>
              Start
            </button>
          </div>
        </div>
      ) : null}
      {state.phase === "miss" ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="again-title">
          <div className="overlay-card">
            <h2 id="again-title">{speech(state)}</h2>
            <button type="button" className="start" onClick={playAgain}>
              Play again
            </button>
          </div>
        </div>
      ) : null}
      <p className="sr-only">
        {state.phase === "showing" ? `Memorize ${full.map((id) => ingredientById(id).name).join(", ")}` : ""}
      </p>
    </main>
  );
}

function FittingBurger({ layers, popId }: { layers: string[]; popId?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [slice, setSlice] = useState(220);
  const [lift, setLift] = useState(28);
  const step = slice * LAYER_PEEK;
  const stackH = layers.length === 0 ? 0 : slice + Math.max(0, layers.length - 1) * step;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth * SLICE_SHARE;
      const nextSlice = Math.max(96, width);
      const plate = stage.querySelector(".plate");
      const plateH = plate instanceof HTMLElement ? plate.offsetHeight : 0;
      const nextLift = plateH * 0.42 - nextSlice * 0.19;
      const nextStack = layers.length === 0 ? 0 : nextSlice + Math.max(0, layers.length - 1) * nextSlice * LAYER_PEEK;
      const available = Math.max(0, stage.clientHeight - plateH * 0.5);
      const nextScale = available > 8 && nextStack > 8 ? Math.min(1, available / nextStack) : 1;
      setSlice((prev) => (Math.abs(prev - nextSlice) < 2 ? prev : nextSlice));
      setLift((prev) => (Math.abs(prev - nextLift) < 2 ? prev : nextLift));
      setScale((prev) => (Math.abs(prev - nextScale) < 0.02 ? prev : nextScale));
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(stage);
    return () => obs.disconnect();
  }, [layers.length]);

  return (
    <div className="stack-stage" ref={stageRef}>
      {layers.length > 0 ? (
        <div
          ref={stackRef}
          className="stack"
          style={{ height: stackH, bottom: lift, transform: `translateX(-50%) scale(${scale})` }}
        >
          {layers.map((id, index) => (
            <img
              key={`${id}-${index}`}
              className={`slice${popId === id ? " is-new" : ""}${id === "bottom-bun" || id === "top-bun" ? " is-bun" : ""}${id === "patty" ? " is-patty" : ""}`}
              src={foodSrc(id)}
              alt=""
              style={{ zIndex: index + 1, bottom: index * step, height: slice }}
            />
          ))}
        </div>
      ) : null}
      <img className="plate" src={publicUrl("/plate.png")} alt="" />
    </div>
  );
}

function Fireworks() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parent = canvas.parentElement;
    const fit = () => {
      const rect = parent?.getBoundingClientRect();
      const width = rect?.width ?? window.innerWidth;
      const height = rect?.height ?? window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const colors = ["#c44536", "#e7b15a", "#fffaf3", "#3c2a1e"];
    const sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];
    const width = () => canvas.clientWidth;
    const height = () => canvas.clientHeight;
    const burst = (x: number, y: number) => {
      const count = reduced ? 18 : 42;
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 70 + Math.random() * 160;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color: colors[i % colors.length] ?? "#c44536",
          size: 2 + Math.random() * 2.5,
        });
      }
    };
    burst(width() * 0.3, height() * 0.35);
    burst(width() * 0.7, height() * 0.28);
    burst(width() * 0.5, height() * 0.45);
    if (reduced) {
      ctx.clearRect(0, 0, width(), height());
      for (const spark of sparks) {
        ctx.fillStyle = spark.color;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    let frame = 0;
    let last = performance.now();
    let nextBurst = 0.4;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      nextBurst -= dt;
      if (nextBurst <= 0) {
        burst(width() * (0.2 + Math.random() * 0.6), height() * (0.15 + Math.random() * 0.4));
        nextBurst = 0.55 + Math.random() * 0.4;
      }
      ctx.clearRect(0, 0, width(), height());
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        if (!spark) continue;
        spark.vy += 180 * dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.life -= dt * 0.7;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, spark.life);
        ctx.fillStyle = spark.color;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return <canvas ref={ref} className="fireworks" aria-hidden />;
}
