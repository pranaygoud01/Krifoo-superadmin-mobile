import { Vibration, Platform, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Asset } from 'expo-asset';
import { LocalSounds, getOrderBuzzPlaybackSource } from '@/constants/local-assets';

/**
 * Interactive Audio Alert Service (`expo-av`).
 * Loops alert tone until restaurant staff explicitly clicks "Accept" or "Reject".
 */
class AudioAlertService {
  private activeSound: any = null;
  private autoStopTimer: any = null;
  private hapticInterval: any = null;
  private isAlertActive: boolean = false;

  public async configureAudioMode(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,    // Keep iOS audio session alive for alert sounds
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
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

      const sourcesToTry: any[] = [];
      if (Platform.OS === 'android') {
        sourcesToTry.push(
          { uri: 'android.resource://com.krifoo.admin/raw/order_buzz' },
          { uri: 'order_buzz' },
          LocalSounds.orderBuzz
        );
      } else {
        // iOS: resolve local file path from bundled asset for reliable offline playback
        try {
          const asset = Asset.fromModule(LocalSounds.orderBuzz);
          if (!asset.localUri) {
            await asset.downloadAsync();
          }
          if (asset.localUri) {
            sourcesToTry.push({ uri: asset.localUri });
          }
        } catch (err) {
          console.warn('[AudioAlertService] Failed resolving iOS asset localUri:', err);
        }
        sourcesToTry.push(LocalSounds.orderBuzz);
        sourcesToTry.push({ uri: 'order_buzz.wav' });
      }

      let loadedSound: any = null;
      let lastErr: any = null;

      for (const sourceCandidate of sourcesToTry) {
        try {
          const result = await Audio.Sound.createAsync(
            sourceCandidate,
            {
              shouldPlay: true,
              isLooping: true,
              volume: 1.0,
            },
            null,
            Platform.OS === 'ios' // downloadFirst = true on iOS ensures bundled asset is cached and ready
          );
          loadedSound = result.sound;
          break;
        } catch (e) {
          console.warn('[AudioAlertService] Candidate failed, trying fallback:', sourceCandidate, e);
          lastErr = e;
        }
      }

      if (!loadedSound) {
        throw lastErr || new Error('Failed to load alert sound on all candidates');
      }

      this.activeSound = loadedSound;
      await loadedSound.playAsync();

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
