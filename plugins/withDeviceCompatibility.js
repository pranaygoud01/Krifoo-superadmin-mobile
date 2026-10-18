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

    // Ensure tools namespace exists
    if (!androidManifest.$) {
      androidManifest.$ = {};
    }
    androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // C. Android 16+ Large Screen Support:
    // Remove orientation locks and ensure resizeableActivity is true across application and activities
    const application = androidManifest.application && androidManifest.application[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:resizeableActivity'] = 'true';

      if (!application.activity) {
        application.activity = [];
      }

      if (Array.isArray(application.activity)) {
        application.activity.forEach((act) => {
          if (act.$) {
            act.$['android:resizeableActivity'] = 'true';
            // Remove hardcoded portrait/landscape orientation restriction
            delete act.$['android:screenOrientation'];
          }
        });
      }

      // Explicitly override Google ML Kit internal code scanner activity
      // to remove android:screenOrientation="PORTRAIT" restriction flagged on Android 16+ large screens
      const gmsBarcodeActivityName =
        'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';
      const existingGmsActivity = application.activity.find(
        (act) => act.$ && act.$['android:name'] === gmsBarcodeActivityName
      );

      if (!existingGmsActivity) {
        application.activity.push({
          $: {
            'android:name': gmsBarcodeActivityName,
            'tools:remove': 'android:screenOrientation',
            'tools:replace': 'android:resizeableActivity',
            'android:resizeableActivity': 'true'
          }
        });
      } else {
        existingGmsActivity.$['tools:remove'] = 'android:screenOrientation';
        existingGmsActivity.$['tools:replace'] = 'android:resizeableActivity';
        existingGmsActivity.$['android:resizeableActivity'] = 'true';
        delete existingGmsActivity.$['android:screenOrientation'];
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
      // Filter out deprecated parameters completely (Android 15+ handles edge-to-edge transparent system bars natively)
      mainTheme.item = mainTheme.item.filter(
        (item) =>
          item.$ &&
          item.$.name !== 'android:enforceNavigationBarContrast' &&
          item.$.name !== 'android:statusBarColor' &&
          item.$.name !== 'android:navigationBarColor'
      );
    }
    return config;
  });

  return config;
};
