import { StyleProp, View, ViewStyle } from 'react-native';

import { useThemeColors } from '@/context/theme';

type SkeletonProps = {
  height?: number;
  width?: number | string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ height = 12, width = '100%', radius = 8, style }: SkeletonProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[{ backgroundColor: colors.ringTrack, height, width, borderRadius: radius }, style]}
    />
  );
}

export function SkeletonCircle({ size = 32, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton height={size} width={size} radius={size / 2} style={style} />;
}
