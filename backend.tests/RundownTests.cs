using System.Net;
using System.Net.Http.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WeddingQueue.Api.Data;
using WeddingQueue.Api.Models;
using WeddingQueue.Api.Services;

namespace WeddingQueue.Api.Tests;

public class RundownTests
{
    static readonly RundownInput Good = new("18:30", 20, "Bouquet toss", "On the terrace", "Terrace", "Planner Sara");

    [Theory]
    [InlineData("", "09:00", 10, "title")]
    [InlineData("A", "9:00", 10, "startTime")]
    [InlineData("A", "24:00", 10, "startTime")]
    [InlineData("A", "12:60", 10, "startTime")]
    [InlineData("A", "09:00", 0, "durationMinutes")]
    [InlineData("A", "09:00", 601, "durationMinutes")]
    public void Validate_RejectsBadInput(string title, string time, int mins, string field)
        => Assert.Contains(field, RundownService.Validate(new(time, mins, title, null, null, null)).Keys);

    [Fact] public void Validate_AcceptsGood() => Assert.Empty(RundownService.Validate(Good));

    [Fact]
    public void SetStatus_StampsTimesAndRejectsUnknown()
    {
        var item = new RundownItem();
        Assert.True(RundownService.SetStatus(item, "inprogress"));
        Assert.NotNull(item.StartedAt); Assert.Null(item.CompletedAt);
        Assert.True(RundownService.SetStatus(item, "done"));
        Assert.NotNull(item.CompletedAt);
        Assert.True(RundownService.SetStatus(item, "pending"));
        Assert.Null(item.StartedAt); Assert.Null(item.CompletedAt);
        Assert.False(RundownService.SetStatus(item, "bogus"));
        Assert.Equal("pending", item.Status);
    }

    [Fact]
    public void Seed_IsIdempotentAndOrderedByTime()
    {
        using var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        using var db = new AppDb(new DbContextOptionsBuilder<AppDb>().UseSqlite(conn).Options);
        db.Database.EnsureCreated();
        RundownService.Seed(db); RundownService.Seed(db);
        var items = db.Rundown.OrderBy(r => r.StartTime).ToList();
        Assert.Equal(11, items.Count);
        Assert.All(items, r => Assert.Empty(RundownService.Validate(new(r.StartTime, r.DurationMinutes, r.Title, null, null, null))));
    }

    [Fact]
    public async Task Api_SeededRundown_ListedInTimeOrder()
    {
        using var f = new ApiFactory { Seed = true };
        var list = (await f.CreateClient().GetFromJsonAsync<List<RundownItem>>("/api/rundown"))!;
        Assert.Equal(11, list.Count);
        Assert.Equal(list.Select(x => x.StartTime).Order().ToList(), list.Select(x => x.StartTime).ToList());
    }

    [Fact]
    public async Task Api_Crud_AndStatusFlow()
    {
        using var f = new ApiFactory();
        var c = f.CreateClient();

        var res = await c.PostAsJsonAsync("/api/rundown", Good);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var item = (await res.Content.ReadFromJsonAsync<RundownItem>())!;
        Assert.Equal("pending", item.Status);

        var upd = await c.PutAsJsonAsync($"/api/rundown/{item.Id}", Good with { Title = "Renamed" });
        Assert.Equal("Renamed", (await upd.Content.ReadFromJsonAsync<RundownItem>())!.Title);

        var started = (await (await c.PostAsJsonAsync($"/api/rundown/{item.Id}/status", new StatusRequest("inprogress"))).Content.ReadFromJsonAsync<RundownItem>())!;
        Assert.NotNull(started.StartedAt);
        var done = (await (await c.PostAsJsonAsync($"/api/rundown/{item.Id}/status", new StatusRequest("done"))).Content.ReadFromJsonAsync<RundownItem>())!;
        Assert.NotNull(done.CompletedAt);

        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync($"/api/rundown/{item.Id}/status", new StatusRequest("nope"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync($"/api/rundown/{item.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.DeleteAsync($"/api/rundown/{item.Id}")).StatusCode);
    }

    [Fact]
    public async Task Api_InvalidInput_Returns400()
    {
        using var f = new ApiFactory();
        var res = await f.CreateClient().PostAsJsonAsync("/api/rundown", Good with { StartTime = "25:99" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Api_UnknownId_Returns404()
    {
        using var f = new ApiFactory();
        var c = f.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await c.PutAsJsonAsync("/api/rundown/999", Good)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.PostAsJsonAsync("/api/rundown/999/status", new StatusRequest("done"))).StatusCode);
    }
}
