import { Component, DestroyRef, ElementRef, OnDestroy, inject, signal, viewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Html5Qrcode } from 'html5-qrcode';
import { ApiService, CheckInResult } from '../api.service';

const RESULT_MS = 6000;

@Component({
  selector: 'app-scanner',
  imports: [FormsModule],
  template: `
    @if (result(); as r) {
      <section class="welcome" [class.ok]="r.status === 'ok'" [class.already]="r.status === 'already'" [class.invalid]="r.status === 'invalid'" data-testid="result" [attr.data-status]="r.status">
        @switch (r.status) {
          @case ('ok') {
            <div class="emoji">🎉</div>
            <h1 data-testid="welcome">Welcome, {{ r.guest?.name }}!</h1>
            <p>Party of {{ r.guest?.partySize }} · Table {{ r.guest?.table ?? 'TBA' }}</p>
          }
          @case ('already') {
            <div class="emoji">👋</div>
            <h1 data-testid="welcome">Welcome back, {{ r.guest?.name }}</h1>
            <p>This QR code was already scanned.</p>
          }
          @default {
            <div class="emoji">❌</div>
            <h1 data-testid="welcome">QR code not recognised</h1>
            <p>Please see the host at the entrance.</p>
          }
        }
        <button class="btn ghost" (click)="clear()">Scan next guest</button>
      </section>
    }

    <section class="card scan" [class.hidden]="result()">
      <h1>Entrance scanner</h1>
      <div id="reader" #reader></div>
      @if (cameraError()) { <p class="error" data-testid="camera-error">{{ cameraError() }}</p> }
      <form (ngSubmit)="manual()" class="manual">
        <input name="code" [(ngModel)]="code" placeholder="…or type the code under the QR" data-testid="manual-code" autocomplete="off">
        <button class="btn" type="submit" data-testid="manual-submit">Check in</button>
      </form>
    </section>
  `,
  styles: `
    .scan { max-width: 520px; margin: 0 auto; text-align: center; }
    .hidden { display: none; }
    #reader { width: 100%; min-height: 40px; }
    .manual { display: flex; gap: .5rem; margin-top: 1rem; }
    .welcome { text-align: center; padding: 3rem 1rem; border-radius: 18px; color: #fff; }
    .welcome.ok { background: linear-gradient(135deg, #2f8f5b, #5cb88a); }
    .welcome.already { background: linear-gradient(135deg, #c27a1a, #e0a855); }
    .welcome.invalid { background: linear-gradient(135deg, #c0392b, #e26d5f); }
    .welcome h1 { font-size: 2.8rem; }
    .welcome p { font-size: 1.2rem; }
    .emoji { font-size: 4rem; }
    .welcome .btn { margin-top: 1rem; background: rgba(255,255,255,.2); color: #fff; border-color: #fff; }
  `,
})
export class Scanner implements AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);
  private reader = viewChild.required<ElementRef<HTMLElement>>('reader');

  result = signal<CheckInResult | null>(null);
  cameraError = signal('');
  code = '';

  private qr?: Html5Qrcode;
  private busy = false;
  private timer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit() {
    this.startCamera();
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
    const qr = this.qr;
    if (qr?.isScanning) qr.stop().then(() => qr.clear()).catch(() => {});
  }

  private async startCamera() {
    try {
      this.qr = new Html5Qrcode(this.reader().nativeElement.id);
      await this.qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        text => this.submit(text),
        () => {},
      );
    } catch {
      this.cameraError.set('Camera unavailable — type the code below instead.');
    }
  }

  manual() {
    if (this.code.trim()) this.submit(this.code);
  }

  submit(code: string) {
    if (this.busy) return;
    this.busy = true;
    this.api.checkIn(code).subscribe({
      next: r => this.show(r),
      error: (e: HttpErrorResponse) =>
        this.show(e.status === 404 && e.error?.status
          ? e.error
          : { status: 'invalid', message: 'Could not verify the code', guest: null }),
    });
  }

  private show(r: CheckInResult) {
    this.result.set(r);
    this.code = '';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.clear(), RESULT_MS);
  }

  clear() {
    clearTimeout(this.timer);
    this.result.set(null);
    this.busy = false;
  }
}
