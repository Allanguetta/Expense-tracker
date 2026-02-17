import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DrawerActions, useNavigation } from '@react-navigation/native';

import { useThemeColors } from '@/context/theme';

type MenuButtonProps = {
  style?: ViewStyle;
  iconColor?: string;
  size?: number;
};

export function MenuButton({ style, iconColor, size = 22 }: MenuButtonProps) {
  const navigation = useNavigation();
  const colors = useThemeColors();
  const resolvedColor = iconColor ?? colors.text;
  return (
    <Pressable
      style={[styles.button, style]}
      onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
      <MaterialIcons name="menu" size={size} color={resolvedColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
