import { Audio } from 'expo-av';
import { Vibration, Platform, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Interactive Audio Alert Service (`expo-av`).
 * Loops alert tone until restaurant staff explicitly clicks "Accept" or "Reject".
 */
class AudioAlertService {
  private activeSound: Audio.Sound | null = null;
  private autoStopTimer: any = null;
  private hapticInterval: any = null;
  private isAlertActive: boolean = false;

  private async configureAudioMode(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.warn('[AudioAlertService] Failed configuring audio mode:', err);
    }
  }

  /**
   * Start looping sound alert for live order intake
   */
  async startNewOrderAlert(timeoutMs: number = 45000): Promise<void> {
    if (this.isAlertActive) return;
    this.isAlertActive = true;

    try {
      await this.stopAlert();
      await this.configureAudioMode();

      // Start looping vibration / haptics
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 800, 400, 800, 400, 800], true);
      } else {
        Vibration.vibrate();
        this.hapticInterval = setInterval(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }, 1000);
      }

      const { sound } = await Audio.Sound.createAsync(
        require('../../../assets/sounds/order_buzz.wav'),
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1.0,
        }
      );

      this.activeSound = sound;
      await sound.playAsync();

      // Fallback auto-stop if unhandled after timeoutMs
      this.autoStopTimer = setTimeout(() => {
        this.stopAlert();
      }, timeoutMs);
    } catch (err) {
      console.error('[AudioAlertService] Error starting sound alert:', err);
    }
  }

  /**
   * Stop order alert immediately on Accept / Reject click
   */
  async stopAlert(): Promise<void> {
    this.isAlertActive = false;

    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    if (this.hapticInterval) {
      clearInterval(this.hapticInterval);
      this.hapticInterval = null;
    }

    try {
      Vibration.cancel();
    } catch (e) {}

    if (this.activeSound) {
      const soundToUnload = this.activeSound;
      this.activeSound = null;
      try {
        await soundToUnload.stopAsync();
        await soundToUnload.unloadAsync();
      } catch (e) {}
    }
  }

  isPlaying(): boolean {
    return this.isAlertActive;
  }
}

export const audioAlertService = new AudioAlertService();

// Stop sound if app enters background
AppState.addEventListener('change', (nextState) => {
  if (nextState !== 'active') {
    audioAlertService.stopAlert();
  }
});
