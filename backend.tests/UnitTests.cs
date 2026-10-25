using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WeddingQueue.Api.Data;
using WeddingQueue.Api.Models;
using WeddingQueue.Api.Services;

namespace WeddingQueue.Api.Tests;

public class UnitTests : IDisposable
{
    readonly SqliteConnection _conn = new("Data Source=:memory:");
    readonly AppDb _db;
    readonly FakeSender _sender = new();
    readonly GuestService _svc;

    public UnitTests()
    {
        _conn.Open();
        _db = new AppDb(new DbContextOptionsBuilder<AppDb>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _svc = new GuestService(_db, _sender);
    }
    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    static GuestInput Valid(string name = "Jane Doe") => new(name, "jane@example.com", "+1 555 0100", "7", 2);

    [Fact]
    public void QrService_ReturnsPng()
    {
        var png = QrService.Png("abc123");
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47 }, png.Take(4).ToArray());
    }

    [Fact]
    public void NewCode_IsUniqueHex16()
    {
        var codes = Enumerable.Range(0, 200).Select(_ => GuestService.NewCode()).ToList();
        Assert.Equal(200, codes.Distinct().Count());
        Assert.All(codes, c => Assert.Matches("^[0-9a-f]{16}$", c));
    }

    [Fact] public void Validate_AcceptsValid() => Assert.Empty(GuestService.Validate(Valid()));

    [Theory]
    [InlineData("", "a@b.com", "+1 555 0100", 1, "name")]
    [InlineData("A", "not-an-email", "+1 555 0100", 1, "email")]
    [InlineData("A", "", "+1 555 0100", 1, "email")]
    [InlineData("A", "a@b.com", "12", 1, "phone")]
    [InlineData("A", "a@b.com", "+1 555 0100", 0, "partySize")]
    [InlineData("A", "a@b.com", "+1 555 0100", 99, "partySize")]
    public void Validate_RejectsBadInput(string name, string email, string phone, int party, string field)
        => Assert.Contains(field, GuestService.Validate(new(name, email, phone, null, party)).Keys);

    [Fact]
    public async Task Create_PersistsGeneratesCodeAndSendsInvitation()
    {
        var g = await _svc.CreateAsync(Valid());
        Assert.True(g.Id > 0);
        Assert.Equal(16, g.Code.Length);
        Assert.Single(_sender.Sent);
        Assert.NotNull(g.InvitationSentAt);
        Assert.Equal(2, await _db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Create_WhenSendingFails_KeepsGuestButNoSentTimestamp()
    {
        _sender.Fail = true;
        var g = await _svc.CreateAsync(Valid());
        Assert.Null(g.InvitationSentAt);
        Assert.Equal(1, await _db.Guests.CountAsync());
    }

    [Fact]
    public async Task CheckIn_FirstScanOk_SecondScanAlready()
    {
        var g = await _svc.CreateAsync(Valid());
        var first = await _svc.CheckInAsync(g.Code);
        Assert.Equal("ok", first.Status);
        Assert.Contains("Welcome, Jane Doe", first.Message);
        var second = await _svc.CheckInAsync(g.Code);
        Assert.Equal("already", second.Status);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("nope")]
    public async Task CheckIn_InvalidCode(string? code)
        => Assert.Equal("invalid", (await _svc.CheckInAsync(code)).Status);

    [Fact]
    public async Task CheckIn_TrimsWhitespace()
    {
        var g = await _svc.CreateAsync(Valid());
        Assert.Equal("ok", (await _svc.CheckInAsync($"  {g.Code}\n")).Status);
    }

    [Fact]
    public async Task Stats_CountsGuestsAndPeople()
    {
        var a = await _svc.CreateAsync(Valid("A"));
        await _svc.CreateAsync(Valid("B"));
        await _svc.CheckInAsync(a.Code);
        var s = await _svc.StatsAsync();
        Assert.Equal((2, 1, 1, 4, 2), (s.Total, s.CheckedIn, s.Pending, s.ExpectedPeople, s.ArrivedPeople));
        Assert.Equal("A", Assert.Single(s.Recent).Name);
    }

    [Fact]
    public void Seeder_Creates10GuestsWithEmailAndPhone_Idempotent()
    {
        Seeder.Seed(_db); Seeder.Seed(_db);
        var all = _db.Guests.ToList();
        Assert.Equal(10, all.Count);
        Assert.All(all, g => { Assert.Contains('@', g.Email); Assert.NotEmpty(g.Phone); });
        Assert.Equal(10, all.Select(g => g.Code).Distinct().Count());
    }
}
