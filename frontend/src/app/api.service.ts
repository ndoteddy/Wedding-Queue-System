import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export const API_URL = 'http://localhost:5277/api';

export interface Guest {
  id: number;
  name: string;
  email: string;
  phone: string;
  table: string | null;
  partySize: number;
  code: string;
  createdAt: string;
  checkedInAt: string | null;
  invitationSentAt: string | null;
}
export interface GuestInput {
  name: string;
  email: string;
  phone: string;
  table: string | null;
  partySize: number;
}
export interface Stats {
  total: number;
  checkedIn: number;
  pending: number;
  expectedPeople: number;
  arrivedPeople: number;
  recent: Guest[];
}
export interface CheckInResult {
  status: 'ok' | 'already' | 'invalid';
  message: string;
  guest: Guest | null;
}
export interface NotificationLog {
  id: number;
  channel: string;
  recipient: string;
  status: string;
  detail: string | null;
}

export type RundownStatus = 'pending' | 'inprogress' | 'done';
export interface RundownItem {
  id: number;
  startTime: string;
  durationMinutes: number;
  title: string;
  description: string | null;
  location: string | null;
  owner: string | null;
  status: RundownStatus;
  startedAt: string | null;
  completedAt: string | null;
}
export interface RundownInput {
  startTime: string;
  durationMinutes: number;
  title: string;
  description: string | null;
  location: string | null;
  owner: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  guests(): Observable<Guest[]> { return this.http.get<Guest[]>(`${API_URL}/guests`); }
  stats(): Observable<Stats> { return this.http.get<Stats>(`${API_URL}/stats`); }
  create(g: GuestInput): Observable<Guest> { return this.http.post<Guest>(`${API_URL}/guests`, g); }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${API_URL}/guests/${id}`); }
  resend(id: number): Observable<Guest> { return this.http.post<Guest>(`${API_URL}/guests/${id}/resend`, {}); }
  resetCheckin(id: number): Observable<Guest> { return this.http.post<Guest>(`${API_URL}/guests/${id}/reset-checkin`, {}); }
  notifications(id: number): Observable<NotificationLog[]> { return this.http.get<NotificationLog[]>(`${API_URL}/guests/${id}/notifications`); }
  checkIn(code: string): Observable<CheckInResult> { return this.http.post<CheckInResult>(`${API_URL}/checkin`, { code }); }
  qrUrl(code: string): string { return `${API_URL}/qr/${code}.png`; }

  rundown(): Observable<RundownItem[]> { return this.http.get<RundownItem[]>(`${API_URL}/rundown`); }
  addRundown(i: RundownInput): Observable<RundownItem> { return this.http.post<RundownItem>(`${API_URL}/rundown`, i); }
  updateRundown(id: number, i: RundownInput): Observable<RundownItem> { return this.http.put<RundownItem>(`${API_URL}/rundown/${id}`, i); }
  setRundownStatus(id: number, status: RundownStatus): Observable<RundownItem> { return this.http.post<RundownItem>(`${API_URL}/rundown/${id}/status`, { status }); }
  removeRundown(id: number): Observable<void> { return this.http.delete<void>(`${API_URL}/rundown/${id}`); }
}

