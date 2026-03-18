const https = require('https');

const PROMPT = 'cinematic luxury portrait photograph, person in focus, dramatic chiaroscuro lighting warm golden rim light, deep rich shadows, background shows blurred bokeh Mercedes-Benz luxury cars in elegant dark showroom, extraordinary confident, premium editorial advertising campaign, ultra detailed photorealistic 8k';
const NEG = 'cartoon, anime, blurry face, low quality, watermark, text, logo, ugly, deformed, multiple people, bad anatomy';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const HF_TOKEN = process.env.HF_TOKEN || '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';

  let body = '';
  await new Promise((resolve) => {
    req.on('data', chunk => body += chunk);
    req.on('end', resolve);
  });

  let imageBase64 = null;
  try { imageBase64 = JSON.parse(body).image; } catch(e) {}
  if (!imageBase64) return res.status(400).json({ error: 'No se recibió imagen' });

  const postData = JSON.stringify({
    inputs: `data:image/jpeg;base64,${imageBase64}`,
    parameters: {
      prompt: PROMPT,
      negative_prompt: NEG,
      strength: 0.65,
      num_inference_steps: 30,
      guidance_scale: 7.5
    }
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'router.huggingface.co',
        path: '/models/runwayml/stable-diffusion-v1-5',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (r) => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'] || '', buf: Buffer.concat(chunks) }));
        r.on('error', reject);
      });
      req2.on('error', reject);
      req2.write(postData);
      req2.end();
    });

    if (result.status === 503) {
      let wait = 30;
      try { wait = JSON.parse(result.buf.toString()).estimated_time || 30; } catch(e) {}
      return res.status(503).json({ wait: Math.ceil(wait) });
    }

    if (!result.type.startsWith('image/')) {
      let errMsg = `Error ${result.status}`;
      try {
        const p = JSON.parse(result.buf.toString());
        errMsg = p.error || p.detail || p.message || JSON.stringify(p);
      } catch(e) { errMsg = result.buf.toString().slice(0, 300) || errMsg; }
      return res.status(500).json({ error: errMsg });
    }

    res.setHeader('Content-Type', result.type);
    return res.status(200).send(result.buf);

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
