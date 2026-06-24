import type { CapacitorConfig } from '@capacitor/cli';

const hostedUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.courtclimate.app',
  appName: 'CourtClimate',
  webDir: 'dist',
  ios: {
    scheme: 'CourtClimate',
  },
  ...(hostedUrl
    ? {
        server: {
          url: hostedUrl,
          cleartext: hostedUrl.startsWith('http://'),
        },
      }
    : {}),
};

export default config;
