import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'Dashboard', loadComponent: () => import('./pages/dashboard').then(m => m.Dashboard) },
  { path: 'guests/new', title: 'Add guest', loadComponent: () => import('./pages/guest-form').then(m => m.GuestForm) },
  { path: 'rundown', title: 'Rundown', loadComponent: () => import('./pages/rundown').then(m => m.Rundown) },
  { path: 'scanner', title: 'Scanner', loadComponent: () => import('./pages/scanner').then(m => m.Scanner) },
  { path: '**', redirectTo: '' },
];

