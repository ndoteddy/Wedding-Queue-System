using System.Net;
using System.Net.Http.Json;
using WeddingQueue.Api.Models;

namespace WeddingQueue.Api.Tests;

public class ApiTests
{
    static readonly GuestInput Good = new("Zed Zee", "zed@example.com", "+1 555 0199", "9", 3);

    [Fact]
    public async Task SeededDb_Lists10Guests()
    {
        using var f = new ApiFactory { Seed = true };
        var list = await f.CreateClient().GetFromJsonAsync<List<Guest>>("/api/guests");
        Assert.Equal(10, list!.Count);
    }

    [Fact]
    public async Task PostGuest_CreatesAndSendsInvitation()
    {
        using var f = new ApiFactory();
        var c = f.CreateClient();
        var res = await c.PostAsJsonAsync("/api/guests", Good);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var g = (await res.Content.ReadFromJsonAsync<Guest>())!;
        Assert.Equal("Zed Zee", g.Name);
        Assert.Single(f.Sender.Sent);
        var logs = await c.GetFromJsonAsync<List<NotificationLog>>($"/api/guests/{g.Id}/notifications");
        Assert.Equal(["email", "sms"], logs!.Select(l => l.Channel).Order().ToArray());
    }

    [Fact]
    public async Task PostGuest_InvalidReturns400_AndSendsNothing()
    {
        using var f = new ApiFactory();
        var res = await f.CreateClient().PostAsJsonAsync("/api/guests", Good with { Email = "bad" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Empty(f.Sender.Sent);
    }

    [Fact]
    public async Task QrEndpoint_ServesPngForKnownCodeOnly()
    {
        using var f = new ApiFactory();
        var c = f.CreateClient();
        var g = (await (await c.PostAsJsonAsync("/api/guests", Good)).Content.ReadFromJsonAsync<Guest>())!;
        var ok = await c.GetAsync($"/api/qr/{g.Code}.png");
        Assert.Equal("image/png", ok.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/qr/unknown.png")).StatusCode);
    }

    [Fact]
    public async Task Checkin_Flow_OkThenAlreadyThenInvalid()
    {
        using var f = new ApiFactory();
        var c = f.CreateClient();
        var g = (await (await c.PostAsJsonAsync("/api/guests", Good)).Content.ReadFromJsonAsync<Guest>())!;

        var r1 = (await (await c.PostAsJsonAsync("/api/checkin", new CheckInRequest(g.Code))).Content.ReadFromJsonAsync<CheckInResult>())!;
        Assert.Equal("ok", r1.Status);
        Assert.Equal("Zed Zee", r1.Guest!.Name);

        var r2 = (await (await c.PostAsJsonAsync("/api/checkin", new CheckInRequest(g.Code))).Content.ReadFromJsonAsync<CheckInResult>())!;
        Assert.Equal("already", r2.Status);

        var bad = await c.PostAsJsonAsync("/api/checkin", new CheckInRequest("zzz"));
        Assert.Equal(HttpStatusCode.NotFound, bad.StatusCode);

        var stats = (await c.GetFromJsonAsync<Stats>("/api/stats"))!;
        Assert.Equal((1, 1, 0), (stats.Total, stats.CheckedIn, stats.Pending));
    }

    [Fact]
    public async Task ResetCheckin_And_Resend_And_Delete()
    {
        using var f = new ApiFactory();
        var c = f.CreateClient();
        var g = (await (await c.PostAsJsonAsync("/api/guests", Good)).Content.ReadFromJsonAsync<Guest>())!;
        await c.PostAsJsonAsync("/api/checkin", new CheckInRequest(g.Code));

        Assert.Null((await (await c.PostAsync($"/api/guests/{g.Id}/reset-checkin", null)).Content.ReadFromJsonAsync<Guest>())!.CheckedInAt);
        await c.PostAsync($"/api/guests/{g.Id}/resend", null);
        Assert.Equal(2, f.Sender.Sent.Count);
        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync($"/api/guests/{g.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync($"/api/guests/{g.Id}")).StatusCode);
    }

    [Fact]
    public async Task Put_UpdatesGuest()
    {
        using var f = new ApiFactory();
        var c = f.CreateClient();
        var g = (await (await c.PostAsJsonAsync("/api/guests", Good)).Content.ReadFromJsonAsync<Guest>())!;
        var upd = await c.PutAsJsonAsync($"/api/guests/{g.Id}", Good with { Name = "Renamed" });
        Assert.Equal("Renamed", (await upd.Content.ReadFromJsonAsync<Guest>())!.Name);
    }
}
