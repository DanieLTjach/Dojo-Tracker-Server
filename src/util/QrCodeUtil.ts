import QRCode from 'qrcode';

/**
 * Renders the given text (e.g. an invite deep link) into a PNG QR code.
 * Returns a Buffer suitable for Telegram's `ctx.replyWithPhoto({ source: buffer })`.
 */
export async function generateQrPng(text: string): Promise<Buffer> {
    return QRCode.toBuffer(text, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 512
    });
}
