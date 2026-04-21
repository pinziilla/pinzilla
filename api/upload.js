export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const {
    provider, cloudName, uploadPreset, imgbbKey,
    bunnyZone, bunnyPassword, bunnyRegion, bunnyCdn,
    imageBase64, fileName, mimeType
  } = req.body;

  try {
    // ── Cloudinary ────────────────────────────────────────────
    if (provider === 'cloudinary') {
      if (!cloudName || !uploadPreset)
        return res.status(400).json({ error: 'Missing cloudName or uploadPreset' });
      const boundary = '----PFBoundary' + Date.now();
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"', '',
        `data:${mimeType||'image/jpeg'};base64,${imageBase64}`,
        `--${boundary}`,
        'Content-Disposition: form-data; name="upload_preset"', '',
        uploadPreset,
        `--${boundary}--`,
      ].join('\r\n');
      const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
      const d = await r.json();
      if (d.secure_url) return res.status(200).json({ url: d.secure_url });
      throw new Error(d.error?.message || 'Cloudinary upload failed');
    }

    // ── ImgBB ─────────────────────────────────────────────────
    if (provider === 'imgbb') {
      if (!imgbbKey)
        return res.status(400).json({ error: 'Missing imgbbKey' });
      const params = new URLSearchParams();
      params.append('image', imageBase64);
      const r = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const d = await r.json();
      if (d.success) return res.status(200).json({ url: d.data.url });
      throw new Error(d.error?.message || 'ImgBB upload failed');
    }

    // ── Bunny.net Edge Storage ────────────────────────────────
    if (provider === 'bunny') {
      if (!bunnyZone || !bunnyPassword)
        return res.status(400).json({ error: 'Missing bunnyZone or bunnyPassword' });

      const region = (bunnyRegion || 'storage.bunnycdn.com').trim();
      const ext = (fileName || 'image.jpg').split('.').pop().toLowerCase() || 'jpg';
      const uniqueName = `pinforge/${Date.now()}-${Math.random().toString(36).substring(2,8)}.${ext}`;
      const uploadUrl = `https://${region}/${bunnyZone}/${uniqueName}`;

      const buf = Buffer.from(imageBase64, 'base64');

      const r = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': bunnyPassword,
          'Content-Type': mimeType || 'image/jpeg',
        },
        body: buf,
      });

      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Bunny.net upload failed (HTTP ${r.status}): ${errText}`);
      }

      // Build public CDN URL
      const cdn = (bunnyCdn || '').replace(/\/$/, '');
      const publicUrl = cdn
        ? `${cdn}/${uniqueName}`
        : `https://${region}/${bunnyZone}/${uniqueName}`;

      return res.status(200).json({ url: publicUrl });
    }

    res.status(400).json({ error: 'Unknown provider: ' + provider });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
