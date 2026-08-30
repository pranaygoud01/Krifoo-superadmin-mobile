import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, StyleSheet } from 'react-native';

const FONT_SCALE_STORAGE_KEY = '@krifoo_font_scale_preference';

export const FONT_SCALE_LEVELS = [0.88, 1.0, 1.15, 1.3] as const;

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
      {/* Keying children by scaleIndex ensures all rendered text nodes immediately recalculate styles */}
      <React.Fragment key={`font_scale_${scaleIndex}`}>{children}</React.Fragment>
    </FontSizeContext.Provider>
  );
};

export const useFontSize = () => useContext(FontSizeContext);
