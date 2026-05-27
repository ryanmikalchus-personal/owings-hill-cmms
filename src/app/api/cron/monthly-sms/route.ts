import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('secret') !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const currentMonth = new Date().getMonth() + 1;

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('title, materials, assignment')
    .or(`next_due_month.eq.${currentMonth},next_due_month.eq.0`);

  if (error || !tasks || tasks.length === 0) {
      return NextResponse.json({ success: true, msg: 'No tasks' });
  }

  let smsBody = `🏠 Owings Hill Maintenance\nDue this month:\n\n`;
  tasks.forEach((t, i) => {
    smsBody += `${i + 1}. ${t.title}\n🛠️ ${t.assignment} | 📦 ${t.materials || 'None'}\n\n`;
  });

  const recipients = [process.env.MY_PHONE_NUMBER!, process.env.WIFE_PHONE_NUMBER!];

  for (const phone of recipients) {
    if (phone) {
      await twilioClient.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      });
    }
  }

  return NextResponse.json({ success: true, notified: recipients.length });
}