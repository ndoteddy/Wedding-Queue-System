import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, Guest, NotificationLog } from '../api.service';

@Component({
  selector: 'app-guest-form',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Add a guest</h1>
    <p class="muted">Saving sends the guest their personal QR code by email and SMS automatically.</p>
    <div class="cols">
      <form class="card" #f="ngForm" (ngSubmit)="submit(f)" novalidate>
        <div class="field">
          <label for="name">Full name</label>
          <input id="name" name="name" [(ngModel)]="model.name" required #name="ngModel" data-testid="input-name">
          @if (name.invalid && (name.touched || f.submitted)) { <div class="error">Name is required</div> }
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" [(ngModel)]="model.email" required email #email="ngModel" data-testid="input-email">
          @if (email.invalid && (email.touched || f.submitted)) { <div class="error">Enter a valid email</div> }
        </div>
        <div class="field">
          <label for="phone">Phone</label>
          <input id="phone" name="phone" type="tel" [(ngModel)]="model.phone" required minlength="7" #phone="ngModel" data-testid="input-phone">
          @if (phone.invalid && (phone.touched || f.submitted)) { <div class="error">Enter a valid phone number</div> }
        </div>
        <div class="row">
          <div class="field">
            <label for="table">Table</label>
            <input id="table" name="table" [(ngModel)]="model.table" data-testid="input-table">
          </div>
          <div class="field">
            <label for="party">Party size</label>
            <input id="party" name="partySize" type="number" min="1" max="20" [(ngModel)]="model.partySize" required data-testid="input-party">
          </div>
        </div>
        @if (error()) { <div class="error" data-testid="form-error">{{ error() }}</div> }
        <button class="btn" type="submit" [disabled]="saving()" data-testid="submit">
          {{ saving() ? 'Sending…' : 'Save & send QR code' }}
        </button>
      </form>

      @if (created(); as g) {
        <section class="card success" data-testid="success">
          <h2>✅ {{ g.name }} added</h2>
          <img [src]="api.qrUrl(g.code)" width="200" height="200" alt="QR code">
          <ul>
            @for (n of logs(); track n.id) {
              <li>
                <span class="badge" [class.ok]="n.status !== 'failed'" [class.fail]="n.status === 'failed'">{{ n.channel }}: {{ n.status }}</span>
                {{ n.recipient }}
              </li>
            }
          </ul>
          <a routerLink="/" class="btn ghost small">Back to dashboard</a>
        </section>
      }
    </div>
  `,
  styles: `
    .muted { color: var(--muted); }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
    @media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }
    .field { margin-bottom: .9rem; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .success { text-align: center; }
    .success ul { list-style: none; padding: 0; text-align: left; }
    .success li { margin: .4rem 0; }
    .success a { text-decoration: none; }
  `,
})
export class GuestForm {
  protected api = inject(ApiService);

  model = { name: '', email: '', phone: '', table: '', partySize: 1 };
  saving = signal(false);
  error = signal('');
  created = signal<Guest | null>(null);
  logs = signal<NotificationLog[]>([]);

  submit(f: NgForm) {
    this.error.set('');
    if (f.invalid) return;
    this.saving.set(true);
    this.api.create({ ...this.model, table: this.model.table || null }).subscribe({
      next: g => {
        this.created.set(g);
        this.api.notifications(g.id).subscribe(l => this.logs.set(l));
        this.saving.set(false);
        f.resetForm({ name: '', email: '', phone: '', table: '', partySize: 1 });
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(e.status === 400 ? Object.values(e.error?.errors ?? {}).flat().join(' ') : 'Could not save the guest.');
      },
    });
  }
}
