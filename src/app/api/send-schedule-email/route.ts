import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

type Recipient = { name?: string; email: string };

export async function POST(req: NextRequest) {
  try {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || '465');
    const secure = String(process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM || user;

    if (!host || !port || !user || !pass || !from) {
      return NextResponse.json({ error: 'SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM のいずれかが未設定です。' }, { status: 500 });
    }

    const body = await req.json() as {
      recipients?: Recipient[];
      subject?: string;
      text?: string;
    };

    const recipients = (body.recipients ?? []).filter((r) => r.email);
    if (!recipients.length) return NextResponse.json({ error: '送信先がありません。' }, { status: 400 });
    if (!body.subject || !body.text) return NextResponse.json({ error: '件名または本文がありません。' }, { status: 400 });

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const results = [];
    for (const recipient of recipients) {
      try {
        const info = await transporter.sendMail({
          from,
          to: recipient.email,
          subject: body.subject,
          text: body.text,
        });
        results.push({
          recipient,
          ok: true,
          id: info.messageId,
          error: null,
        });
      } catch (error) {
        results.push({
          recipient,
          ok: false,
          id: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}
