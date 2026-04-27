export const env = {
  googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY as string,
  googleOauthClientId: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string,
  defaultLat: parseFloat(import.meta.env.VITE_DEFAULT_LAT ?? '40.7831'),
  defaultLng: parseFloat(import.meta.env.VITE_DEFAULT_LNG ?? '-73.9712'),
};
