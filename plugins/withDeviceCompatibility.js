const { withAndroidManifest, withAndroidStyles } = require('expo/config-plugins');

module.exports = function withDeviceCompatibility(config) {
  // 1. Manifest adjustments: hardware compatibility, queries, and large screen resizability
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // A. Declare optional hardware features so Google Play Store allows ALL devices (Sunmi, tablets, POS terminals)
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

    // B. Add queries for Sunmi & external POS printer services (Required on Android 11+)
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

    // C. Android 16+ Large Screen Support:
    // Remove orientation locks and ensure resizeableActivity is true across application and activities
    const application = androidManifest.application && androidManifest.application[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:resizeableActivity'] = 'true';

      if (application.activity && Array.isArray(application.activity)) {
        application.activity.forEach((act) => {
          if (act.$) {
            act.$['android:resizeableActivity'] = 'true';
            // Remove hardcoded portrait/landscape orientation restriction
            delete act.$['android:screenOrientation'];
          }
        });
      }
    }

    return config;
  });

  // 2. Styles adjustments: Android 15 Edge-to-Edge compliance
  // Remove deprecated statusBarColor, navigationBarColor, and enforceNavigationBarContrast
  config = withAndroidStyles(config, async (config) => {
    const { style = [] } = config.modResults.resources;
    const mainTheme = style.find((s) => s.$ && s.$.name === 'AppTheme');
    if (mainTheme && mainTheme.item) {
      // Filter out deprecated parameters
      mainTheme.item = mainTheme.item.filter(
        (item) =>
          item.$ &&
          item.$.name !== 'android:enforceNavigationBarContrast' &&
          item.$.name !== 'android:statusBarColor' &&
          item.$.name !== 'android:navigationBarColor'
      );

      // Add transparent system bars for standard edge-to-edge
      mainTheme.item.push({
        $: { name: 'android:statusBarColor' },
        _: '@android:color/transparent'
      });
      mainTheme.item.push({
        $: { name: 'android:navigationBarColor' },
        _: '@android:color/transparent'
      });
    }
    return config;
  });

  return config;
};
