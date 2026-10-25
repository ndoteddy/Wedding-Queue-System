using WeddingQueue.Api.Models;
using WeddingQueue.Api.Services;

namespace WeddingQueue.Api.Data;

public static class Seeder
{
    public static void Seed(AppDb db)
    {
        if (db.Guests.Any()) return;
        var people = new (string Name, string Email, string Phone, string Table, int Party)[]
        {
            ("Alice Johnson",   "alice.johnson@example.com",   "+1 555 0101", "1", 2),
            ("Bob Smith",       "bob.smith@example.com",       "+1 555 0102", "1", 1),
            ("Carla Gomez",     "carla.gomez@example.com",     "+1 555 0103", "2", 3),
            ("David Lee",       "david.lee@example.com",       "+1 555 0104", "2", 2),
            ("Elena Petrova",   "elena.petrova@example.com",   "+1 555 0105", "3", 1),
            ("Farid Rahman",    "farid.rahman@example.com",    "+1 555 0106", "3", 2),
            ("Grace Kim",       "grace.kim@example.com",       "+1 555 0107", "4", 4),
            ("Hiro Tanaka",     "hiro.tanaka@example.com",     "+1 555 0108", "4", 2),
            ("Isabella Rossi",  "isabella.rossi@example.com",  "+1 555 0109", "5", 1),
            ("James O'Connor",  "james.oconnor@example.com",   "+1 555 0110", "5", 2),
        };
        foreach (var p in people)
            db.Guests.Add(new Guest { Name = p.Name, Email = p.Email, Phone = p.Phone, Table = p.Table, PartySize = p.Party, Code = GuestService.NewCode() });
        db.SaveChanges();
    }
}

