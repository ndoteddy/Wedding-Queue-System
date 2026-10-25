# Wedding Queue System

Guests get a personal QR code by email + SMS the moment they are added. At the entrance, staff scan the QR and the screen greets the guest by name; the dashboard updates live.

## Screenshots

| Dashboard | Rundown | Scanner |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Rundown](docs/screenshots/rundown.png) | ![Scanner](docs/screenshots/scanner.png) |

- **Dashboard** — live stats, guest list and arrivals.
- **Rundown** — the wedding-day schedule with Now / Up next.
- **Scanner** — the welcome screen shown after a successful QR check-in.

| Folder | What |
|---|---|
| `backend/` | .NET 10 minimal API, EF Core + SQLite (`wedding.db`, auto-created, seeded with 10 mock guests) |
| `frontend/` | Angular 22: Dashboard `/`, Add guest `/guests/new`, Rundown `/rundown`, Scanner `/scanner` |
| `backend.tests/` | xUnit unit + API integration tests |
| `e2e/` | Playwright end-to-end tests |

## Run
```
cd backend  && dotnet run --urls http://localhost:5277
cd frontend && npm start          # http://localhost:4200
```

## Rundown (run-of-show)
A second feature stored in the same SQLite file (`RundownItems` table): the wedding-day schedule with start time, duration, location, owner and notes, seeded with an 11-item sample day. On `/rundown` the team can add / edit / delete items and mark each one **Start ? Done**; the page shows overall progress plus "Now" and "Up next". API: `GET/POST /api/rundown`, `PUT/DELETE /api/rundown/{id}`, `POST /api/rundown/{id}/status`.

> The schema is created with `EnsureCreated` — if you ran an earlier version, delete `backend/wedding.db` once so the new table is created.

## Email / SMS
- **Email**: with no `Smtp:Host` configured (demo), the message with the inline QR is saved as `.eml` in `backend/outbox/` (open with any mail client). Set `Smtp` in `appsettings.json` (Host, Port, User, Password, From, UseSsl) to send for real.
- **SMS**: mocked (logged + recorded in the notifications table). Implement a real provider such as Twilio in `Services/InvitationSender.cs`.
- Set `PublicBaseUrl` to the public API address so the SMS link works from phones.

## Scanner
Uses the device camera (needs `localhost` or HTTPS). If there's no camera you can type the code (shown under the QR in the dashboard's QR dialog).

## Tests
```
dotnet test backend.tests            # 38 tests
cd frontend && npx ng test --watch=false   # 24 tests
cd e2e && npx playwright test        # 15 tests; starts both servers with a fresh DB
```

