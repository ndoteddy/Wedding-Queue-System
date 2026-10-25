import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL, ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('posts a new guest', () => {
    const input = { name: 'A', email: 'a@b.co', phone: '1234567', table: null, partySize: 2 };
    api.create(input).subscribe();
    const req = http.expectOne(`${API_URL}/guests`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({});
  });

  it('posts the scanned code to check-in', () => {
    api.checkIn('abc').subscribe();
    const req = http.expectOne(`${API_URL}/checkin`);
    expect(req.request.body).toEqual({ code: 'abc' });
    req.flush({ status: 'ok' });
  });

  it('builds the QR url', () => {
    expect(api.qrUrl('abc')).toBe(`${API_URL}/qr/abc.png`);
  });

  it('calls resend / delete / stats endpoints', () => {
    api.resend(3).subscribe();
    expect(http.expectOne(`${API_URL}/guests/3/resend`).request.method).toBe('POST');
    api.remove(3).subscribe();
    expect(http.expectOne(`${API_URL}/guests/3`).request.method).toBe('DELETE');
    api.stats().subscribe();
    expect(http.expectOne(`${API_URL}/stats`).request.method).toBe('GET');
  });
});
