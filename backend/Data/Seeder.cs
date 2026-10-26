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
            ("Agus Prasetyo",   "agus.prasetyo@example.com",   "+62 812 3456 0101", "1", 2),
            ("Budi Santoso",    "budi.santoso@example.com",    "+62 812 3456 0102", "1", 1),
            ("Citra Dewi",      "citra.dewi@example.com",      "+62 812 3456 0103", "2", 3),
            ("Dedi Kurniawan",  "dedi.kurniawan@example.com",  "+62 812 3456 0104", "2", 2),
            ("Eka Putri",       "eka.putri@example.com",       "+62 812 3456 0105", "3", 1),
            ("Fajar Pratama",   "fajar.pratama@example.com",   "+62 812 3456 0106", "3", 2),
            ("Gita Lestari",    "gita.lestari@example.com",    "+62 812 3456 0107", "4", 4),
            ("Hendra Wijaya",   "hendra.wijaya@example.com",   "+62 812 3456 0108", "4", 2),
            ("Indah Permata",   "indah.permata@example.com",   "+62 812 3456 0109", "5", 1),
            ("Joko Susilo",     "joko.susilo@example.com",     "+62 812 3456 0110", "5", 2),
        };
        foreach (var p in people)
            db.Guests.Add(new Guest { Name = p.Name, Email = p.Email, Phone = p.Phone, Table = p.Table, PartySize = p.Party, Code = GuestService.NewCode() });
        db.SaveChanges();
    }
}

