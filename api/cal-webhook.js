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

    const attendee = payload?.attendees?.[0];
    if (!attendee?.email) {
      return res.status(200).json({ skipped: true, reason: 'No attendee email' });
    }

    const email = attendee.email;
    const name = attendee.name || '';
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const startTime = payload?.startTime || '';
    const eventTitle = payload?.title || '';
    const eventSlug = payload?.eventType?.slug || payload?.type?.slug || '';

    // Determine Kids vs Teens
    const isKids = eventTitle.toLowerCase().includes('kids') ||
                   eventSlug.toLowerCase().includes('kids');
    const product = isKids ? 'kids-seminar' : 'teens-seminar';
    const listId = isKids
      ? parseInt(process.env.BREVO_LIST_ID_KIDS || '4')
      : parseInt(process.env.BREVO_LIST_ID_TEENS || '3');
    const welcomeTemplateId = isKids ? 2 : 1;

    // Format session date for display
    const sessionDate = startTime ? new Date(startTime) : null;
    const formattedSession = sessionDate
      ? sessionDate.toLocaleString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })
      : 'TBD';

    // 1. Add contact to Brevo list
    await fetch('https://api.brevo.com/v3/contacts', {
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
          SEMINAR_SESSION: formattedSession,
          SEMINAR_TITLE: eventTitle,
          PRODUCT: product,
          SOURCE: 'cal.com',
        },
        listIds: [listId],
        updateEnabled: true,
      }),
    });

    // 2. Send Welcome email immediately
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': brevoKey,
      },
      body: JSON.stringify({
        templateId: welcomeTemplateId,
        to: [{ email, name }],
        params: {
          FIRSTNAME: firstName,
          SEMINAR_SESSION: formattedSession,
        },
      }),
    });

    return res.status(200).json({
      success: true,
      contact: email,
      product,
      listId,
      welcomeEmailSent: true,
    });
  } catch (err) {
    console.error('Cal webhook error:', err);
    return res.status(200).json({ error: err.message });
  }
}
