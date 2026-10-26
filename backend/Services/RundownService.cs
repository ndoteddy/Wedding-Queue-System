using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using WeddingQueue.Api.Data;
using WeddingQueue.Api.Models;

namespace WeddingQueue.Api.Services;

public static partial class RundownService
{
    [GeneratedRegex(@"^([01]\d|2[0-3]):[0-5]\d$")]
    private static partial Regex TimePattern();

    public static Dictionary<string, string[]> Validate(RundownInput i)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(i.Title)) errors["title"] = ["Title is required"];
        if (string.IsNullOrWhiteSpace(i.StartTime) || !TimePattern().IsMatch(i.StartTime))
            errors["startTime"] = ["Start time must be HH:mm (24h)"];
        if (i.DurationMinutes is < 1 or > 600) errors["durationMinutes"] = ["Duration must be 1–600 minutes"];
        return errors;
    }

    public static void Apply(RundownItem item, RundownInput i)
    {
        item.StartTime = i.StartTime;
        item.DurationMinutes = i.DurationMinutes ?? 15;
        item.Title = i.Title.Trim();
        item.Description = i.Description?.Trim();
        item.Location = i.Location?.Trim();
        item.Owner = i.Owner?.Trim();
    }

    /// <summary>Moves an item to a new status and stamps the start / finish times.</summary>
    public static bool SetStatus(RundownItem item, string status)
    {
        if (!RundownStatus.All.Contains(status)) return false;
        item.Status = status;
        switch (status)
        {
            case RundownStatus.Pending: item.StartedAt = null; item.CompletedAt = null; break;
            case RundownStatus.InProgress: item.StartedAt ??= DateTime.UtcNow; item.CompletedAt = null; break;
            case RundownStatus.Done: item.StartedAt ??= DateTime.UtcNow; item.CompletedAt = DateTime.UtcNow; break;
        }
        return true;
    }

    public static void Seed(AppDb db)
    {
        if (db.Rundown.Any()) return;
        var rows = new (string T, int Min, string Title, string Loc, string Owner, string Desc)[]
        {
            ("14:00", 60, "Guest arrival & welcome drinks", "Garden entrance", "Ushers", "QR check-in at the gate, welcome drink served"),
            ("15:00", 40, "Wedding ceremony", "Main lawn", "Officiant", "Vows and ring exchange"),
            ("15:45", 45, "Family & couple photos", "Rose garden", "Fotografer Rina", "Group shots, then couple portraits"),
            ("16:30", 60, "Cocktail hour", "Terrace", "Bar team", "Canapés and live acoustic guitar"),
            ("17:30", 15, "Grand entrance", "Ballroom", "MC Daniel", "Couple is announced into the hall"),
            ("17:45", 75, "Dinner service", "Ballroom", "Catering lead Omar", "Three courses, vegetarian options at tables 2 and 5"),
            ("19:00", 30, "Speeches & toasts", "Ballroom", "MC Daniel", "Best man, maid of honour, parents"),
            ("19:30", 15, "Cake cutting", "Ballroom", "Planner Sari", "Cake is wheeled out, photographer on stage"),
            ("19:45", 15, "First dance", "Dance floor", "DJ Marco", "Followed by parent dances"),
            ("20:00", 180, "Party & dancing", "Dance floor", "DJ Marco", "Open dance floor until the farewell"),
            ("23:00", 20, "Farewell & sparkler exit", "Front driveway", "Planner Sari", "Guests line the driveway with sparklers"),
        };
        foreach (var r in rows)
            db.Rundown.Add(new RundownItem { StartTime = r.T, DurationMinutes = r.Min, Title = r.Title, Location = r.Loc, Owner = r.Owner, Description = r.Desc });
        db.SaveChanges();
    }
}
