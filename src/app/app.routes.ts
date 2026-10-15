import { Routes } from '@angular/router';

export const ROUTES: Routes = [
  { path: 'about', loadComponent: () => import('./pages/about/about.page').then((m) => m.AboutPage) },
  { path: '', redirectTo: 'about', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
