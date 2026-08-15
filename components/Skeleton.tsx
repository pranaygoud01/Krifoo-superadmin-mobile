import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../constants/colors';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 6,
  style,
}) => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
};

// Composite Skeletons for different list cards
export const OrderCardSkeleton = () => (
  <View style={styles.card}>
    <View style={styles.header}>
      <Skeleton width={100} height={16} />
      <Skeleton width={80} height={20} borderRadius={10} />
    </View>
    <View style={styles.divider} />
    <View style={styles.body}>
      <View style={styles.row}>
        <Skeleton width={14} height={14} borderRadius={7} style={{ marginRight: 8 }} />
        <Skeleton width="60%" height={16} />
      </View>
      <View style={styles.row}>
        <Skeleton width={14} height={14} borderRadius={7} style={{ marginRight: 8 }} />
        <Skeleton width="40%" height={16} />
      </View>
      <View style={styles.row}>
        <Skeleton width="30%" height={14} style={{ marginRight: 8 }} />
        <Skeleton width="50%" height={14} />
      </View>
    </View>
    <View style={styles.divider} />
    <View style={styles.footer}>
      <View>
        <Skeleton width={70} height={10} style={{ marginBottom: 4 }} />
        <Skeleton width={50} height={18} />
      </View>
      <Skeleton width={110} height={28} borderRadius={8} />
    </View>
  </View>
);

export const OrderListSkeleton = () => (
  <View style={{ flex: 1, paddingVertical: 12 }}>
    <OrderCardSkeleton />
    <OrderCardSkeleton />
    <OrderCardSkeleton />
  </View>
);

export const RestaurantCardSkeleton = () => (
  <View style={styles.card}>
    <View style={styles.row}>
      <Skeleton width={60} height={60} borderRadius={8} style={{ marginRight: 12 }} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Skeleton width="70%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="50%" height={12} style={{ marginBottom: 4 }} />
        <Skeleton width="40%" height={10} />
      </View>
    </View>
    <View style={styles.divider} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Skeleton width={80} height={14} />
      <Skeleton width={100} height={20} borderRadius={10} />
    </View>
  </View>
);

export const RestaurantListSkeleton = () => (
  <View style={{ flex: 1, paddingVertical: 12 }}>
    <RestaurantCardSkeleton />
    <RestaurantCardSkeleton />
    <RestaurantCardSkeleton />
    <RestaurantCardSkeleton />
  </View>
);

export const UserCardSkeleton = () => (
  <View style={styles.card}>
    <View style={styles.row}>
      <Skeleton width={44} height={44} borderRadius={22} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Skeleton width="50%" height={15} style={{ marginBottom: 6 }} />
        <Skeleton width="70%" height={12} style={{ marginBottom: 4 }} />
        <Skeleton width="40%" height={10} />
      </View>
      <Skeleton width={80} height={20} borderRadius={10} />
    </View>
  </View>
);

export const UserListSkeleton = () => (
  <View style={{ flex: 1, paddingVertical: 12 }}>
    <UserCardSkeleton />
    <UserCardSkeleton />
    <UserCardSkeleton />
    <UserCardSkeleton />
    <UserCardSkeleton />
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#E2E8F0',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 10,
  },
  body: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
