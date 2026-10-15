import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { provideMarkdown } from 'ngx-markdown';

import { AppComponent } from './app/app.component';
import { ROUTES } from './app/app.routes';

// The pages import IonicModule (not the standalone Ionic components), so the host app
// installs Ionic with IonicModule.forRoot() rather than provideIonicAngular().
bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(IonicModule.forRoot()),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideRouter(ROUTES),
    provideHttpClient(),
    provideMarkdown(),
  ],
}).catch((err) => console.error(err));
