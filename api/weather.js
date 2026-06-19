const BASE = 'https://api.openweathermap.org';
const PARAMS = 'units=metric&lang=th';

async function owmFetch(path, apiKey) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}${PARAMS}&appid=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || 'OpenWeather API error');
    err.status = res.status;
    throw err;
  }
  return data;
}

async function resolveLocation(apiKey, { lat, lon, q }) {
  if (q) {
    const geo = await owmFetch(`/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1`, apiKey);
    if (!geo.length) {
      const err = new Error('ไม่พบเมืองที่ค้นหา');
      err.status = 404;
      throw err;
    }
    return {
      lat: geo[0].lat,
      lon: geo[0].lon,
      name: geo[0].local_names?.th || geo[0].name,
      country: geo[0].country,
    };
  }

  if (lat == null || lon == null) {
    const err = new Error('ต้องระบุ lat/lon หรือชื่อเมือง');
    err.status = 400;
    throw err;
  }

  const reverse = await owmFetch(`/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1`, apiKey);
  const place = reverse[0];
  return {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    name: place?.local_names?.th || place?.name || `${lat}, ${lon}`,
    country: place?.country || '',
  };
}

function dayKey(ts, tzOffset) {
  const d = new Date((ts + tzOffset) * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function buildFromForecast(current, forecast, lat, lon) {
  const tz = forecast.city.timezone || 0;

  const currentNorm = {
    dt: current.dt,
    sunrise: current.sys?.sunrise,
    sunset: current.sys?.sunset,
    temp: current.main.temp,
    feels_like: current.main.feels_like,
    pressure: current.main.pressure,
    humidity: current.main.humidity,
    uvi: 0,
    visibility: current.visibility,
    wind_speed: current.wind?.speed ?? 0,
    wind_deg: current.wind?.deg,
    weather: current.weather,
    clouds: current.clouds?.all,
  };

  const hourly = forecast.list.slice(0, 12).map((item) => ({
    dt: item.dt,
    temp: item.main.temp,
    feels_like: item.main.feels_like,
    humidity: item.main.humidity,
    wind_speed: item.wind?.speed ?? 0,
    weather: item.weather,
    pop: item.pop ?? 0,
  }));

  const dailyMap = new Map();
  forecast.list.forEach((item) => {
    const key = dayKey(item.dt, tz);
    const existing = dailyMap.get(key);
    if (!existing) {
      dailyMap.set(key, {
        dt: item.dt,
        temp: { min: item.main.temp_min, max: item.main.temp_max },
        weather: item.weather,
        pop: item.pop ?? 0,
      });
    } else {
      existing.temp.min = Math.min(existing.temp.min, item.main.temp_min);
      existing.temp.max = Math.max(existing.temp.max, item.main.temp_max);
      existing.pop = Math.max(existing.pop, item.pop ?? 0);
    }
  });

  return {
    lat,
    lon,
    timezone_offset: tz,
    current: currentNorm,
    hourly,
    daily: Array.from(dailyMap.values()).slice(0, 7),
    alerts: [],
  };
}

async function fetchWeatherData(apiKey, lat, lon) {
  try {
    return await owmFetch(
      `/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely`,
      apiKey,
    );
  } catch (err) {
    if (err.status !== 401 && err.status !== 403) throw err;

    const [current, forecast] = await Promise.all([
      owmFetch(`/data/2.5/weather?lat=${lat}&lon=${lon}`, apiKey),
      owmFetch(`/data/2.5/forecast?lat=${lat}&lon=${lon}`, apiKey),
    ]);
    return buildFromForecast(current, forecast, lat, lon);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า OPENWEATHER_API_KEY' });

  const { lat, lon, q } = req.query;

  try {
    const location = await resolveLocation(apiKey, { lat, lon, q });
    const weather = await fetchWeatherData(apiKey, location.lat, location.lon);
    return res.status(200).json({ location, weather });
  } catch (err) {
    const status = err.status || 502;
    return res.status(status).json({ error: err.message || 'ดึงข้อมูลสภาพอากาศไม่ได้' });
  }
}
