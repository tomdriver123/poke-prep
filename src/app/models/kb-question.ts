/**
 * A multiple choice question from a question bank, as written to questions.json by
 * scripts/generate-game-data.js (parsed by scripts/lib/kb.js).
 */

export interface KbOption {
  letter: string;
  text: string;
}

export interface KbAttempt {
  date: string;
  /** mcq | recall */
  mode: string;
  pick: string | null;
  /** pass | miss | guess | skip */
  result: string;
  tier: number;
}

/** The bank Index status: queued | asked | due | learned | retired. Kept as a string on purpose, the vault can grow new values. */
export type KbStatus = string;

export interface KbQuestion {
  id: string;
  topic: string;
  key: string;
  kind: string;
  /** fundamentals | medium | senior */
  level: string;
  status: KbStatus;
  due: string | null;
  seen: number;
  label: string;
  stem: string;
  options: KbOption[];
  /** The correct option letter. */
  answer: string;
  why: string;
  rubric: string[];
  modelAnswer: string;
  versions: string | null;
  deck: string;
  firstAsked: string | null;
  attempts: KbAttempt[];
}

/** The shape of assets/data/questions.json. */
export interface QuestionBank {
  generatedAt: string;
  /** Queued questions first, in serving order, then the rest. */
  questions: KbQuestion[];
  /** Questions the game has already recorded (a pokedex row or an offline attempt), so they are not served again. */
  answeredIds: string[];
}
