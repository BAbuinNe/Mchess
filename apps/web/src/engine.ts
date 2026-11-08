export type EngineResult = { move: string; depth: number; score: number | null; mate: number | null; pv: string[] };

class StockfishEngine {
  private worker = new Worker("/engine/stockfish-19-lite-single.js");
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private listener: ((line: string) => void) | null = null;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<string>) => {
      const line = String(event.data);
      this.listener?.(line);
    };
    this.ready = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Stockfish не загрузился")), 15000);
      this.listener = line => {
        if (!line.includes("uciok")) return;
        this.worker.postMessage("isready");
        this.listener = next => {
          if (!next.includes("readyok")) return;
          window.clearTimeout(timeout);
          this.listener = null;
          resolve();
        };
      };
      this.worker.onerror = () => { window.clearTimeout(timeout); reject(new Error("Ошибка загрузки Stockfish")); };
      this.worker.postMessage("uci");
    });
  }

  search(fen: string, skill = 20, movetime = 500): Promise<EngineResult> {
    const task = this.queue.then(async () => {
      await this.ready;
      return new Promise<EngineResult>((resolve, reject) => {
        let depth = 0;
        let score: number | null = null;
        let mate: number | null = null;
        let pv: string[] = [];
        const timeout = window.setTimeout(() => {
          this.worker.postMessage("stop");
          this.listener = null;
          reject(new Error("Stockfish не ответил"));
        }, Math.max(10000, movetime + 5000));
        this.listener = line => {
          if (line.startsWith("info ")) {
            const d = line.match(/\bdepth (\d+)/);
            const cp = line.match(/\bscore cp (-?\d+)/);
            const m = line.match(/\bscore mate (-?\d+)/);
            const variation = line.match(/\bpv (.+)$/);
            if (d && Number(d[1]) >= depth) {
              depth = Number(d[1]);
              if (cp) { score = Number(cp[1]); mate = null; }
              if (m) { mate = Number(m[1]); score = null; }
              if (variation) pv = variation[1].trim().split(/\s+/);
            }
          }
          if (!line.startsWith("bestmove ")) return;
          window.clearTimeout(timeout);
          this.listener = null;
          const move = line.split(/\s+/)[1];
          if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) reject(new Error("Stockfish не нашёл ход"));
          else resolve({ move, depth, score, mate, pv });
        };
        this.worker.postMessage("setoption name Skill Level value " + Math.max(0, Math.min(20, skill)));
        this.worker.postMessage("position fen " + fen);
        this.worker.postMessage("go movetime " + movetime);
      });
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}

const instances: Partial<Record<"analysis" | "play", StockfishEngine>> = {};
export function engine(purpose: "analysis" | "play" = "analysis"): StockfishEngine {
  if (!instances[purpose]) instances[purpose] = new StockfishEngine();
  return instances[purpose];
}