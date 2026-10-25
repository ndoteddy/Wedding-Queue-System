import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <span class="brand">💍 Wedding Queue</span>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" data-testid="nav-dashboard">Dashboard</a>
        <a routerLink="/guests/new" routerLinkActive="active" data-testid="nav-add">Add guest</a>
        <a routerLink="/rundown" routerLinkActive="active" data-testid="nav-rundown">Rundown</a>
        <a routerLink="/scanner" routerLinkActive="active" data-testid="nav-scanner">Scanner</a>
      </nav>
    </header>
    <main><router-outlet /></main>
  `,
  styles: `
    header { display: flex; align-items: center; gap: 2rem; padding: .9rem 1.5rem; background: #fff; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
    .brand { font-family: Georgia, serif; font-size: 1.3rem; color: var(--gold); }
    nav { display: flex; gap: .5rem; }
    nav a { padding: .4rem .9rem; border-radius: 999px; text-decoration: none; color: var(--ink); }
    nav a.active { background: var(--rose); color: #fff; }
    main { max-width: 1100px; margin: 1.5rem auto; padding: 0 1rem; }
  `,
})
export class App {}

