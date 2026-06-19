const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

async function searchLocation(q) {
  const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=1&language=th`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results?.length) {
    const err = new Error('ไม่พบเมืองที่ค้นหา');
    err.status = 404;
    throw err;
  }
  const place = data.results[0];
  return {
    lat: place.latitude,
    lon: place.longitude,
    name: place.name,
    country: place.country_code || '',
  };
}

async function resolveLocation({ lat, lon, q }) {
  if (q) return searchLocation(q);

  if (lat == null || lon == null) {
    const err = new Error('ต้องระบุ lat/lon หรือชื่อเมือง');
    err.status = 400;
    throw err;
  }

  return {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    name: 'ตำแหน่งของคุณ',
    country: '',
  };
}

async function fetchAirQuality(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'pm2_5,pm10,european_aqi',
    hourly: 'pm2_5,european_aqi',
    timezone: 'Asia/Bangkok',
    forecast_days: '4',
  });

  const res = await fetch(`${AQ_URL}?${params}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.reason || 'Open-Meteo API error');
    err.status = res.status;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { lat, lon, q } = req.query;

  try {
    const location = await resolveLocation({ lat, lon, q });
    const raw = await fetchAirQuality(location.lat, location.lon);

    const hourly = (raw.hourly?.time || []).map((time, i) => ({
      time,
      pm2_5: raw.hourly.pm2_5?.[i] ?? null,
      european_aqi: raw.hourly.european_aqi?.[i] ?? null,
    }));

    return res.status(200).json({
      location,
      current: {
        time: raw.current?.time,
        pm2_5: raw.current?.pm2_5 ?? null,
        pm10: raw.current?.pm10 ?? null,
        european_aqi: raw.current?.european_aqi ?? null,
      },
      hourly,
    });
  } catch (err) {
    const status = err.status || 502;
    return res.status(status).json({ error: err.message || 'ดึงข้อมูลคุณภาพอากาศไม่ได้' });
  }
}
