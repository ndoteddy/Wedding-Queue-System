using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using WeddingQueue.Api.Models;

namespace WeddingQueue.Api.Services;

public interface IInvitationSender
{
    Task<List<NotificationLog>> SendAsync(Guest guest);
}

public class SmtpOptions
{
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public string? User { get; set; }
    public string? Password { get; set; }
    public string From { get; set; } = "wedding@example.com";
    public bool UseSsl { get; set; }
}

/// <summary>
/// Email: real SMTP when Smtp:Host is configured, otherwise the .eml is saved to ./outbox (demo mode).
/// SMS: mocked (logged) — plug Twilio or similar in here.
/// </summary>
public class InvitationSender(SmtpOptions smtp, IConfiguration cfg, IWebHostEnvironment env, ILogger<InvitationSender> log) : IInvitationSender
{
    public async Task<List<NotificationLog>> SendAsync(Guest g)
    {
        var baseUrl = cfg["PublicBaseUrl"] ?? "http://localhost:5277";
        var qrUrl = $"{baseUrl}/api/qr/{g.Code}.png";
        return [await EmailAsync(g, qrUrl), Sms(g, qrUrl)];
    }

    async Task<NotificationLog> EmailAsync(Guest g, string qrUrl)
    {
        var entry = new NotificationLog { GuestId = g.Id, Channel = "email", Recipient = g.Email };
        try
        {
            var msg = new MimeMessage();
            msg.From.Add(MailboxAddress.Parse(smtp.From));
            msg.To.Add(new MailboxAddress(g.Name, g.Email));
            msg.Subject = "Your wedding invitation & entry QR code";
            var body = new BodyBuilder();
            var img = body.LinkedResources.Add("qr.png", QrService.Png(g.Code));
            img.ContentId = "qr";
            var name = System.Net.WebUtility.HtmlEncode(g.Name);
            body.HtmlBody = $"<h2>Hi {name},</h2><p>We can't wait to celebrate with you! " +
                $"Show this QR code at the entrance:</p><p><img src=\"cid:qr\" width=\"240\" height=\"240\" alt=\"QR\"/></p>" +
                $"<p>Party size: {g.PartySize}{(g.Table is null ? "" : $" · Table {System.Net.WebUtility.HtmlEncode(g.Table)}")}</p>";
            body.TextBody = $"Hi {g.Name}, your entry QR: {qrUrl}";
            msg.Body = body.ToMessageBody();

            if (string.IsNullOrWhiteSpace(smtp.Host))
            {
                var dir = Path.Combine(env.ContentRootPath, "outbox");
                Directory.CreateDirectory(dir);
                var path = Path.Combine(dir, $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{g.Id}.eml");
                await msg.WriteToAsync(path);
                entry.Status = "mock"; entry.Detail = $"Saved to {path}";
            }
            else
            {
                using var c = new SmtpClient();
                await c.ConnectAsync(smtp.Host, smtp.Port, smtp.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable);
                if (!string.IsNullOrEmpty(smtp.User)) await c.AuthenticateAsync(smtp.User, smtp.Password ?? "");
                await c.SendAsync(msg);
                await c.DisconnectAsync(true);
                entry.Status = "sent";
            }
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Email to {Email} failed", g.Email);
            entry.Status = "failed"; entry.Detail = ex.Message;
        }
        return entry;
    }

    NotificationLog Sms(Guest g, string qrUrl)
    {
        log.LogInformation("[SMS mock] to {Phone}: Hi {Name}, your wedding entry QR: {Url}", g.Phone, g.Name, qrUrl);
        return new() { GuestId = g.Id, Channel = "sms", Recipient = g.Phone, Status = "mock", Detail = qrUrl };
    }
}

