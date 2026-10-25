namespace WeddingQueue.Api.Models;

public static class RundownStatus
{
    public const string Pending = "pending";
    public const string InProgress = "inprogress";
    public const string Done = "done";
    public static readonly string[] All = [Pending, InProgress, Done];
}

/// <summary>One line of the wedding-day run-of-show.</summary>
public class RundownItem
{
    public int Id { get; set; }
    /// <summary>24h "HH:mm" — sorts correctly as text.</summary>
    public string StartTime { get; set; } = "";
    public int DurationMinutes { get; set; } = 15;
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string? Location { get; set; }
    /// <summary>Person or vendor in charge (e.g. "DJ Marco", "Planner Sara").</summary>
    public string? Owner { get; set; }
    public string Status { get; set; } = RundownStatus.Pending;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

public record RundownInput(string StartTime, int? DurationMinutes, string Title, string? Description, string? Location, string? Owner);
public record StatusRequest(string Status);
