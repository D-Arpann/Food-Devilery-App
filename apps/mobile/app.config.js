const appJson = require('./app.json');
const fs = require('fs');
const path = require('path');

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        return acc;
      }

      const separatorIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }

      acc[key] = value;
      return acc;
    }, {});
}

const mobileEnv = readDotEnv(path.join(__dirname, '.env.local'));

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  mobileEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  mobileEnv.GOOGLE_MAPS_API_KEY ||
  '';

const expoConfig = appJson.expo;

module.exports = {
  expo: {
    ...expoConfig,
    ios: {
      ...expoConfig.ios,
      config: googleMapsApiKey
        ? {
          ...(expoConfig.ios?.config || {}),
          googleMapsApiKey,
        }
        : expoConfig.ios?.config,
    },
    android: {
      ...expoConfig.android,
      config: {
        ...(expoConfig.android?.config || {}),
        googleMaps: {
          ...(expoConfig.android?.config?.googleMaps || {}),
          apiKey: googleMapsApiKey,
        },
      },
    },
    extra: {
      ...(expoConfig.extra || {}),
      nativeGoogleMapsEnabled: Boolean(googleMapsApiKey),
    },
  },
};
