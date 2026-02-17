import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useThemeColors, useThemeMode } from '@/context/theme';

type ThemeToggleProps = {
  style?: ViewStyle;
};

export function ThemeToggleButton({ style }: ThemeToggleProps) {
  const colors = useThemeColors();
  const { mode, toggleTheme } = useThemeMode();
  return (
    <Pressable style={[styles.button, style]} onPress={toggleTheme}>
      <MaterialIcons
        name={mode === 'dark' ? 'light-mode' : 'dark-mode'}
        size={20}
        color={colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
