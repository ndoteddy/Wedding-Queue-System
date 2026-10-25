import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, RundownInput, RundownItem, RundownStatus } from '../api.service';

const EMPTY: RundownInput = { startTime: '', durationMinutes: 15, title: '', description: null, location: null, owner: null };

/** "15:30" + 45 ? "16:15" (wraps past midnight). */
export function endTime(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const t = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

@Component({
  selector: 'app-rundown',
  imports: [FormsModule],
  template: `
    <div class="head">
      <div>
        <h1>Wedding-day rundown</h1>
        <p class="muted">The run-of-show: who does what, where and when.</p>
      </div>
      <button class="btn" (click)="startAdd()" data-testid="add-item">+ Add item</button>
    </div>
    @if (error()) { <p class="error" data-testid="error">{{ error() }}</p> }

    <div class="bar" role="progressbar" [attr.aria-valuenow]="percent()"><i [style.width.%]="percent()"></i></div>
    <p class="muted" data-testid="progress">{{ doneCount() }} of {{ items().length }} done</p>

    @if (current(); as c) {
      <div class="banner now" data-testid="now">? <b>Now:</b> {{ c.title }} <small>({{ c.startTime }}–{{ end(c) }})</small></div>
    }
    @if (next(); as n) {
      <div class="banner next" data-testid="next">? <b>Up next:</b> {{ n.startTime }} · {{ n.title }}</div>
    }

    @if (editing()) {
      <form class="card form" #f="ngForm" (ngSubmit)="save(f.valid ?? false)" novalidate data-testid="item-form">
        <h2>{{ editId() ? 'Edit item' : 'New item' }}</h2>
        <div class="grid">
          <div>
            <label for="rt">Start (24h)</label>
            <input id="rt" name="startTime" type="time" [(ngModel)]="model.startTime" required data-testid="input-time">
          </div>
          <div>
            <label for="rd">Minutes</label>
            <input id="rd" name="durationMinutes" type="number" min="1" max="600" [(ngModel)]="model.durationMinutes" required data-testid="input-duration">
          </div>
          <div class="wide">
            <label for="rtitle">Title</label>
            <input id="rtitle" name="title" [(ngModel)]="model.title" required data-testid="input-title">
          </div>
          <div>
            <label for="rl">Location</label>
            <input id="rl" name="location" [(ngModel)]="model.location" data-testid="input-location">
          </div>
          <div>
            <label for="ro">Owner</label>
            <input id="ro" name="owner" [(ngModel)]="model.owner" data-testid="input-owner">
          </div>
          <div class="wide">
            <label for="rn">Notes</label>
            <input id="rn" name="description" [(ngModel)]="model.description" data-testid="input-notes">
          </div>
        </div>
        @if (formError()) { <div class="error" data-testid="form-error">{{ formError() }}</div> }
        <div class="btns">
          <button class="btn" type="submit" data-testid="save-item">Save</button>
          <button class="btn ghost" type="button" (click)="cancel()">Cancel</button>
        </div>
      </form>
    }

    <ol class="timeline" data-testid="timeline">
      @for (r of items(); track r.id) {
        <li class="card item" [class.active]="r.status === 'inprogress'" [class.finished]="r.status === 'done'" [attr.data-testid]="'item-' + r.id">
          <div class="time"><b>{{ r.startTime }}</b><small>{{ end(r) }}</small></div>
          <div class="body">
            <h3>{{ r.title }}</h3>
            <p class="meta">
              @if (r.location) { <span>?? {{ r.location }}</span> }
              @if (r.owner) { <span>?? {{ r.owner }}</span> }
              <span>? {{ r.durationMinutes }} min</span>
            </p>
            @if (r.description) { <p class="notes">{{ r.description }}</p> }
          </div>
          <div class="side">
            <span class="badge" [class.ok]="r.status === 'done'" [class.wait]="r.status === 'inprogress'" data-testid="status">{{ label(r.status) }}</span>
            <div class="btns">
              @if (r.status === 'pending') { <button class="btn small" (click)="setStatus(r, 'inprogress')">Start</button> }
              @if (r.status === 'inprogress') { <button class="btn small" (click)="setStatus(r, 'done')">Done</button> }
              @if (r.status !== 'pending') { <button class="btn ghost small" (click)="setStatus(r, 'pending')">Reset</button> }
              <button class="btn ghost small" (click)="startEdit(r)">Edit</button>
              <button class="btn ghost small danger-text" (click)="remove(r)">?</button>
            </div>
          </div>
        </li>
      } @empty {
        @if (loaded()) { <li class="muted">No items yet — add the first moment of the day.</li> }
      }
    </ol>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .muted { color: var(--muted); margin: 0 0 .5rem; }
    .bar { height: 10px; background: var(--line); border-radius: 99px; overflow: hidden; margin-top: .5rem; }
    .bar i { display: block; height: 100%; background: var(--ok); transition: width .4s; }
    .banner { padding: .7rem 1rem; border-radius: 10px; margin: .5rem 0; }
    .banner.now { background: #dff3e8; color: #1d6b42; }
    .banner.next { background: #fbefd9; color: #8a560e; }
    .form { margin: 1rem 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
    .wide { grid-column: 1 / -1; }
    .btns { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .5rem; }
    .timeline { list-style: none; padding: 0; margin: 1rem 0 0; display: flex; flex-direction: column; gap: .7rem; }
    .item { display: grid; grid-template-columns: 70px 1fr auto; gap: 1rem; align-items: start; border-left: 5px solid var(--line); }
    .item.active { border-left-color: var(--ok); background: #f4fbf7; }
    .item.finished { opacity: .6; }
    .time { display: flex; flex-direction: column; font-family: Georgia, serif; }
    .time b { font-size: 1.2rem; color: var(--rose); }
    .time small { color: var(--muted); }
    h3 { margin: 0; }
    .meta { display: flex; gap: 1rem; flex-wrap: wrap; color: var(--muted); font-size: .85rem; margin: .2rem 0; }
    .notes { margin: .2rem 0 0; font-size: .9rem; }
    .side { text-align: right; }
    .danger-text { color: var(--bad); }
    @media (max-width: 700px) { .item { grid-template-columns: 60px 1fr; } .side { grid-column: 1 / -1; text-align: left; } }
  `,
})
export class Rundown implements OnInit {
  private api = inject(ApiService);

  items = signal<RundownItem[]>([]);
  loaded = signal(false);
  error = signal('');
  formError = signal('');
  editing = signal(false);
  editId = signal<number | null>(null);
  model: RundownInput = { ...EMPTY };

  doneCount = computed(() => this.items().filter(i => i.status === 'done').length);
  percent = computed(() => (this.items().length ? Math.round((this.doneCount() / this.items().length) * 100) : 0));
  current = computed(() => this.items().find(i => i.status === 'inprogress') ?? null);
  next = computed(() => this.items().find(i => i.status === 'pending') ?? null);

  end = (r: RundownItem) => endTime(r.startTime, r.durationMinutes);
  label = (s: RundownStatus) => ({ pending: 'Upcoming', inprogress: 'In progress', done: 'Done' })[s];

  ngOnInit() { this.load(); }

  load() {
    this.api.rundown().subscribe({
      next: r => { this.items.set(r); this.loaded.set(true); this.error.set(''); },
      error: () => this.error.set('Cannot reach the server. Is the backend running on port 5277?'),
    });
  }

  startAdd() {
    this.model = { ...EMPTY };
    this.editId.set(null); this.formError.set(''); this.editing.set(true);
  }

  startEdit(r: RundownItem) {
    this.model = { startTime: r.startTime, durationMinutes: r.durationMinutes, title: r.title, description: r.description, location: r.location, owner: r.owner };
    this.editId.set(r.id); this.formError.set(''); this.editing.set(true);
  }

  cancel() { this.editing.set(false); }

  save(valid: boolean) {
    if (!valid || !this.model.title?.trim() || !this.model.startTime) {
      this.formError.set('Title and start time are required.');
      return;
    }
    const body = { ...this.model, description: this.model.description || null, location: this.model.location || null, owner: this.model.owner || null };
    const id = this.editId();
    (id ? this.api.updateRundown(id, body) : this.api.addRundown(body)).subscribe({
      next: () => { this.editing.set(false); this.load(); },
      error: (e: HttpErrorResponse) => this.formError.set(
        e.status === 400 ? Object.values(e.error?.errors ?? {}).flat().join(' ') : 'Could not save the item.'),
    });
  }

  setStatus(r: RundownItem, status: RundownStatus) {
    this.api.setRundownStatus(r.id, status).subscribe({ next: () => this.load(), error: () => this.error.set('Could not update the status.') });
  }

  remove(r: RundownItem) {
    if (confirm(`Delete "${r.title}"?`)) this.api.removeRundown(r.id).subscribe(() => this.load());
  }
}

