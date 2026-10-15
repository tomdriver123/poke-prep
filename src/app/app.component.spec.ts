import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), importProvidersFrom(IonicModule.forRoot())] }),
  );

  it('lists the Map and About pages in the menu', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const labels = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('ion-menu ion-label')).map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Map', 'About']);
  });
});
