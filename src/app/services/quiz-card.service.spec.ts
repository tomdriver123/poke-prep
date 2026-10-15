import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { KbQuestion, QuestionBank } from '../models/kb-question';
import { QuizCardService } from './quiz-card.service';

function question(id: string, topic: string, status = 'queued'): KbQuestion {
  return {
    id, topic, key: `${topic}.k`, kind: 'concept', level: 'fundamentals', status, due: null, seen: 0, label: id,
    stem: 'Which one?', options: [{ letter: 'A', text: 'a' }, { letter: 'B', text: 'b' }, { letter: 'C', text: 'c' }],
    answer: 'B', why: 'Because.', rubric: [], modelAnswer: '', versions: null, deck: 'seed', firstAsked: null, attempts: [],
  };
}

const BANK: QuestionBank = {
  generatedAt: '2026-10-15T12:00:00.000Z',
  questions: [question('web-001', 'web'), question('js-001', 'js'), question('web-002', 'web'), question('js-002', 'js', 'asked')],
  answeredIds: ['web-002'],
};

describe('QuizCardService', () => {
  let http: HttpTestingController;

  function create(): QuizCardService {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(QuizCardService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('serves queued questions in bank order and skips ones the game already recorded', () => {
    const service = create();
    expect(service.queueFor(BANK).map((q) => q.id)).toEqual(['web-001', 'js-001']);
    expect(service.queueFor(null)).toEqual([]);
  });

  it('grades locally, stores the answer under a poke-prep key and drops it from the queue', () => {
    const service = create();
    const answer = service.record(BANK.questions[0], 'B', { town: 'saffron-city', species: 'abra' });
    expect(answer.result).toBe('pass');
    expect(service.answerOf('web-001')?.pick).toBe('B');
    expect(service.queueFor(BANK).map((q) => q.id)).toEqual(['js-001']);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('poke-prep:')).length).toBeGreaterThan(0);
    expect(Object.keys(localStorage).some((k) => k.startsWith('shadow.'))).toBeFalse();

    const req = http.expectOne('/api/game/encounter');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.questionId).toBe('web-001');
    expect(req.request.body.result).toBe('pass');
    expect(req.request.body.town).toBe('saffron-city');
    expect(req.request.body.answered).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    req.flush({ row: { result: 'caught' } });
  });

  it('posts to the attempt route when there is no town and grades a wrong pick as a miss', () => {
    const service = create();
    expect(service.record(BANK.questions[1], 'A').result).toBe('miss');
    const req = http.expectOne('/api/quiz/attempt');
    expect(req.request.body.result).toBe('miss');
    req.flush({ entry: {} });
  });

  it('answering the same question twice keeps the first answer', () => {
    const service = create();
    service.record(BANK.questions[0], 'B');
    const second = service.record(BANK.questions[0], 'A');
    expect(second.pick).toBe('B');
    http.expectOne('/api/quiz/attempt').flush({ entry: {} });
  });
});
