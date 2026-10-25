import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService, RundownItem } from './api.service';
import { Rundown, endTime } from './pages/rundown';

const item = (id: number, over: Partial<RundownItem> = {}): RundownItem => ({
  id, startTime: `1${id}:00`, durationMinutes: 30, title: `Item ${id}`, description: null, location: 'Hall', owner: 'Sara',
  status: 'pending', startedAt: null, completedAt: null, ...over,
});

describe('endTime', () => {
  it('adds minutes', () => expect(endTime('15:30', 45)).toBe('16:15'));
  it('wraps past midnight', () => expect(endTime('23:30', 60)).toBe('00:30'));
});

describe('Rundown page', () => {
  const api = { rundown: vi.fn(), addRundown: vi.fn(), updateRundown: vi.fn(), setRundownStatus: vi.fn(), removeRundown: vi.fn() };

  const setup = async (items: RundownItem[]) => {
    Object.values(api).forEach(m => m.mockReset());
    api.rundown.mockReturnValue(of(items));
    TestBed.configureTestingModule({ imports: [Rundown], providers: [{ provide: ApiService, useValue: api }] });
    const f = TestBed.createComponent(Rundown);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  };
  const q = (f: { nativeElement: unknown }, id: string) => (f.nativeElement as HTMLElement).querySelector(`[data-testid=${id}]`);

  it('lists items and computes progress, now and next', async () => {
    const f = await setup([item(1, { status: 'done' }), item(2, { status: 'inprogress' }), item(3)]);
    expect((f.nativeElement as HTMLElement).querySelectorAll('[data-testid=timeline] > li').length).toBe(3);
    expect(q(f, 'progress')?.textContent).toContain('1 of 3 done');
    expect(f.componentInstance.percent()).toBe(33);
    expect(q(f, 'now')?.textContent).toContain('Item 2');
    expect(q(f, 'next')?.textContent).toContain('Item 3');
  });

  it('shows an error when the server is unreachable', async () => {
    Object.values(api).forEach(m => m.mockReset());
    api.rundown.mockReturnValue(throwError(() => new Error('x')));
    TestBed.configureTestingModule({ imports: [Rundown], providers: [{ provide: ApiService, useValue: api }] });
    const f = TestBed.createComponent(Rundown);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(q(f, 'error')).toBeTruthy();
  });

  it('changes status through the API and reloads', async () => {
    const f = await setup([item(1)]);
    api.setRundownStatus.mockReturnValue(of(item(1, { status: 'inprogress' })));
    f.componentInstance.setStatus(item(1), 'inprogress');
    expect(api.setRundownStatus).toHaveBeenCalledWith(1, 'inprogress');
    expect(api.rundown).toHaveBeenCalledTimes(2);
  });

  it('refuses to save without title and time', async () => {
    const f = await setup([]);
    f.componentInstance.startAdd();
    f.componentInstance.save(true);
    expect(api.addRundown).not.toHaveBeenCalled();
    expect(f.componentInstance.formError()).toContain('required');
  });

  it('saves a new item with empty optional fields as null', async () => {
    const f = await setup([]);
    api.addRundown.mockReturnValue(of(item(9)));
    f.componentInstance.startAdd();
    f.componentInstance.model = { startTime: '18:00', durationMinutes: 20, title: 'Toast', description: '', location: '', owner: '' };
    f.componentInstance.save(true);
    expect(api.addRundown).toHaveBeenCalledWith({ startTime: '18:00', durationMinutes: 20, title: 'Toast', description: null, location: null, owner: null });
    expect(f.componentInstance.editing()).toBe(false);
  });

  it('edits an existing item via PUT', async () => {
    const f = await setup([item(1)]);
    api.updateRundown.mockReturnValue(of(item(1)));
    f.componentInstance.startEdit(item(1));
    f.componentInstance.model.title = 'Changed';
    f.componentInstance.save(true);
    expect(api.updateRundown).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Changed' }));
  });
});
