using QRCoder;

namespace WeddingQueue.Api.Services;

public static class QrService
{
    /// <summary>Renders the payload as a PNG QR code.</summary>
    public static byte[] Png(string payload, int pixelsPerModule = 10)
    {
        using var gen = new QRCodeGenerator();
        using var data = gen.CreateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
        return new PngByteQRCode(data).GetGraphic(pixelsPerModule);
    }
}
