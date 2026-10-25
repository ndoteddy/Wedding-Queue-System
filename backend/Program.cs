using Microsoft.EntityFrameworkCore;
using WeddingQueue.Api.Data;
using WeddingQueue.Api.Models;
using WeddingQueue.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=wedding.db"));
builder.Services.AddSingleton(builder.Configuration.GetSection("Smtp").Get<SmtpOptions>() ?? new SmtpOptions());
builder.Services.AddScoped<IInvitationSender, InvitationSender>();
builder.Services.AddScoped<GuestService>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:4200"])
     .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    if (builder.Configuration.GetValue("SeedMockData", true)) { Seeder.Seed(db); RundownService.Seed(db); }
}

app.UseCors();

var api = app.MapGroup("/api");

api.MapGet("/guests", async (AppDb db) =>
    await db.Guests.AsNoTracking().OrderBy(g => g.Name).ToListAsync());

api.MapGet("/guests/{id:int}", async (int id, AppDb db) =>
    await db.Guests.FindAsync(id) is { } g ? Results.Ok(g) : Results.NotFound());

api.MapPost("/guests", async (GuestInput input, GuestService svc) =>
{
    var errors = GuestService.Validate(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var g = await svc.CreateAsync(input);
    return Results.Created($"/api/guests/{g.Id}", g);
});

api.MapPut("/guests/{id:int}", async (int id, GuestInput input, AppDb db) =>
{
    var errors = GuestService.Validate(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var g = await db.Guests.FindAsync(id);
    if (g is null) return Results.NotFound();
    g.Name = input.Name.Trim(); g.Email = input.Email.Trim(); g.Phone = input.Phone.Trim();
    g.Table = input.Table?.Trim(); g.PartySize = input.PartySize ?? 1;
    await db.SaveChangesAsync();
    return Results.Ok(g);
});

api.MapDelete("/guests/{id:int}", async (int id, AppDb db) =>
{
    var g = await db.Guests.FindAsync(id);
    if (g is null) return Results.NotFound();
    db.Guests.Remove(g);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

api.MapPost("/guests/{id:int}/resend", async (int id, AppDb db, GuestService svc) =>
{
    var g = await db.Guests.FindAsync(id);
    if (g is null) return Results.NotFound();
    await svc.SendInvitationAsync(g);
    return Results.Ok(g);
});

api.MapPost("/guests/{id:int}/reset-checkin", async (int id, AppDb db) =>
{
    var g = await db.Guests.FindAsync(id);
    if (g is null) return Results.NotFound();
    g.CheckedInAt = null;
    await db.SaveChangesAsync();
    return Results.Ok(g);
});

api.MapGet("/guests/{id:int}/notifications", async (int id, AppDb db) =>
    await db.Notifications.AsNoTracking().Where(n => n.GuestId == id).OrderByDescending(n => n.Id).ToListAsync());

api.MapGet("/qr/{code}.png", async (string code, AppDb db) =>
    await db.Guests.AnyAsync(g => g.Code == code)
        ? Results.File(QrService.Png(code), "image/png")
        : Results.NotFound());

api.MapPost("/checkin", async (CheckInRequest req, GuestService svc) =>
{
    var r = await svc.CheckInAsync(req.Code);
    return r.Status == "invalid" ? Results.Json(r, statusCode: 404) : Results.Ok(r);
});

api.MapGet("/stats", async (GuestService svc) => await svc.StatsAsync());

// ---- Run-of-show (rundown) ----
api.MapGet("/rundown", async (AppDb db) =>
    await db.Rundown.AsNoTracking().OrderBy(r => r.StartTime).ThenBy(r => r.Id).ToListAsync());

api.MapPost("/rundown", async (RundownInput input, AppDb db) =>
{
    var errors = RundownService.Validate(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var item = new RundownItem();
    RundownService.Apply(item, input);
    db.Rundown.Add(item);
    await db.SaveChangesAsync();
    return Results.Created($"/api/rundown/{item.Id}", item);
});

api.MapPut("/rundown/{id:int}", async (int id, RundownInput input, AppDb db) =>
{
    var errors = RundownService.Validate(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var item = await db.Rundown.FindAsync(id);
    if (item is null) return Results.NotFound();
    RundownService.Apply(item, input);
    await db.SaveChangesAsync();
    return Results.Ok(item);
});

api.MapPost("/rundown/{id:int}/status", async (int id, StatusRequest req, AppDb db) =>
{
    var item = await db.Rundown.FindAsync(id);
    if (item is null) return Results.NotFound();
    if (!RundownService.SetStatus(item, req.Status))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["Status must be pending, inprogress or done"] });
    await db.SaveChangesAsync();
    return Results.Ok(item);
});

api.MapDelete("/rundown/{id:int}", async (int id, AppDb db) =>
{
    var item = await db.Rundown.FindAsync(id);
    if (item is null) return Results.NotFound();
    db.Rundown.Remove(item);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.Run();

public partial class Program;

