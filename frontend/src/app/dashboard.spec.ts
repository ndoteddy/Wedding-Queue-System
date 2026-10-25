import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiService, Guest, Stats } from './api.service';
import { Dashboard } from './pages/dashboard';

const guest = (id: number, over: Partial<Guest> = {}): Guest => ({
  id, name: `Guest ${id}`, email: `g${id}@x.com`, phone: '5550000', table: '1', partySize: 2,
  code: `code${id}`, createdAt: '', checkedInAt: null, invitationSentAt: null, ...over,
});
const stats = (over: Partial<Stats> = {}): Stats => ({
  total: 2, checkedIn: 1, pending: 1, expectedPeople: 4, arrivedPeople: 2, recent: [], ...over,
});

describe('Dashboard', () => {
  const setup = (api: Partial<ApiService>) => {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), { provide: ApiService, useValue: { qrUrl: (c: string) => `/qr/${c}`, ...api } }],
    });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    return fixture;
  };

  it('shows stats, progress and guest rows', async () => {
    const f = setup({
      guests: () => of([guest(1, { checkedInAt: '2026-01-01T10:00:00Z' }), guest(2)]),
      stats: () => of(stats({ recent: [guest(1, { checkedInAt: '2026-01-01T10:00:00Z' })] })),
    });
    await f.whenStable();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=stat-total]')?.textContent).toBe('2');
    expect(el.querySelector('[data-testid=stat-people]')?.textContent?.trim()).toBe('2 / 4');
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.querySelector('[data-testid=row-1] .badge')?.textContent).toContain('Arrived');
    expect(el.querySelector('[data-testid=row-2] .badge')?.textContent).toContain('Waiting');
    expect(f.componentInstance.percent()).toBe(50);
    expect(el.querySelector('[data-testid=recent]')?.textContent).toContain('Guest 1');
  });

  it('shows an error when the backend is unreachable', async () => {
    const f = setup({ guests: () => throwError(() => new Error('x')), stats: () => of(stats()) });
    await f.whenStable();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid=error]')).toBeTruthy();
  });

  it('opens the QR modal for a guest', async () => {
    const f = setup({ guests: () => of([guest(1)]), stats: () => of(stats()) });
    await f.whenStable();
    f.componentInstance.qr.set(guest(1));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid=qr-code]')?.textContent).toBe('code1');
  });
});
