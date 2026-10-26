# The Seal, the Question and the Gate: Building a Wedding Queue That Scans Itself

*A long-form walkthrough of a proof of concept in .NET 10 and Angular 22, told alongside the oldest problem in the world: who may enter, and how do we know?*

**October 25, 2026 · about a 35-minute read**

---

## Prologue: A Clay Tablet at the Gate

Around 1750 BC, in a city on the Euphrates, a clerk pressed a small stone cylinder into wet clay and rolled it across the surface. The cylinder was carved with a tiny scene in reverse. It left a crisp impression of gods, animals and a few lines of cuneiform. Everyone in the city knew that this pattern belonged to one man, and that no one else could have made it.

That is a **signature**, and it is a **token**. The clerk's seal said "this is really from me" without the clerk standing there. Mesopotamian archaeology has even older versions. Small clay tokens were sealed inside clay envelopes as records of goods owed, thousands of years before anyone wrote a letter. Humans have always needed to answer the same question at every gate, granary and temple door: *Is this person who they say they are, and are they allowed in?*

Four thousand years later, a wedding coordinator stands at the entrance of a hall with a clipboard. The question is unchanged. Only the technology is different.

This article is about building the modern answer to that question at small scale, as a **proof of concept**. We will build it together, step by step, in a .NET backend and an Angular frontend. Along the way we will stop at three philosophers' doors: the Babylonian clerk, who teaches us about *seals*, Socrates, who teaches us about *questions*, and the emperor Marcus Aurelius, who teaches us about *obstacles*. Each one maps to a real design decision in the code.

If you only want the code, skip to **Part 2**. If you want to know why the code looks the way it does, read from the start.

---

## Part 1: The 5 W's and the H (The Reporter's Brief)

Every reporter is taught to answer six questions. We will answer them before writing a single line, because a project that cannot answer them is not ready to be built.

**Who** is it for? Three people: the *guest*, who wants to arrive without friction; the *door staff*, who need an unambiguous answer in under two seconds; and the *host*, who wants to know how the evening is unfolding.

**What** is it? A system with four screens. One to add a guest, one to scan a code, one to watch the whole thing happen, and one for the wedding-day rundown (see the Interlude).

**When** does it act? The instant a guest is saved, an invitation with a personal QR code leaves by email and SMS. The instant the code is scanned at the door, the guest is greeted by name and counted.

**Where** does it run? On a small .NET API with a SQLite database, and an Angular single-page app in the browser. SQLite is chosen on purpose. For a demo it needs no server, and it can be deleted and recreated in a second.

**Why** build it? A clipboard is a database with no search, no backup and no live view. Names are misspelled, plus-ones go missing, and the line backs up while a finger runs down a list.

**How** will it work? Read on.

### The Philosophy Hiding in the Brief

Notice how many words in that brief are about *trust*. "Are they allowed in" is a question of trust. A QR code is, in the end, a clay seal for the smartphone era. It is a small, hard-to-forge token that stands in for a person who is not yet present. Hold on to that idea. We will come back to it.

---

## Part 2: Setting Up the Workshop

### What you need

- **.NET SDK 10** (`dotnet --version` should print 10.x)
- **Node.js 24** with npm, and the **Angular CLI 22**
- A code editor and a terminal

### The folder layout

We keep four siblings in one root folder:

```
Wedding queue System/
├── backend/        .NET 10 minimal API + SQLite
├── frontend/       Angular 22 app
├── backend.tests/  xUnit unit and API tests
└── e2e/            Playwright end-to-end tests
```

### Scaffolding the backend

```bash
dotnet new webapi -n WeddingQueue.Api -o backend --no-openapi
cd backend
dotnet add package Microsoft.EntityFrameworkCore.Sqlite
dotnet add package QRCoder
dotnet add package MailKit
```

Three packages do the real work. **EF Core with SQLite** stores the guests. **QRCoder** turns a string into a QR image. **MailKit** sends email.

### Scaffolding the frontend

```bash
ng new frontend --routing --style=css --skip-git --ssr=false --defaults
cd frontend
npm i html5-qrcode
```

`html5-qrcode` reads a QR code from the device camera in the browser.

---

## Part 3: The Seal. Modelling the Guest and the Secret

> *A seal is only worth something if no one else can carve it.*

### The guest

The heart of the data model is a single class.

```csharp
public class Guest
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Table { get; set; }
    public int PartySize { get; set; } = 1;
    /// <summary>Secret token encoded in the QR code.</summary>
    public string Code { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CheckedInAt { get; set; }
    public DateTime? InvitationSentAt { get; set; }
}
```

Read it as a story. A guest is *created*, an invitation is *sent*, and eventually the guest is *checked in*. Three nullable timestamps record those events. `CheckedInAt` being `null` means "not yet arrived". That is simpler and safer than a separate boolean that can disagree with a date.

### The lesson of the cylinder seal

The `Code` field is the Babylonian seal. The most important decision in the whole project is what goes inside it.

The tempting design puts the guest's *name* or *database ID* in the QR code. That is a bad design. IDs are sequential, so anyone could guess "guest 7" or "guest 8". A name is public information. We want the opposite, a token that is **meaningless to everyone except the system that issued it**, just like an impression of a seal is meaningless unless you can compare it with the owner.

So the code is random:

```csharp
public static string NewCode() =>
    Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
```

Eight bytes from the operating system's cryptographic generator, written as 16 lowercase hex characters, gives about 18 quintillion possibilities. Nobody is going to guess `3fa9c1d07b2e48aa` by trial and error. We also put a **unique index** on the column, so the database itself refuses a duplicate:

```csharp
b.Entity<Guest>().HasIndex(g => g.Code).IsUnique();
```

### The notification ledger

Babylonian scribes kept records of every transaction. We do the same for messages:

```csharp
public class NotificationLog
{
    public int Id { get; set; }
    public int GuestId { get; set; }
    public string Channel { get; set; } = "";   // email | sms
    public string Recipient { get; set; } = "";
    public string Status { get; set; } = "";    // sent | mock | failed
    public string? Detail { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

Every attempt to contact a guest leaves a row, successful or not. We will see in Part 5 why this matters.

### The ten mock guests

The request was for ten guests, each with an email and a phone number. A `Seeder` creates them on first run, and only if the table is empty, so running it twice does nothing the second time:

```csharp
public static void Seed(AppDb db)
{
    if (db.Guests.Any()) return;
    // ... ten (name, email, phone, table, party) tuples ...
    foreach (var p in people)
        db.Guests.Add(new Guest { Name = p.Name, Email = p.Email, Phone = p.Phone,
            Table = p.Table, PartySize = p.Party, Code = GuestService.NewCode() });
    db.SaveChanges();
}
```

Agus Prasetyo, Budi Santoso, Citra Dewi and seven others now exist, ready to be scanned.

---

## Part 4: Pressing the Clay. Turning a Secret into a QR Code

QR generation is a few lines, and it is worth keeping in its own tiny class, because it makes testing and replacement trivial.

```csharp
public static class QrService
{
    public static byte[] Png(string payload, int pixelsPerModule = 10)
    {
        using var gen = new QRCodeGenerator();
        using var data = gen.CreateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
        return new PngByteQRCode(data).GetGraphic(pixelsPerModule);
    }
}
```

The `ECCLevel.Q` argument sets the error correction level. QR codes carry redundancy, so a code that is scuffed, folded or half covered by a thumb can still be read. Level Q can survive roughly a quarter of the symbol being damaged. That is a sensible middle ground for codes that will be read from a cracked phone screen in a dim hall.

The same bytes serve two purposes: they are embedded in the email, and they are served by an HTTP endpoint so the dashboard (and the SMS link) can show the image.

---

## Part 5: The Question Socrates Would Ask. The Guest Service

> *"The unexamined life is not worth living,"* Socrates says in Plato's *Apology*. The unexamined input is not worth saving.

Socrates did not teach by giving answers. He asked questions until a false belief collapsed. A good validation layer does the same. It interrogates every piece of input before the system believes it.

### Validation as the Socratic method

```csharp
public static Dictionary<string, string[]> Validate(GuestInput i)
{
    var errors = new Dictionary<string, string[]>();
    if (string.IsNullOrWhiteSpace(i.Name)) errors["name"] = ["Name is required"];
    if (string.IsNullOrWhiteSpace(i.Email) || !MailAddress.TryCreate(i.Email, out _) || !i.Email.Contains('.'))
        errors["email"] = ["A valid email is required"];
    if (string.IsNullOrWhiteSpace(i.Phone) || i.Phone.Count(char.IsDigit) < 7)
        errors["phone"] = ["A valid phone number is required"];
    if (i.PartySize is < 1 or > 20) errors["partySize"] = ["Party size must be between 1 and 20"];
    return errors;
}
```

Each `if` is a question. *Is there a name? Is this really an email? Does this phone number contain enough digits to be one? Is a party of zero, or of ninety, plausible?* The function returns **all** the errors at once, not just the first, so the person at the form fixes everything in a single pass.

### Creation, and the sending that follows it

```csharp
public async Task<Guest> CreateAsync(GuestInput i)
{
    var g = new Guest { /* trimmed fields */ Code = NewCode() };
    db.Guests.Add(g);
    await db.SaveChangesAsync();   // 1. the guest exists, durably
    await SendInvitationAsync(g);  // 2. only then do we try to contact them
    return g;
}
```

Notice the order. **Save first, send second.** That ordering is a small piece of wisdom with a large consequence. Email servers fail. Phones are off. If the sending came first and threw an exception, we might lose the guest entirely. By saving first, a failed send leaves a guest who exists and an entry in the ledger marked `failed`. The host presses **Resend** later. The fault is recoverable because we separated the fact from the delivery.

```csharp
public async Task SendInvitationAsync(Guest g)
{
    var logs = await sender.SendAsync(g);
    foreach (var l in logs) db.Notifications.Add(l);
    if (logs.Any(l => l.Status != "failed")) g.InvitationSentAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
}
```

### Check-in: three honest answers

The check-in method is the gate itself, and it gives one of exactly three answers.

```csharp
public async Task<CheckInResult> CheckInAsync(string? code)
{
    code = code?.Trim();
    if (string.IsNullOrEmpty(code)) return new("invalid", "No code supplied", null);
    var g = await db.Guests.FirstOrDefaultAsync(x => x.Code == code);
    if (g is null) return new("invalid", "Unknown QR code", null);
    if (g.CheckedInAt is not null) return new("already", $"{g.Name} has already checked in", g);
    g.CheckedInAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return new("ok", $"Welcome, {g.Name}!", g);
}
```

`ok`, `already`, `invalid`. There is no fourth, ambiguous state. The `Trim()` call is quiet kindness: scanners and keyboards often add a stray space or newline, and a gate that rejects a real guest over whitespace is a bad gate.

The "already" answer deserves a moment of thought. A harsher design would reject a second scan as fraud. But at a real door, a guest scans twice because the first screen flickered, or hands the phone to their spouse. A welcoming "welcome back" is both friendlier and, for the host, just as informative.

---

## Part 6: The Messenger. Email, SMS and the Honest Mock

The messenger sits behind an interface, which is the most useful trick in this entire project:

```csharp
public interface IInvitationSender
{
    Task<List<NotificationLog>> SendAsync(Guest guest);
}
```

The rest of the program only knows "something that sends invitations". That means we can swap the real messenger for a fake in tests, and later swap SMS providers without touching the rest of the code.

### Email, with the QR inside it

The message is built with MailKit's `BodyBuilder`. The QR is attached as a *linked resource* with a content ID, so the email can show it inline with `<img src="cid:qr">`:

```csharp
var body = new BodyBuilder();
var img = body.LinkedResources.Add("qr.png", QrService.Png(g.Code));
img.ContentId = "qr";
body.HtmlBody = $"<h2>Hi {name},</h2><p>We can't wait to celebrate with you! " +
    $"Show this QR code at the entrance:</p><p><img src=\"cid:qr\" width=\"240\" height=\"240\"/></p>";
```

One quiet detail: the guest's name goes through `WebUtility.HtmlEncode` before it enters the HTML. A guest called `<script>` should be printed, not executed. This is another of Socrates' questions, asked of data we do not control: *what if this value is not what it claims to be?*

### The honest mock

With no SMTP host configured, the sender writes the finished message to disk instead:

```csharp
if (string.IsNullOrWhiteSpace(smtp.Host))
{
    var path = Path.Combine(dir, $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{g.Id}.eml");
    await msg.WriteToAsync(path);
    entry.Status = "mock"; entry.Detail = $"Saved to {path}";
}
else { /* connect, authenticate, send over SMTP */ entry.Status = "sent"; }
```

Double-click one of the `.eml` files in `backend/outbox/` and your mail client shows exactly what a guest would receive, QR included. Notice the status says `mock`, not `sent`. A system that claims to have sent an email it did not send is lying to its operator. The ledger tells the truth.

### SMS is a placeholder, and says so

SMS is the part we did **not** build for real. It logs the message and records a `mock` row. This is intentional and flagged in the article, in the README and in the ledger. A proof of concept is allowed to leave a seam, a clearly marked place for the next piece, as long as it does not pretend the seam is sewn.

---

## Part 7: The Gate. The HTTP API

Minimal APIs let us describe the whole surface in one readable file. Here are the shape and the key routes:

```csharp
var api = app.MapGroup("/api");

api.MapGet("/guests", ...);                  // list
api.MapPost("/guests", async (GuestInput input, GuestService svc) =>
{
    var errors = GuestService.Validate(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);   // 400
    var g = await svc.CreateAsync(input);
    return Results.Created($"/api/guests/{g.Id}", g);                 // 201
});
api.MapPost("/guests/{id:int}/resend", ...);
api.MapPost("/guests/{id:int}/reset-checkin", ...);
api.MapGet("/qr/{code}.png", ...);           // the image
api.MapPost("/checkin", async (CheckInRequest req, GuestService svc) =>
{
    var r = await svc.CheckInAsync(req.Code);
    return r.Status == "invalid" ? Results.Json(r, statusCode: 404) : Results.Ok(r);
});
api.MapGet("/stats", ...);                   // dashboard numbers
```

Three points are worth pausing on.

1. **Status codes tell the truth.** A bad request is 400. A creation is 201. An unknown code on check-in is 404, but the body still carries the same JSON shape, so the frontend can handle it uniformly.
2. **The QR endpoint only serves codes it knows.** Asking for `/api/qr/anything.png` returns 404, so the endpoint cannot be used to mint arbitrary images.
3. **CORS is explicit.** The browser app runs on port 4200 and the API on 5277. Rather than allowing every origin, the API allows only the configured origins. Open doors should be opened deliberately.

### Start-up in one place

```csharp
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    if (builder.Configuration.GetValue("SeedMockData", true)) Seeder.Seed(db);
}
```

`EnsureCreated` builds the SQLite file on first run, and `SeedMockData` is a switch, so tests can turn the mock guests off. The last line of the file, `public partial class Program;`, exposes the entry point so the test project can host the real application in memory.

Run it:

```bash
cd backend
dotnet run --urls http://localhost:5277
```

Visit `http://localhost:5277/api/guests` and you should see the ten guests as JSON.

---

## Part 8: The Face. Building the Angular Frontend

> *"You have power over your mind, not outside events. Realize this, and you will find strength."* A line in the spirit of Marcus Aurelius' *Meditations*, paraphrased.

Marcus Aurelius governed an empire and wrote private notes to himself about doing the work in front of him. One theme runs through the *Meditations*: you do not control the event, only your response to it. A frontend lives by the same rule. It does not control whether the network is up, the server is running or the camera is allowed. It controls what the user sees *when those things go wrong*. We will hold that thought through the next three screens.

### The shell and the routes

Angular 22 uses standalone components and zoneless change detection with signals, so no NgModules and no Zone.js. Routes are lazy-loaded, which keeps the first download small. The scanner library alone is about 377 kB, and only the Scanner page pays that cost:

```typescript
export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'Dashboard',
    loadComponent: () => import('./pages/dashboard').then(m => m.Dashboard) },
  { path: 'guests/new', title: 'Add guest',
    loadComponent: () => import('./pages/guest-form').then(m => m.GuestForm) },
  { path: 'scanner', title: 'Scanner',
    loadComponent: () => import('./pages/scanner').then(m => m.Scanner) },
  { path: '**', redirectTo: '' },
];
```

### One service to talk to the server

All HTTP lives in a single injectable. Components never build URLs:

```typescript
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  guests()  { return this.http.get<Guest[]>(`${API_URL}/guests`); }
  stats()   { return this.http.get<Stats>(`${API_URL}/stats`); }
  create(g: GuestInput) { return this.http.post<Guest>(`${API_URL}/guests`, g); }
  checkIn(code: string) { return this.http.post<CheckInResult>(`${API_URL}/checkin`, { code }); }
  qrUrl(code: string)   { return `${API_URL}/qr/${code}.png`; }
  // resend, remove, resetCheckin, notifications ...
}
```

One place to change when the API changes, and one thing to replace with a fake in tests.

---

## Part 9: Screen One. The Dashboard

The dashboard is the host's window onto the evening. It holds three signals (guests, stats, error) and refreshes them every three seconds:

```typescript
ngOnInit() {
  this.refresh();
  const t = setInterval(() => this.refresh(), 3000);
  this.destroyRef.onDestroy(() => clearInterval(t));
}

refresh() {
  forkJoin({ guests: this.api.guests(), stats: this.api.stats() }).subscribe({
    next: ({ guests, stats }) => { this.guests.set(guests); this.stats.set(stats); this.error.set(''); },
    error: () => this.error.set('Cannot reach the server. Is the backend running on port 5277?'),
  });
}
```

Here is Marcus's lesson in practice. The `error` callback is not an afterthought. When the server is unreachable, the dashboard tells the operator, in plain words, what is probably wrong and how to fix it. It does not go blank, and it does not throw a cryptic message into the console. The `destroyRef.onDestroy` line cleans up the timer when the user leaves the page, so we do not leak intervals that keep polling a page that no longer exists.

The template uses Angular's modern control flow. `@for` replaces `*ngFor`, and `@empty` handles the no-guests case:

```html
@for (g of guests(); track g.id) {
  <tr [attr.data-testid]="'row-' + g.id">
    <td>{{ g.name }} <small>×{{ g.partySize }}</small></td>
    ...
    <td>
      @if (g.checkedInAt) { <span class="badge ok">Arrived</span> }
      @else { <span class="badge wait">Waiting</span> }
    </td>
  </tr>
} @empty {
  <tr><td colspan="6">No guests yet.</td></tr>
}
```

The `data-testid` attributes are a gift to our future selves. We will use them in the end-to-end tests so that a harmless change of wording or colour cannot break a test.

The progress bar is a *computed* value that only recalculates when its inputs change:

```typescript
percent = computed(() => {
  const s = this.stats();
  return s && s.total ? Math.round((s.checkedIn / s.total) * 100) : 0;
});
```

The `s.total ?` guard matters. With zero guests, a naive division would produce `NaN`. Divide-by-zero is the sort of bug that appears only on the first day of a new event, with an empty list.

---

## Part 10: Screen Two. The Guest Form

This is where a person types, and so it is where the Socratic questions return, this time in the browser. Angular's template-driven forms give instant feedback:

```html
<input id="email" name="email" type="email" [(ngModel)]="model.email"
       required email #email="ngModel" data-testid="input-email">
@if (email.invalid && (email.touched || f.submitted)) {
  <div class="error">Enter a valid email</div>
}
```

The condition `touched || submitted` is a courtesy. We do not shout "invalid!" at a field the user has not yet visited, but we do once they have left it or pressed Save.

Validation happens **twice**: once in the browser for speed and kindness, and once on the server for safety. The browser can be bypassed, so the server must never trust it. The submit handler shows the server's own messages if it rejects the form:

```typescript
error: (e: HttpErrorResponse) => {
  this.saving.set(false);
  this.error.set(e.status === 400
    ? Object.values(e.error?.errors ?? {}).flat().join(' ')
    : 'Could not save the guest.');
},
```

On success, the page shows the guest's QR and the notification statuses (`email: mock`, `sms: mock`), and resets the form for the next guest. The operator can see, rather than assume, that the invitation went out.

---

## Part 11: Screen Three. The Scanner and the Welcome

> *What stands in the way becomes the way.* Marcus, paraphrased from the *Meditations*, on turning an obstacle into the work.

The scanner is the screen where the project meets reality: a real person, a real phone, a real crowd. It is also the screen with the most things that can go wrong. Camera permission may be denied. The browser may refuse the camera on an insecure page. The light may be poor. The guest may be holding up a code from a different wedding.

The design response to every one of those obstacles is the same, to turn it into a clear screen.

### The camera, with a way out

```typescript
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
```

If the camera fails, the page does not die. It says so and offers the keyboard. The typed code travels the same path as a scanned code, so there is only one check-in code path to trust.

### One scan at a time

A camera sees the same QR code ten times a second. Without protection, one guest would trigger ten check-in requests. A single boolean prevents that:

```typescript
submit(code: string) {
  if (this.busy) return;       // a result is already on screen: ignore the camera
  this.busy = true;
  this.api.checkIn(code).subscribe({
    next: r => this.show(r),
    error: (e: HttpErrorResponse) => this.show(
      e.status === 404 && e.error?.status
        ? e.error
        : { status: 'invalid', message: 'Could not verify the code', guest: null }),
  });
}
```

The result stays on screen for six seconds, or until staff tap **Scan next guest**, and then `busy` resets.

### The welcome

The reason the entire project exists is a single `@switch`:

```html
@switch (r.status) {
  @case ('ok') {
    <h1 data-testid="welcome">Welcome, {{ r.guest?.name }}!</h1>
    <p>Party of {{ r.guest?.partySize }} · Table {{ r.guest?.table ?? 'TBA' }}</p>
  }
  @case ('already') { <h1>Welcome back, {{ r.guest?.name }}</h1> }
  @default          { <h1>QR code not recognised</h1> }
}
```

Green, amber and red, each with a plain sentence. At a busy door, a person should have to read, at most, a name.

Notice the `?? 'TBA'` for the table. If a guest has no table assigned, the screen says "Table TBA" instead of "Table null". The edge case is handled at the point of display.

---

## Interlude: The Order of the Day. A Second Feature, Same Database

> *"Let the day's work be arranged before the day begins,"* is the spirit of Marcus Aurelius' morning notes to himself. He rehearsed what the hours would demand before they arrived.

Check-in answers *who is here*. A wedding has a second, equally old question: *what happens next?* Every Babylonian temple kept a calendar of rites and offerings, because a ceremony performed late, or by the wrong person, is a ceremony spoiled. Modern wedding planners call the same thing the **rundown**, or run-of-show: a minute-by-minute plan with a named owner for every moment.

So we added it as a second feature, in the same SQLite file and the same architecture. This is also a useful test of the design. If the first feature was built well, the second should cost much less.

### The model

```csharp
public class RundownItem
{
    public int Id { get; set; }
    public string StartTime { get; set; } = "";     // "HH:mm", sorts correctly as text
    public int DurationMinutes { get; set; } = 15;
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string? Location { get; set; }
    public string? Owner { get; set; }               // "DJ Marco", "Planner Sara"
    public string Status { get; set; } = "pending";  // pending | inprogress | done
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}
```

Two small decisions are worth a sentence each. The start time is stored as `"HH:mm"` text, because a wedding day is a clock-face concept with no time zone or date, and 24-hour text sorts correctly with a plain `ORDER BY`. And `StartedAt` and `CompletedAt` record when things *actually* happened, which makes a later comparison of plan against reality possible.

### The same pattern, applied again

The validation follows the Socratic pattern from Part 5. A regular expression asks, "is this really a 24-hour time?", so `9:00`, `24:00` and `12:60` are all rejected. The status endpoint refuses anything but the three known states. Status changes go through one small function that stamps the right timestamps:

```csharp
case RundownStatus.InProgress: item.StartedAt ??= DateTime.UtcNow; item.CompletedAt = null; break;
case RundownStatus.Done:       item.StartedAt ??= DateTime.UtcNow; item.CompletedAt = DateTime.UtcNow; break;
case RundownStatus.Pending:    item.StartedAt = null; item.CompletedAt = null; break;
```

Resetting an item to *pending* clears both stamps, so the record never claims something that has been undone.

The endpoints are the same shape as the guest ones: `GET`/`POST /api/rundown`, `PUT`/`DELETE /api/rundown/{id}` and `POST /api/rundown/{id}/status`. The sample data is an 11-item day, from "Guest arrival & welcome drinks" at 14:00 to the "Farewell & sparkler exit" at 23:00.

### The page

The Angular page reuses the `ApiService`, the signals style and the `data-testid` habit. It shows a timeline of cards, an overall progress bar, a green **Now** banner for the item in progress and an amber **Up next** banner for the first pending one. Those two banners are `computed` signals, derived from the list rather than stored, so they can never disagree with it:

```typescript
current = computed(() => this.items().find(i => i.status === 'inprogress') ?? null);
next    = computed(() => this.items().find(i => i.status === 'pending') ?? null);
```

End times are calculated, not stored: `endTime('23:30', 60)` gives `00:30`, wrapping past midnight, and a unit test pins that down.

### A bug the end-to-end test found

The first end-to-end run of the new page failed with "expected at least 11 items, received 1". The cause was a real user-facing flaw, not a test mistake. Before the data arrived, the page rendered its "No items yet" message, so for a moment the user saw a lie. The fix was a `loaded` signal that shows the empty message only after the first response. A unit test would not have caught it, because the unit test supplies data synchronously. This is the argument for testing in a real browser against a real server.

The second feature added **13 backend tests, 8 frontend tests and 6 end-to-end tests**.

---

## Part 12: The Weighing of the Heart. Testing at Three Levels

The ancient Egyptians weighed the heart against a feather. Babylonian merchants used standard weights, carved in stone and kept in the temple, because without them no trade could be trusted. Testing is the standard weight of software. It is how we know that what we built weighs what we say it does.

We test at three levels because each answers a different question.

| Level | Question it answers | Count | Speed |
|---|---|---|---|
| Unit | Does each piece behave correctly by itself? | 38 backend + 24 frontend | milliseconds |
| Integration | Do the pieces work together? | included in the 25 | seconds |
| End-to-end | Does the whole thing work for a person? | 15 | about 20 seconds |

### Backend: the fake messenger

Because we put the sender behind an interface, the tests swap in a fake that records what it was asked to send and can be told to fail:

```csharp
public class FakeSender : IInvitationSender
{
    public List<Guest> Sent { get; } = [];
    public bool Fail { get; set; }
    public Task<List<NotificationLog>> SendAsync(Guest g) { /* record, return sent|failed */ }
}
```

With it, the important behaviours become simple, readable tests:

```csharp
[Fact]
public async Task Create_WhenSendingFails_KeepsGuestButNoSentTimestamp()
{
    _sender.Fail = true;
    var g = await _svc.CreateAsync(Valid());
    Assert.Null(g.InvitationSentAt);
    Assert.Equal(1, await _db.Guests.CountAsync());   // the guest was not lost
}

[Fact]
public async Task CheckIn_FirstScanOk_SecondScanAlready() { /* ... */ }
```

That first test is the "save first, send second" decision from Part 5, written down as a rule the computer enforces forever.

The API tests host the real application using `WebApplicationFactory`, pointed at a throwaway SQLite file, with the fake sender and seeding switched off. They exercise real HTTP: the 400 on bad input, the 201 on creation, the PNG content type on the QR route, and the complete ok → already → invalid flow on check-in.

### Frontend: Vitest and the mocked camera

Angular 22 runs unit tests on Vitest. The scanner test replaces `html5-qrcode` with a stub whose camera always fails to start, so the test can verify the fallback message:

```typescript
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false;
    start() { return Promise.reject(new Error('no camera')); }
    stop() { return Promise.resolve(); }
    clear() {}
  },
}));
```

One test proves the "one scan at a time" rule. Two `submit` calls are made back to back, and the test asserts that the API was called exactly once. After `clear()`, a third call succeeds.

> **A small war story.** While writing the form tests, three tests failed on the first run. The cause was not the form but the test. Angular's template-driven controls register themselves asynchronously. Our test clicked Save before `ngModel` had registered, so the form briefly looked valid. The fix was one line: `await fixture.whenStable()` after the first render. A test that fails for the wrong reason is still teaching you something about the framework.

### End-to-end: Playwright and the real journey

The end-to-end tests start the real API (against a freshly deleted and reseeded database) and the real Angular dev server, then drive Chromium. The capstone test follows one guest through the entire story:

```typescript
test('full journey: add guest → scan → dashboard shows arrival', async ({ page }) => {
  await page.goto('/guests/new');
  await page.getByTestId('input-name').fill('Journey Guest');
  await page.getByTestId('input-email').fill('journey@example.com');
  await page.getByTestId('input-phone').fill('+1 555 1212');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('success')).toBeVisible();

  // open the dashboard, read the guest's code from the QR dialog, close it
  // go to the scanner, type the code, press Check in
  await expect(page.getByTestId('welcome')).toHaveText('Welcome, Journey Guest!');

  await page.getByTestId('nav-dashboard').click();
  await expect(page.locator('tr', { hasText: 'Journey Guest' })).toContainText('Arrived');
});
```

If this test is green, the promise of the whole project is kept. A guest was added, the invitation was recorded, the code worked at the gate, and the host's dashboard agreed.

> **Another small war story.** The first full run failed 8 passed, 1 failed. The failing line was a click on the Scanner link that "was intercepted by `<div class="modal">`". The application was right and the test was wrong. The test had left the QR dialog open, and the dialog (correctly) covered the navigation. The fix was to click **Close** first. The most useful kind of failure is one that shows the software behaving exactly as designed.

Run everything:

```bash
dotnet test backend.tests                    # 38 passed
cd frontend && npx ng test --watch=false     # 24 passed
cd e2e && npx playwright test                # 15 passed
```

---

## Part 13: What We Did Not Build, and Why It Matters to Say So

Socrates' defining claim was not that he knew everything, but that he knew the *edges of what he knew*. In the *Apology*, he explains that his wisdom is only this: he does not think he knows what he does not know. A proof of concept should show the same honesty about its edges.

- **SMS is mocked.** Nothing leaves the building. A provider such as Twilio would slot into the `Sms` method in `InvitationSender.cs`, and the ledger already has a place for the result.
- **There is no login.** Anyone who can reach the API can read the guest list or check someone in. Before any real use, staff and planners need authentication, and the scanner endpoint needs to be protected from the public.
- **The dashboard polls, it is not pushed.** A three-second poll is simple and robust. A larger event, or a wall display that must feel instant, would use SignalR or server-sent events.
- **The camera needs HTTPS.** Browsers expose the camera only on `localhost` or over a secure connection. A phone at the door means serving the app with a certificate.
- **One event only.** There are no multiple weddings, no guest groups, and no spreadsheet import. The rundown is also a single plan, with no drag-to-reorder and no alerts when the day runs late.
- **No offline mode.** If the venue's Wi-Fi drops, scanning stops. A production version would queue scans locally and sync later.
- **`EnsureCreated` is a demo tool.** Real deployments should use EF Core migrations.

None of these changes the central design. They are the ordinary work of turning a demonstration into a service. Naming them is how we avoid selling the demonstration as the service.

---

## Part 14: Taking It Further. A Roadmap

If you wish to continue the build yourself, here is a sensible order.

1. **Real SMS.** Add a provider behind a small interface, in the same pattern as `IInvitationSender`, and record every attempt in `NotificationLog`.
2. **Authentication.** Add a staff login (ASP.NET Core Identity or an external identity provider) and require it for the dashboard and check-in endpoints. Keep the QR image endpoint public.
3. **HTTPS hosting.** Deploy the API and the built Angular app (`ng build`) behind a certificate so the phone camera works at the door.
4. **Move to a server database.** Swap SQLite for PostgreSQL or SQL Server, and replace `EnsureCreated` with migrations.
5. **Push updates.** Replace the three-second poll with SignalR for an instant dashboard.
6. **Offline-first scanning.** Queue scans in the browser's storage and sync on reconnect.
7. **Bulk import.** Let the planner upload a CSV of guests and send all invitations in one go.
8. **Signed codes.** If you ever want codes to be verifiable without a database lookup, sign them (for example with an HMAC) the way a seal is verifiable against its owner.

---

## Epilogue: Three Gates, One Lesson

Return to the clerk on the Euphrates. His cylinder seal is a good piece of technology, but it is not his real achievement. His real achievement is the *shared agreement*: a city of people who all accept that this pattern means this man. Technology only works when there is such an agreement behind it.

In our project the agreement is quieter. The guest accepts that the code on their phone means them. The host accepts that the screen tells the truth. The system keeps its side by being honest at every step: it marks mock messages as mock, it logs failures, it returns three clear answers at the gate, and it says in plain words when the server cannot be reached.

- The **seal** taught us that identity needs a secret only the issuer can recognise.
- **Socrates** taught us to question every input and to be honest about the edges of what we know.
- **Marcus Aurelius** taught us that we do not control the event, only our response to it, and that a good interface is mostly good responses to bad moments.

A wedding is a day when two families stand at a threshold, and the least a gate can do is let the right people through without fuss. The oldest technology in the world was built for exactly that. We have simply pressed it onto a phone.

---

### Appendix: Quick Start

```bash
# 1. Backend (terminal 1)
cd backend
dotnet run --urls http://localhost:5277

# 2. Frontend (terminal 2)
cd frontend
npm start                      # http://localhost:4200

# 3. Try it
#    - Open the dashboard: ten mock guests are already there
#    - Add a guest on /guests/new, then open backend/outbox/*.eml to see the email
#    - Open /scanner, scan the QR (or type the code from the dashboard's QR dialog)
#    - Watch the dashboard mark the guest as Arrived

# 4. Tests
dotnet test backend.tests
cd frontend && npx ng test --watch=false
cd e2e && npx playwright test
```

### Appendix: Sources of the Philosophical Material

The quotations from Socrates and Marcus Aurelius are paraphrases of widely translated passages (Plato's *Apology*; Marcus Aurelius' *Meditations*, notably Books 5 and 10). Translations differ, so check a translation you trust before citing them. The account of Mesopotamian cylinder seals and clay tokens reflects the standard archaeological picture of how early administration worked. The date and the city in the prologue are illustrative, not a record of one particular tablet.

