const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withDeviceCompatibility(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // 1. Declare optional hardware features so Google Play Store allows ALL devices (Sunmi, tablets, POS terminals)
    const optionalFeatures = [
      'android.hardware.bluetooth',
      'android.hardware.bluetooth_le',
      'android.hardware.location',
      'android.hardware.location.gps',
      'android.hardware.location.network',
      'android.hardware.camera',
      'android.hardware.camera.autofocus',
      'android.hardware.telephony',
      'android.hardware.wifi',
      'android.hardware.touchscreen'
    ];

    if (!androidManifest['uses-feature']) {
      androidManifest['uses-feature'] = [];
    }

    optionalFeatures.forEach((feature) => {
      const exists = androidManifest['uses-feature'].some(
        (f) => f.$ && f.$['android:name'] === feature
      );
      if (!exists) {
        androidManifest['uses-feature'].push({
          $: {
            'android:name': feature,
            'android:required': 'false'
          }
        });
      } else {
        const item = androidManifest['uses-feature'].find(
          (f) => f.$ && f.$['android:name'] === feature
        );
        if (item && item.$) {
          item.$['android:required'] = 'false';
        }
      }
    });

    // 2. Add queries for Sunmi & external POS printer services (Required on Android 11+)
    if (!androidManifest.queries) {
      androidManifest.queries = [];
    }

    const queriesObj = androidManifest.queries[0] || {};
    if (!queriesObj.package) {
      queriesObj.package = [];
    }
    if (!queriesObj.intent) {
      queriesObj.intent = [];
    }

    const sunmiPackage = 'woyou.aidlservice.jiuiv5';
    if (!queriesObj.package.some((p) => p.$ && p.$['android:name'] === sunmiPackage)) {
      queriesObj.package.push({
        $: { 'android:name': sunmiPackage }
      });
    }

    const sunmiAction = 'woyou.aidlservice.jiuiv5.IWoyouService';
    if (
      !queriesObj.intent.some(
        (i) => i.action && i.action.some((a) => a.$ && a.$['android:name'] === sunmiAction)
      )
    ) {
      queriesObj.intent.push({
        action: [{ $: { 'android:name': sunmiAction } }]
      });
    }

    androidManifest.queries[0] = queriesObj;

    return config;
  });
};
