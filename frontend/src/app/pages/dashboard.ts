import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService, Guest, Stats } from '../api.service';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink],
  template: `
    <h1>Dashboard</h1>
    @if (error()) { <p class="error" data-testid="error">{{ error() }}</p> }

    @if (stats(); as s) {
      <section class="tiles">
        <div class="card"><span>Guests invited</span><b data-testid="stat-total">{{ s.total }}</b></div>
        <div class="card"><span>Checked in</span><b data-testid="stat-checkedin">{{ s.checkedIn }}</b></div>
        <div class="card"><span>Still to arrive</span><b data-testid="stat-pending">{{ s.pending }}</b></div>
        <div class="card"><span>People in the room</span><b data-testid="stat-people">{{ s.arrivedPeople }} / {{ s.expectedPeople }}</b></div>
      </section>
      <div class="bar" role="progressbar" [attr.aria-valuenow]="percent()"><i [style.width.%]="percent()"></i></div>
    }

    <div class="cols">
      <section class="card">
        <div class="head">
          <h2>Guest list</h2>
          <a routerLink="/guests/new" class="btn small">+ Add guest</a>
        </div>
        <table data-testid="guest-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Table</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (g of guests(); track g.id) {
              <tr [attr.data-testid]="'row-' + g.id">
                <td>{{ g.name }} <small>×{{ g.partySize }}</small></td>
                <td>{{ g.email }}</td>
                <td>{{ g.phone }}</td>
                <td>{{ g.table ?? '—' }}</td>
                <td>
                  @if (g.checkedInAt) { <span class="badge ok">Arrived</span> }
                  @else { <span class="badge wait">Waiting</span> }
                </td>
                <td class="actions">
                  <button class="btn ghost small" (click)="qr.set(g)" title="View QR">QR</button>
                  <button class="btn ghost small" (click)="resend(g)" title="Resend invitation">Resend</button>
                  <button class="btn ghost small danger-text" (click)="remove(g)" title="Delete">✕</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6">No guests yet.</td></tr>
            }
          </tbody>
        </table>
      </section>

      <aside class="card">
        <h2>Live arrivals</h2>
        <ul data-testid="recent">
          @for (g of stats()?.recent ?? []; track g.id) {
            <li><b>{{ g.name }}</b><br><small>{{ g.checkedInAt | date: 'shortTime' }} · Table {{ g.table ?? '—' }}</small></li>
          } @empty { <li class="muted">Nobody has arrived yet.</li> }
        </ul>
      </aside>
    </div>

    @if (qr(); as g) {
      <div class="modal" (click)="qr.set(null)" data-testid="qr-modal">
        <div class="card" (click)="$event.stopPropagation()">
          <h3>{{ g.name }}</h3>
          <img [src]="api.qrUrl(g.code)" width="240" height="240" alt="QR code for {{ g.name }}">
          <p><small>Code: <code data-testid="qr-code">{{ g.code }}</code></small></p>
          @if (g.checkedInAt) {
            <button class="btn ghost small" (click)="resetCheckin(g)">Reset check-in</button>
          }
          <button class="btn small" (click)="qr.set(null)">Close</button>
        </div>
      </div>
    }
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .tiles .card { display: flex; flex-direction: column; }
    .tiles span { color: var(--muted); font-size: .85rem; }
    .tiles b { font-size: 2rem; font-family: Georgia, serif; color: var(--rose); }
    .bar { height: 10px; background: var(--line); border-radius: 99px; overflow: hidden; margin-bottom: 1.5rem; }
    .bar i { display: block; height: 100%; background: var(--ok); transition: width .4s; }
    .cols { display: grid; grid-template-columns: 1fr 280px; gap: 1rem; align-items: start; }
    @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
    .head { display: flex; justify-content: space-between; align-items: center; }
    .head a { text-decoration: none; }
    table { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th { text-align: left; color: var(--muted); font-weight: 500; }
    th, td { padding: .5rem .4rem; border-bottom: 1px solid var(--line); }
    .actions { white-space: nowrap; text-align: right; }
    .danger-text { color: var(--bad); }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: .5rem 0; border-bottom: 1px solid var(--line); }
    .muted { color: var(--muted); }
    .modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: grid; place-items: center; z-index: 10; }
    .modal .card { text-align: center; }
    .modal button { margin: .25rem; }
  `,
})
export class Dashboard implements OnInit {
  protected api = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  guests = signal<Guest[]>([]);
  stats = signal<Stats | null>(null);
  qr = signal<Guest | null>(null);
  error = signal('');
  percent = computed(() => {
    const s = this.stats();
    return s && s.total ? Math.round((s.checkedIn / s.total) * 100) : 0;
  });

  ngOnInit() {
    this.refresh();
    const t = setInterval(() => this.refresh(), 3000);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  refresh() {
    forkJoin({ guests: this.api.guests(), stats: this.api.stats() }).subscribe({
      next: ({ guests, stats }) => { this.guests.set(guests); this.stats.set(stats); this.error.set(''); },
      error: () => this.error.set('Cannot reach the server. Is the backend running on port 5277?'),
    });
  }

  resend(g: Guest) {
    this.api.resend(g.id).subscribe({
      next: () => alert(`Invitation re-sent to ${g.email} and ${g.phone}`),
      error: () => this.error.set('Could not resend the invitation.'),
    });
  }

  remove(g: Guest) {
    if (confirm(`Delete ${g.name}?`)) this.api.remove(g.id).subscribe(() => this.refresh());
  }

  resetCheckin(g: Guest) {
    this.api.resetCheckin(g.id).subscribe(() => { this.qr.set(null); this.refresh(); });
  }
}
