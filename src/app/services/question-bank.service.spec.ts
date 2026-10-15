import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QuestionBankService, normalizeBank } from './question-bank.service';

describe('QuestionBankService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('loads assets/data/questions.json once and shares it', () => {
    const service = TestBed.inject(QuestionBankService);
    const http = TestBed.inject(HttpTestingController);
    const seen: number[] = [];
    service.getBank().subscribe((b) => seen.push(b.questions.length));
    service.getBank().subscribe((b) => seen.push(b.questions.length));
    http.expectOne('assets/data/questions.json').flush({ generatedAt: 'x', questions: [{ id: 'a-001' }], answeredIds: ['a-001', 7] });
    expect(seen).toEqual([1, 1]);
    http.verify();
  });

  it('falls back to an empty bank when the file cannot be loaded', () => {
    spyOn(console, 'warn');
    const service = TestBed.inject(QuestionBankService);
    const http = TestBed.inject(HttpTestingController);
    let questions = -1;
    service.getBank().subscribe((b) => (questions = b.questions.length));
    http.expectOne('assets/data/questions.json').flush('nope', { status: 500, statusText: 'Server Error' });
    expect(questions).toBe(0);
  });

  it('normalizes malformed bodies', () => {
    expect(normalizeBank(null)).toEqual({ generatedAt: '', questions: [], answeredIds: [] });
    expect(normalizeBank({ questions: 'no', answeredIds: [1, 'b-002'] })).toEqual({ generatedAt: '', questions: [], answeredIds: ['b-002'] });
  });
});
