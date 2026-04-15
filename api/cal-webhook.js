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

    // Template IDs: Welcome(1,2), Reminder(3,4), FollowUp(5,6), Benefits(7 teens-only)
    const templates = isKids
      ? { welcome: 2, reminder: 4, followUp: 6, benefits: null }
      : { welcome: 1, reminder: 3, followUp: 5, benefits: 7 };

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
    await sendTemplate(brevoKey, templates.welcome, email, name, {
      FIRSTNAME: firstName,
      SEMINAR_SESSION: formattedSession,
    });

    // 3. Schedule Benefits email (1 hour after welcome, Teens only)
    if (templates.benefits) {
      const benefitsDate = new Date();
      benefitsDate.setHours(benefitsDate.getHours() + 1);

      await sendTemplate(brevoKey, templates.benefits, email, name, {
        FIRSTNAME: firstName,
        SEMINAR_SESSION: formattedSession,
      }, benefitsDate.toISOString());
    }

    // 4. Schedule Reminder (1 day before seminar)
    if (sessionDate) {
      const reminderDate = new Date(sessionDate);
      reminderDate.setDate(reminderDate.getDate() - 1);
      reminderDate.setHours(9, 0, 0, 0); // 9 AM day before

      const now = new Date();
      if (reminderDate > now) {
        await sendTemplate(brevoKey, templates.reminder, email, name, {
          FIRSTNAME: firstName,
          SEMINAR_SESSION: formattedSession,
        }, reminderDate.toISOString());
      }
    }

    // 5. Schedule Follow-up (1 day after seminar)
    if (sessionDate) {
      const followUpDate = new Date(sessionDate);
      followUpDate.setDate(followUpDate.getDate() + 1);
      followUpDate.setHours(10, 0, 0, 0); // 10 AM day after

      await sendTemplate(brevoKey, templates.followUp, email, name, {
        FIRSTNAME: firstName,
        SEMINAR_SESSION: formattedSession,
      }, followUpDate.toISOString());
    }

    return res.status(200).json({
      success: true,
      contact: email,
      product,
      listId,
      emailsScheduled: {
        welcome: 'sent',
        benefits: templates.benefits ? 'scheduled (1hr)' : 'skipped',
        reminder: sessionDate ? 'scheduled' : 'skipped',
        followUp: sessionDate ? 'scheduled' : 'skipped',
      },
    });
  } catch (err) {
    console.error('Cal webhook error:', err);
    return res.status(200).json({ error: err.message });
  }
}

async function sendTemplate(apiKey, templateId, toEmail, toName, params, scheduledAt) {
  const body = {
    templateId,
    to: [{ email: toEmail, name: toName }],
    params,
  };

  if (scheduledAt) {
    body.scheduledAt = scheduledAt;
  }

  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
}
