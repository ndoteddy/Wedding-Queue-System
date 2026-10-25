using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using WeddingQueue.Api.Models;
using WeddingQueue.Api.Services;

namespace WeddingQueue.Api.Tests;

public class FakeSender : IInvitationSender
{
    public List<Guest> Sent { get; } = [];
    public bool Fail { get; set; }
    public Task<List<NotificationLog>> SendAsync(Guest g)
    {
        Sent.Add(g);
        var status = Fail ? "failed" : "sent";
        return Task.FromResult(new List<NotificationLog>
        {
            new() { GuestId = g.Id, Channel = "email", Recipient = g.Email, Status = status },
            new() { GuestId = g.Id, Channel = "sms", Recipient = g.Phone, Status = status },
        });
    }
}

/// <summary>Hosts the real API on a throwaway SQLite file with a fake sender.</summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"wq-{Guid.NewGuid():N}.db");
    public FakeSender Sender { get; } = new();
    public bool Seed { get; init; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbFile};Pooling=False");
        builder.UseSetting("SeedMockData", Seed ? "true" : "false");
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<IInvitationSender>();
            s.AddSingleton<IInvitationSender>(Sender);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { File.Delete(_dbFile); } catch { /* best effort */ }
    }
}
