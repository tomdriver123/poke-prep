import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular';
import { provideMarkdown } from 'ngx-markdown';
import { KbQuestion } from '../../models/kb-question';
import { PokePage } from './poke.page';

// An end to end pass through the page with the HTTP layer faked: the three data files load, a town
// opens with a wild encounter from the question bank, and answering posts the encounter.

const TOWNS = [
  { id: 'pallet-town', name: 'Pallet Town', order: 1, role: 'Home', mode: 'home', pool: [], gates: [], banks: [], grid: { x: 3, y: 14 } },
  {
    id: 'saffron-city', name: 'Saffron City', order: 2, role: 'Psychic gym', mode: 'mcq', track: 'subject-knowledge',
    trackLabel: 'Subject knowledge', type: 'psychic', banks: ['web-fundamentals'], grid: { x: 12, y: 7 }, gates: [],
    pool: [{ species: 'abra', display: 'Abra', dex: 63, types: ['psychic'], sprite: null, gift: false, gated: false }],
  },
];

const GAME = {
  generatedAt: '2026-10-15T12:00:00.000Z', warnings: [], season: { number: 1, started: '2026-09-01' },
  trainer: { name: 'Trainer', xpTotal: 0, pokedex: { seen: 0, caught: 0, seasonCaught: 0, cap: 151 } },
  party: [], pokedex: { entries: [] }, scout: null, gates: {}, routes: [['pallet-town', 'saffron-city']], xpLog: [],
};

const QUESTION: KbQuestion = {
  id: 'web-005', topic: 'web-fundamentals', key: 'http.cors.preflight', kind: 'concept', level: 'fundamentals', status: 'queued',
  due: null, seen: 0, label: 'cors preflight', stem: 'When does a browser send a preflight?',
  options: [{ letter: 'A', text: 'Always' }, { letter: 'B', text: 'For non simple requests' }, { letter: 'C', text: 'Never' }],
  answer: 'B', why: 'Only for non simple requests.', rubric: [], modelAnswer: '', versions: null, deck: 'seed', firstAsked: null, attempts: [],
};

describe('PokePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: PokePage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMarkdown(),
        importProvidersFrom(IonicModule.forRoot()),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  function flushData(): void {
    http.expectOne('assets/data/towns.json').flush(TOWNS);
    http.expectOne('assets/data/game.json').flush(GAME);
  }

  // The question bank loads when the first encounter card is created, not with the page.
  function flushQuestions(): void {
    http.expectOne('assets/data/questions.json').flush({ generatedAt: GAME.generatedAt, questions: [QUESTION], answeredIds: [] });
  }

  it('lists the towns from towns.json', async () => {
    const harness = await RouterTestingHarness.create('/');
    flushData();
    harness.detectChanges();
    const names = Array.from<HTMLElement>(harness.routeNativeElement!.querySelectorAll('.row-name')).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Pallet Town', 'Saffron City']);
    http.expectNone('assets/data/questions.json');
  });

  it('opens a town with a wild encounter and posts the answer', async () => {
    const harness = await RouterTestingHarness.create('/?town=saffron-city');
    flushData();
    harness.detectChanges();
    flushQuestions();
    harness.detectChanges();
    const root = harness.routeNativeElement as HTMLElement;
    expect(root.querySelector('.appeared')?.textContent).toContain('A wild Abra appeared!');
    const options = root.querySelectorAll<HTMLButtonElement>('button.option');
    expect(options.length).toBe(3);

    options[1].click();
    harness.detectChanges();
    const req = http.expectOne('/api/game/encounter');
    expect(req.request.body).toEqual(jasmine.objectContaining({
      questionId: 'web-005', topic: 'web-fundamentals', pick: 'B', answer: 'B', result: 'pass', town: 'saffron-city', species: 'abra',
    }));
    req.flush({ row: { result: 'caught' } });
    harness.detectChanges();
    expect(root.querySelector('.verdict')?.textContent).toContain('Gotcha! Abra was caught!');
  });
});
