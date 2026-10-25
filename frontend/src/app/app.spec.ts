import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it('renders navigation to the four pages', async () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
    const f = TestBed.createComponent(App);
    await f.whenStable();
    const links = Array.from((f.nativeElement as HTMLElement).querySelectorAll('nav a')).map(a => a.textContent?.trim());
    expect(links).toEqual(['Dashboard', 'Add guest', 'Rundown', 'Scanner']);
  });
});

