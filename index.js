// App entry point.
//
// The background notification task (auto-print when the app is in the background or was closed)
// must be defined as soon as the JS bundle loads. When Android wakes the app for a push, it can
// start JS without rendering any screen, so a task defined only inside the route tree
// (app/_layout → AuthContext → services/notification) may not exist yet and the push is dropped.
// Importing it here, before expo-router, guarantees TaskManager.defineTask runs first.
import './services/notification';

import 'expo-router/entry';
