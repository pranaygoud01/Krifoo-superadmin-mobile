/**
 * KeyboardAvoidingView behaviour for every screen and sheet in the app.
 *
 * Expo SDK 54 runs Android edge-to-edge, so the OS no longer resizes the window when the
 * keyboard opens (the old `adjustResize`). The previous `Platform.OS === 'ios' ? 'padding' :
 * undefined` therefore did nothing on Android and the keyboard covered inputs near the bottom.
 * 'padding' lifts the content above the keyboard on both platforms.
 */
export const KEYBOARD_BEHAVIOR = 'padding' as const;
