import { NextRequest, NextResponse } from 'next/server';

type Recipient = { name?: string; email: string };

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      return NextResponse.json({ error: 'RESEND_API_KEY または EMAIL_FROM が未設定です。' }, { status: 500 });
    }

    const body = await req.json() as {
      recipients?: Recipient[];
      subject?: string;
      text?: string;
    };

    const recipients = (body.recipients ?? []).filter((r) => r.email);
    if (!recipients.length) return NextResponse.json({ error: '送信先がありません。' }, { status: 400 });
    if (!body.subject || !body.text) return NextResponse.json({ error: '件名または本文がありません。' }, { status: 400 });

    const results = [];
    for (const recipient of recipients) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: body.subject,
          text: body.text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      results.push({
        recipient,
        ok: res.ok,
        id: data?.id,
        error: res.ok ? null : JSON.stringify(data),
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}
