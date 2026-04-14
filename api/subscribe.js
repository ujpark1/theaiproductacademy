export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, firstName, lastName, session, product } = req.body;

  if (!email || !firstName) {
    return res.status(400).json({ error: 'Email and first name are required' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName || '',
          SEMINAR_SESSION: session || '',
          PRODUCT: product || 'teens',
        },
        listIds: [parseInt(process.env.BREVO_LIST_ID_TEENS || '2')],
        updateEnabled: true,
      }),
    });

    if (response.ok || response.status === 204) {
      return res.status(200).json({ success: true });
    }

    const data = await response.json();

    // Contact already exists — still success
    if (data.code === 'duplicate_parameter') {
      return res.status(200).json({ success: true, existing: true });
    }

    return res.status(response.status).json({ error: data.message || 'Brevo API error' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to connect to Brevo' });
  }
}
