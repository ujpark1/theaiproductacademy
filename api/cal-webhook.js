export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey) {
    return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
  }

  try {
    const payload = req.body?.payload || req.body;

    // Cal.com BOOKING_CREATED payload structure
    const attendee = payload?.attendees?.[0];
    if (!attendee?.email) {
      return res.status(200).json({ skipped: true, reason: 'No attendee email' });
    }

    const email = attendee.email;
    const name = attendee.name || '';
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Extract booking details
    const startTime = payload?.startTime || '';
    const eventTitle = payload?.title || 'AI Product Academy Seminar';

    // Add contact to Brevo
    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': brevoKey,
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName,
          SEMINAR_SESSION: startTime,
          SEMINAR_TITLE: eventTitle,
          PRODUCT: 'teens-seminar',
          SOURCE: 'cal.com',
        },
        listIds: [parseInt(process.env.BREVO_LIST_ID_TEENS || '2')],
        updateEnabled: true,
      }),
    });

    const brevoData = await brevoRes.json().catch(() => ({}));

    return res.status(200).json({
      success: true,
      contact: email,
      brevoStatus: brevoRes.status,
    });
  } catch (err) {
    console.error('Cal webhook error:', err);
    return res.status(200).json({ error: err.message });
  }
}
