import { Routes } from '@angular/router';

export const ROUTES: Routes = [
  { path: 'about', loadComponent: () => import('./pages/about/about.page').then((m) => m.AboutPage) },
  { path: '', loadChildren: () => import('./pages/poke/poke.routes').then((m) => m.POKE_ROUTES) },
  { path: '**', redirectTo: '' },
];
