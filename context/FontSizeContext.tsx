import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';

const FONT_SCALE_STORAGE_KEY = '@krifoo_font_scale_preference';

export const FONT_SCALE_LEVELS = [0.85, 1.0, 1.2, 1.4] as const;

interface FontSizeContextType {
  fontScale: number;
  scaleIndex: number;
  scaleLabel: string;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;
  setFontScaleIndex: (index: number) => void;
}

const FontSizeContext = createContext<FontSizeContextType>({
  fontScale: 1.0,
  scaleIndex: 1,
  scaleLabel: '100%',
  increaseFontSize: () => {},
  decreaseFontSize: () => {},
  resetFontSize: () => {},
  setFontScaleIndex: () => {},
});

// Global scale accessible inside the Text.render interceptor
export let globalFontScale = 1.0;

export const setGlobalFontScale = (scale: number) => {
  globalFontScale = scale;
};

export const FontSizeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scaleIndex, setScaleIndex] = useState<number>(1); // Default is 1.0 (index 1)

  useEffect(() => {
    AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY)
      .then((saved) => {
        if (saved !== null) {
          const idx = parseInt(saved, 10);
          if (!isNaN(idx) && idx >= 0 && idx < FONT_SCALE_LEVELS.length) {
            setScaleIndex(idx);
            setGlobalFontScale(FONT_SCALE_LEVELS[idx]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const updateScale = (newIdx: number) => {
    const clamped = Math.max(0, Math.min(newIdx, FONT_SCALE_LEVELS.length - 1));
    setScaleIndex(clamped);
    const newScale = FONT_SCALE_LEVELS[clamped];
    setGlobalFontScale(newScale);
    AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, String(clamped)).catch(() => {});
  };

  const increaseFontSize = () => {
    if (scaleIndex < FONT_SCALE_LEVELS.length - 1) {
      updateScale(scaleIndex + 1);
    }
  };

  const decreaseFontSize = () => {
    if (scaleIndex > 0) {
      updateScale(scaleIndex - 1);
    }
  };

  const resetFontSize = () => {
    updateScale(1); // Standard 100%
  };

  const currentScale = FONT_SCALE_LEVELS[scaleIndex];
  const scalePercent = Math.round(currentScale * 100);
  const scaleLabel = `${scalePercent}%`;

  return (
    <FontSizeContext.Provider
      value={{
        fontScale: currentScale,
        scaleIndex,
        scaleLabel,
        increaseFontSize,
        decreaseFontSize,
        resetFontSize,
        setFontScaleIndex: updateScale,
      }}
    >
      {/* Keying the root View by scaleIndex forces React to unmount & re-render all screen routes with new font styles */}
      <View key={`app_root_scale_${scaleIndex}`} style={{ flex: 1 }}>
        {children}
      </View>
    </FontSizeContext.Provider>
  );
};

export const useFontSize = () => useContext(FontSizeContext);
