import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  phone: 0,
  smallTablet: 600,
  tablet: 768,       // Standard iPad / 10-inch Android tablet
  largeTablet: 1024, // iPad Air / Pro 11", 12.9", POS terminals
  desktop: 1280,
};

export interface AdaptiveLayoutInfo {
  width: number;
  height: number;
  isTablet: boolean;
  isLargeTablet: boolean;
  isSmallPhone: boolean;
  isLandscape: boolean;
  columns: number;
  maxContentWidth: number;
  modalMaxWidth: number;
}

/**
 * Hook to provide responsive flags, column counts, and sizing for Tablets & iPads
 */
export function useAdaptive(): AdaptiveLayoutInfo {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= BREAKPOINTS.tablet;
  const isLargeTablet = width >= BREAKPOINTS.largeTablet;
  const isSmallPhone = width < 375;
  const isLandscape = width > height;

  const columns = isLargeTablet ? 3 : isTablet ? 2 : 1;
  const maxContentWidth = isLargeTablet ? 1160 : isTablet ? 860 : 600;
  const modalMaxWidth = isLargeTablet ? 680 : isTablet ? 600 : 420;

  return {
    width,
    height,
    isTablet,
    isLargeTablet,
    isSmallPhone,
    isLandscape,
    columns,
    maxContentWidth,
    modalMaxWidth,
  };
}
