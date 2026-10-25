using Microsoft.EntityFrameworkCore;
using WeddingQueue.Api.Models;

namespace WeddingQueue.Api.Data;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Guest> Guests => Set<Guest>();
    public DbSet<NotificationLog> Notifications => Set<NotificationLog>();
    public DbSet<RundownItem> Rundown => Set<RundownItem>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Guest>().HasIndex(g => g.Code).IsUnique();
        b.Entity<Guest>().HasIndex(g => g.Email);
    }
}

