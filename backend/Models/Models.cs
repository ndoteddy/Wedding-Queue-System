namespace WeddingQueue.Api.Models;

public class Guest
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Table { get; set; }
    public int PartySize { get; set; } = 1;
    /// <summary>Secret token encoded in the QR code.</summary>
    public string Code { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CheckedInAt { get; set; }
    public DateTime? InvitationSentAt { get; set; }
}

public class NotificationLog
{
    public int Id { get; set; }
    public int GuestId { get; set; }
    public string Channel { get; set; } = "";   // email | sms
    public string Recipient { get; set; } = "";
    public string Status { get; set; } = "";    // sent | mock | failed
    public string? Detail { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public record GuestInput(string Name, string Email, string Phone, string? Table, int? PartySize);
public record CheckInRequest(string Code);
public record CheckInResult(string Status, string Message, Guest? Guest);
public record Stats(int Total, int CheckedIn, int Pending, int ExpectedPeople, int ArrivedPeople, List<Guest> Recent);
