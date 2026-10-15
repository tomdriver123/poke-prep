import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { KbQuestion, QuestionBank } from '../models/kb-question';

const QUESTIONS_URL = 'assets/data/questions.json';

const EMPTY: QuestionBank = { generatedAt: '', questions: [], answeredIds: [] };

/** Loads the question bank once per page load and shares it between consumers. */
@Injectable({ providedIn: 'root' })
export class QuestionBankService {
  private readonly http = inject(HttpClient);

  private readonly bank$: Observable<QuestionBank> = this.http.get<unknown>(QUESTIONS_URL).pipe(
    map((body) => normalizeBank(body)),
    catchError((err: unknown) => {
      console.warn('[questions] could not load questions.json', err);
      return of(EMPTY);
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  getBank(): Observable<QuestionBank> {
    return this.bank$;
  }
}

/** Accepts the generated shape and tolerates a missing or malformed body by returning an empty bank. */
export function normalizeBank(body: unknown): QuestionBank {
  if (typeof body !== 'object' || body === null) return EMPTY;
  const raw = body as Partial<Record<keyof QuestionBank, unknown>>;
  const questions = Array.isArray(raw.questions) ? (raw.questions as KbQuestion[]) : [];
  const answeredIds = Array.isArray(raw.answeredIds) ? raw.answeredIds.filter((id): id is string => typeof id === 'string') : [];
  return {
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
    questions,
    answeredIds,
  };
}
