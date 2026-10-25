using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using WeddingQueue.Api.Data;
using WeddingQueue.Api.Models;

namespace WeddingQueue.Api.Services;

public class GuestService(AppDb db, IInvitationSender sender)
{
    public static string NewCode() => Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();

    public static Dictionary<string, string[]> Validate(GuestInput i)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(i.Name)) errors["name"] = ["Name is required"];
        if (string.IsNullOrWhiteSpace(i.Email) || !System.Net.Mail.MailAddress.TryCreate(i.Email, out _) || !i.Email.Contains('.'))
            errors["email"] = ["A valid email is required"];
        if (string.IsNullOrWhiteSpace(i.Phone) || i.Phone.Count(char.IsDigit) < 7)
            errors["phone"] = ["A valid phone number is required"];
        if (i.PartySize is < 1 or > 20) errors["partySize"] = ["Party size must be between 1 and 20"];
        return errors;
    }

    /// <summary>Creates the guest and immediately sends the QR invitation by email and SMS.</summary>
    public async Task<Guest> CreateAsync(GuestInput i)
    {
        var g = new Guest
        {
            Name = i.Name.Trim(), Email = i.Email.Trim(), Phone = i.Phone.Trim(),
            Table = i.Table?.Trim(), PartySize = i.PartySize ?? 1, Code = NewCode(),
        };
        db.Guests.Add(g);
        await db.SaveChangesAsync();
        await SendInvitationAsync(g);
        return g;
    }

    public async Task SendInvitationAsync(Guest g)
    {
        var logs = await sender.SendAsync(g);
        foreach (var l in logs) db.Notifications.Add(l);
        if (logs.Any(l => l.Status != "failed")) g.InvitationSentAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

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

    public async Task<Stats> StatsAsync()
    {
        var all = await db.Guests.AsNoTracking().ToListAsync();
        var arrived = all.Where(g => g.CheckedInAt != null).ToList();
        return new(all.Count, arrived.Count, all.Count - arrived.Count,
            all.Sum(g => g.PartySize), arrived.Sum(g => g.PartySize),
            arrived.OrderByDescending(g => g.CheckedInAt).Take(10).ToList());
    }
}
