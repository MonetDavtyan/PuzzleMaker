"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useState } from "react";

type Phase = "choose" | "difficulty" | "guide" | "playing" | "won" | "lost";

type PuzzleImage = {
  id: number;
  title: string;
  url: string;
  pageUrl: string;
  artist: string;
  license: string;
  width: number;
  height: number;
};

type Difficulty = {
  name: string;
  description: string;
  columns: number;
  seconds: number;
};

type DragState = {
  id: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
} | null;

const LEVELS: Difficulty[] = [
  { name: "Easy", description: "9 pieces · 2 minutes", columns: 3, seconds: 120 },
  { name: "Medium", description: "16 pieces · 3 minutes", columns: 4, seconds: 180 },
  { name: "Hard", description: "25 pieces · 4 minutes", columns: 5, seconds: 240 },
];

const SUGGESTIONS = ["a red panda", "a magical castle", "rainbow cupcakes"];

function cleanText(value?: string) {
  if (!value) return "Unknown artist";
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("choose");
  const [query, setQuery] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [images, setImages] = useState<PuzzleImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<PuzzleImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<Difficulty>(LEVELS[0]);
  const [showGuide, setShowGuide] = useState(true);
  const [pieces, setPieces] = useState<number[]>([]);
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [draggedPiece, setDraggedPiece] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [shakingPiece, setShakingPiece] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const totalPieces = level.columns * level.columns;
  const progress = totalPieces ? Math.round((placed.size / totalPieces) * 100) : 0;

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setPhase("lost");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const pieceStyle = (piece: number) => {
    if (!selectedImage) return {};
    const column = piece % level.columns;
    const row = Math.floor(piece / level.columns);
    return {
      backgroundImage: `url("${selectedImage.url.replace(/"/g, "%22")}")`,
      backgroundSize: `${level.columns * 100}% ${level.columns * 100}%`,
      backgroundPosition: `${(column / (level.columns - 1)) * 100}% ${(row / (level.columns - 1)) * 100}%`,
    };
  };

  async function searchImages(searchText: string) {
    const term = searchText.trim();
    if (!term) return;
    setLoading(true);
    setError("");
    setImages([]);
    setSearchedFor(term);

    try {
      const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
      endpoint.searchParams.set("action", "query");
      endpoint.searchParams.set("generator", "search");
      endpoint.searchParams.set("gsrsearch", `${term} filetype:bitmap`);
      endpoint.searchParams.set("gsrnamespace", "6");
      endpoint.searchParams.set("gsrlimit", "24");
      endpoint.searchParams.set("prop", "imageinfo");
      endpoint.searchParams.set("iiprop", "url|mime|size|extmetadata");
      endpoint.searchParams.set("iiurlwidth", "900");
      endpoint.searchParams.set("format", "json");
      endpoint.searchParams.set("origin", "*");

      const response = await fetch(endpoint.toString());
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      const pages = Object.values(data?.query?.pages ?? {}) as Array<{
        pageid: number;
        title: string;
        imageinfo?: Array<{
          thumburl?: string;
          url?: string;
          descriptionurl?: string;
          mime?: string;
          width?: number;
          height?: number;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }>;

      const found = pages
        .map((page) => {
          const info = page.imageinfo?.[0];
          if (!info?.thumburl || !info.width || !info.height) return null;
          return {
            id: page.pageid,
            title: page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
            url: info.thumburl,
            pageUrl: info.descriptionurl ?? info.url ?? "https://commons.wikimedia.org",
            artist: cleanText(info.extmetadata?.Artist?.value ?? info.extmetadata?.Credit?.value),
            license: cleanText(info.extmetadata?.LicenseShortName?.value ?? "Open license"),
            width: info.width,
            height: info.height,
          } satisfies PuzzleImage;
        })
        .filter((image): image is PuzzleImage => Boolean(image))
        .sort((a, b) => {
          const aRatio = a.width / a.height;
          const bRatio = b.width / b.height;
          const aScore = Math.abs(aRatio - 1.2);
          const bScore = Math.abs(bRatio - 1.2);
          return aScore - bScore;
        })
        .slice(0, 8);

      if (!found.length) throw new Error("No images found");
      setImages(found);
    } catch {
      setError("I couldn’t find pictures for that. Try a simpler idea, like “tiger” or “Paris”.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    void searchImages(query);
  }

  function chooseImage(image: PuzzleImage) {
    setSelectedImage(image);
    setPhase("difficulty");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseDifficulty(difficulty: Difficulty) {
    setLevel(difficulty);
    setPhase("guide");
  }

  function startGame(withGuide: boolean) {
    const count = level.columns * level.columns;
    setShowGuide(withGuide);
    setPieces(shuffle(Array.from({ length: count }, (_, index) => index)));
    setPlaced(new Set());
    setSelectedPiece(null);
    setTimeLeft(level.seconds);
    setPhase("playing");
  }

  function showWrong(piece: number) {
    setShakingPiece(piece);
    if ("vibrate" in navigator) navigator.vibrate(120);
    window.setTimeout(() => setShakingPiece(null), 420);
  }

  function tryPlace(piece: number | null, cell: number) {
    if (piece === null || phase !== "playing") return;
    if (piece !== cell) {
      showWrong(piece);
      return;
    }

    setPlaced((current) => {
      const next = new Set(current);
      next.add(piece);
      if (next.size === totalPieces) window.setTimeout(() => setPhase("won"), 260);
      return next;
    });
    setSelectedPiece(null);
    setDraggedPiece(null);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, piece: number) {
    if (event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ id: piece, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragState) return;
    setDragState({
      ...dragState,
      dx: event.clientX - dragState.startX,
      dy: event.clientY - dragState.startY,
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragState) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-cell]");
    if (target?.dataset.cell) tryPlace(dragState.id, Number(target.dataset.cell));
    setDragState(null);
  }

  function resetToSearch() {
    setPhase("choose");
    setSelectedImage(null);
    setPlaced(new Set());
    setPieces([]);
    setSelectedPiece(null);
  }

  const imageCredit = useMemo(() => {
    if (!selectedImage) return "";
    return `${selectedImage.artist} · ${selectedImage.license}`;
  }, [selectedImage]);

  if (phase === "choose") {
    return (
      <main className="maker-page">
        <section className="search-hero">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <p className="eyebrow">Puzzle Maker</p>
          <h1>What should your puzzle be?</h1>
          <p className="hero-copy">Type anything you can imagine. Pick a picture, then piece it together!</p>

          <form className="search-form" onSubmit={handleSearch}>
            <label className="sr-only" htmlFor="picture-search">What picture do you want?</label>
            <input
              id="picture-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “a superhero” or “pizza”…"
              autoComplete="off"
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? "Finding…" : "Find pictures"}
            </button>
          </form>

          {!images.length && !loading && (
            <div className="suggestions" aria-label="Try an idea">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} onClick={() => { setQuery(suggestion); void searchImages(suggestion); }}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {error && <p className="search-error" role="alert">{error}</p>}
        </section>

        {loading && (
          <section className="results-grid loading-grid" aria-label="Finding pictures">
            {Array.from({ length: 6 }, (_, index) => <div className="image-skeleton" key={index} />)}
          </section>
        )}

        {!!images.length && (
          <section className="results-section">
            <div className="results-heading">
              <h2>Pick your favorite</h2>
              <span>{images.length} pictures for “{searchedFor}”</span>
            </div>
            <div className="results-grid">
              {images.map((image) => (
                <button className="image-card" key={image.id} onClick={() => chooseImage(image)}>
                  <img src={image.url} alt={image.title} />
                  <span className="pick-label">Choose this one <span aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
            <p className="credit-note">Pictures come from Wikimedia Commons and keep their original credits.</p>
          </section>
        )}
      </main>
    );
  }

  if (phase === "difficulty" && selectedImage) {
    return (
      <main className="difficulty-page">
        <button className="back-button" onClick={() => setPhase("choose")} aria-label="Back to pictures">← Back</button>
        <div className="difficulty-layout">
          <figure className="chosen-picture">
            <img src={selectedImage.url} alt={selectedImage.title} />
            <figcaption>
              <span>Your picture</span>
              <a href={selectedImage.pageUrl} target="_blank" rel="noreferrer">{imageCredit}</a>
            </figcaption>
          </figure>
          <section className="level-picker">
            <p className="eyebrow">Ready?</p>
            <h1>Choose your level</h1>
            <div className="level-list">
              {LEVELS.map((difficulty, index) => (
                <button key={difficulty.name} onClick={() => chooseDifficulty(difficulty)}>
                  <span className="level-number">0{index + 1}</span>
                  <span><strong>{difficulty.name}</strong><small>{difficulty.description}</small></span>
                  <span className="level-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (phase === "guide" && selectedImage) {
    return (
      <main className="difficulty-page">
        <button className="back-button" onClick={() => setPhase("difficulty")} aria-label="Back to difficulty">← Back</button>
        <div className="difficulty-layout">
          <figure className="chosen-picture">
            <img src={selectedImage.url} alt={selectedImage.title} />
            <figcaption>
              <span>{level.name} · {level.columns * level.columns} pieces</span>
              <a href={selectedImage.pageUrl} target="_blank" rel="noreferrer">{imageCredit}</a>
            </figcaption>
          </figure>
          <section className="level-picker guide-picker">
            <p className="eyebrow">One more choice</p>
            <h1>Show a picture guide?</h1>
            <div className="guide-options">
              <button onClick={() => startGame(true)}>
                <span
                  className="guide-preview guide-preview-on"
                  style={{ backgroundImage: `linear-gradient(rgba(255,255,255,.72), rgba(255,255,255,.72)), url("${selectedImage.url}")` }}
                  aria-hidden="true"
                >
                  {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
                </span>
                <span><strong>Show guide</strong><small>See a faint picture behind the pieces.</small></span>
                <span className="level-arrow" aria-hidden="true">→</span>
              </button>
              <button onClick={() => startGame(false)}>
                <span className="guide-preview guide-preview-off" aria-hidden="true">
                  {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
                </span>
                <span><strong>No guide</strong><small>Build on a blank board for a bigger challenge.</small></span>
                <span className="level-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (selectedImage) {
    return (
      <main className="game-page" style={{ "--cols": level.columns } as React.CSSProperties}>
        <header className="game-bar">
          <button className="quit-button" onClick={resetToSearch}>← New picture</button>
          <div className="game-status" aria-label={`${placed.size} of ${totalPieces} pieces placed`}>
            <span>{level.name}</span>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <strong>{placed.size}/{totalPieces}</strong>
          </div>
          <div className={`timer ${timeLeft <= 20 ? "timer-low" : ""}`} aria-live="polite">
            <span>TIME</span><strong>{formatTime(timeLeft)}</strong>
          </div>
        </header>

        <section className="game-area">
          <div className="piece-zone">
            <div className="zone-heading"><span>YOUR PIECES</span><small>Drag each one to its spot</small></div>
            <div className="piece-pile">
              {pieces.filter((piece) => !placed.has(piece)).map((piece) => {
                const isTouchDragging = dragState?.id === piece;
                return (
                  <button
                    key={piece}
                    className={`loose-piece ${selectedPiece === piece ? "piece-selected" : ""} ${shakingPiece === piece ? "piece-shaking" : ""} ${isTouchDragging ? "piece-dragging" : ""}`}
                    style={{
                      ...pieceStyle(piece),
                      transform: isTouchDragging ? `translate(${dragState.dx}px, ${dragState.dy}px) scale(1.07)` : undefined,
                    }}
                    draggable
                    onDragStart={(event) => { setDraggedPiece(piece); event.dataTransfer.setData("text/plain", String(piece)); }}
                    onDragEnd={() => setDraggedPiece(null)}
                    onPointerDown={(event) => handlePointerDown(event, piece)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onClick={() => setSelectedPiece((current) => current === piece ? null : piece)}
                    aria-label={`Puzzle piece ${piece + 1}${selectedPiece === piece ? ", selected" : ""}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="board-wrap">
            <div className="board-label"><span>BUILD IT HERE</span><small>{selectedPiece === null ? "Drop a piece on the right spot" : "Now pick its spot"}</small></div>
            <div
              className={`puzzle-board ${showGuide ? "board-with-guide" : "board-without-guide"}`}
              style={showGuide ? { backgroundImage: `linear-gradient(rgba(255,255,255,.84), rgba(255,255,255,.84)), url("${selectedImage.url}")` } : undefined}
            >
              {Array.from({ length: totalPieces }, (_, cell) => (
                <button
                  className={`board-cell ${placed.has(cell) ? "cell-filled" : ""}`}
                  data-cell={cell}
                  key={cell}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dropped = draggedPiece ?? Number(event.dataTransfer.getData("text/plain"));
                    tryPlace(Number.isNaN(dropped) ? null : dropped, cell);
                  }}
                  onClick={() => tryPlace(selectedPiece, cell)}
                  aria-label={placed.has(cell) ? `Piece ${cell + 1} placed` : `Empty spot ${cell + 1}`}
                >
                  {placed.has(cell) && <span className="fixed-piece" style={pieceStyle(cell)} />}
                </button>
              ))}
            </div>
          </div>
        </section>

        {(phase === "won" || phase === "lost") && (
          <div className="result-layer" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <div className="result-card">
              <div className="result-symbol" aria-hidden="true">{phase === "won" ? "★" : "↻"}</div>
              <p className="eyebrow">{phase === "won" ? "Puzzle complete" : "Time’s up"}</p>
              <h1 id="result-title">{phase === "won" ? "Congratulations!" : "Please try again."}</h1>
              <p>{phase === "won" ? `You finished the ${level.name.toLowerCase()} puzzle with ${formatTime(timeLeft)} left.` : "You’ve got this — give the same puzzle another go."}</p>
              <div className="result-actions">
                <button className="primary-action" onClick={() => startGame(showGuide)}>{phase === "won" ? "Play again" : "Try again"}</button>
                <button className="secondary-action" onClick={() => setPhase("difficulty")}>Change level</button>
              </div>
              <button className="text-action" onClick={resetToSearch}>Choose a new picture</button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return null;
}
