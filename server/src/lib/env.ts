import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export type WeatherProvider = 'open-meteo' | 'openweather';

function weatherProvider(): WeatherProvider {
  const v = optional('WEATHER_PROVIDER', 'open-meteo');
  if (v !== 'open-meteo' && v !== 'openweather') {
    throw new Error(`Invalid WEATHER_PROVIDER: ${v} (expected open-meteo | openweather)`);
  }
  return v;
}

export const env = {
  port: parseInt(optional('PORT', '4000'), 10),
  clientOrigin: optional('CLIENT_ORIGIN', 'http://localhost:5173'),
  nodeEnv: optional('NODE_ENV', 'development'),
  databaseUrl: required('DATABASE_URL'),
  googleOauthClientId: required('GOOGLE_OAUTH_CLIENT_ID'),
  googlePlacesKey: required('GOOGLE_PLACES_KEY'),
  openweatherKey: process.env.OPENWEATHER_KEY ?? '', // Required only when WEATHER_PROVIDER=openweather
  weatherProvider: weatherProvider(),
  defaultLat: parseFloat(optional('DEFAULT_LAT', '40.7831')),
  defaultLng: parseFloat(optional('DEFAULT_LNG', '-73.9712')),
  defaultRadiusMeters: parseInt(optional('DEFAULT_RADIUS_METERS', '16000'), 10),
};

export const isProd = env.nodeEnv === 'production';
