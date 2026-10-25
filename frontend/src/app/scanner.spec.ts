import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { Scanner } from './pages/scanner';

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false;
    start() { return Promise.reject(new Error('no camera')); }
    stop() { return Promise.resolve(); }
    clear() {}
  },
}));

describe('Scanner', () => {
  const checkIn = vi.fn();
  const setup = async () => {
    TestBed.configureTestingModule({ imports: [Scanner], providers: [{ provide: ApiService, useValue: { checkIn } }] });
    const f = TestBed.createComponent(Scanner);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  };
  const q = (f: { nativeElement: unknown }, id: string) => (f.nativeElement as HTMLElement).querySelector(`[data-testid=${id}]`);

  beforeEach(() => checkIn.mockReset());

  it('falls back to manual entry when the camera is unavailable', async () => {
    const f = await setup();
    expect(q(f, 'camera-error')).toBeTruthy();
  });

  it('shows a welcome message with the guest name on success', async () => {
    checkIn.mockReturnValue(of({ status: 'ok', message: '', guest: { name: 'Alice Johnson', partySize: 2, table: '1' } }));
    const f = await setup();
    f.componentInstance.submit('abc');
    f.detectChanges();
    expect(q(f, 'welcome')?.textContent).toContain('Welcome, Alice Johnson!');
    expect(q(f, 'result')?.getAttribute('data-status')).toBe('ok');
  });

  it('flags a repeated scan', async () => {
    checkIn.mockReturnValue(of({ status: 'already', message: '', guest: { name: 'Bob' } }));
    const f = await setup();
    f.componentInstance.submit('abc');
    f.detectChanges();
    expect(q(f, 'result')?.getAttribute('data-status')).toBe('already');
  });

  it('shows not-recognised on a 404', async () => {
    checkIn.mockReturnValue(throwError(() => ({ status: 404, error: { status: 'invalid', message: 'Unknown QR code', guest: null } })));
    const f = await setup();
    f.componentInstance.submit('nope');
    f.detectChanges();
    expect(q(f, 'welcome')?.textContent).toContain('not recognised');
  });

  it('ignores scans while a result is displayed, and accepts again after clear()', async () => {
    checkIn.mockReturnValue(of({ status: 'ok', message: '', guest: { name: 'A' } }));
    const f = await setup();
    f.componentInstance.submit('1');
    f.componentInstance.submit('2');
    expect(checkIn).toHaveBeenCalledTimes(1);
    f.componentInstance.clear();
    f.componentInstance.submit('3');
    expect(checkIn).toHaveBeenCalledTimes(2);
  });
});
