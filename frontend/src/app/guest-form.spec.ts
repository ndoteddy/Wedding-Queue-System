import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { GuestForm } from './pages/guest-form';

describe('GuestForm', () => {
  const created = { id: 5, name: 'New Guest', code: 'abc', email: 'n@x.com', phone: '5551234' };
  const create = vi.fn();

  const setup = async () => {
    TestBed.configureTestingModule({
      imports: [GuestForm],
      providers: [provideRouter([]), { provide: ApiService, useValue: {
        create, qrUrl: () => '/qr', notifications: () => of([{ id: 1, channel: 'email', recipient: 'n@x.com', status: 'sent', detail: null }]),
      } }],
    });
    const f = TestBed.createComponent(GuestForm);
    f.detectChanges();
    await f.whenStable(); // let ngModel controls register
    return f;
  };
  const fill = async (f: Awaited<ReturnType<typeof setup>>, v: Record<string, string>) => {
    const el = f.nativeElement as HTMLElement;
    for (const [k, val] of Object.entries(v)) {
      const input = el.querySelector<HTMLInputElement>(`[data-testid=input-${k}]`)!;
      input.value = val;
      input.dispatchEvent(new Event('input'));
    }
    await f.whenStable();
    f.detectChanges();
  };

  beforeEach(() => create.mockReset());

  it('does not submit an invalid form and shows errors', async () => {
    const f = await setup();
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=submit]')!.click();
    await f.whenStable();
    f.detectChanges();
    expect(create).not.toHaveBeenCalled();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Name is required');
  });

  it('submits a valid form and shows the success card with notification status', async () => {
    create.mockReturnValue(of(created));
    const f = await setup();
    await fill(f, { name: 'New Guest', email: 'n@x.com', phone: '5551234' });
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=submit]')!.click();
    await f.whenStable();
    f.detectChanges();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Guest', email: 'n@x.com', table: null }));
    const success = (f.nativeElement as HTMLElement).querySelector('[data-testid=success]');
    expect(success?.textContent).toContain('New Guest added');
    expect(success?.textContent).toContain('email: sent');
  });

  it('shows server validation errors', async () => {
    create.mockReturnValue(throwError(() => ({ status: 400, error: { errors: { email: ['A valid email is required'] } } })));
    const f = await setup();
    await fill(f, { name: 'X', email: 'x@y.co', phone: '5551234' });
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=submit]')!.click();
    await f.whenStable();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[data-testid=form-error]')?.textContent).toContain('valid email');
  });
});

