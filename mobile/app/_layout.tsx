import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';

import { AuthProvider, useAuth } from '@/context/auth';
import { ThemeProvider, useThemeColors, useThemeMode } from '@/context/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    const baseStyle = { fontFamily: 'SpaceGrotesk_400Regular' };

    const mergeWithBaseStyle = (style: unknown): unknown[] => {
      const merged: unknown[] = [baseStyle];
      if (Array.isArray(style)) {
        for (const item of style) {
          merged.push(item);
        }
      } else if (style) {
        merged.push(style);
      }
      return merged;
    };

    const existingTextStyle = Text.defaultProps?.style;
    Text.defaultProps = Text.defaultProps ?? {};
    Text.defaultProps.style = mergeWithBaseStyle(existingTextStyle);
    const existingInputStyle = TextInput.defaultProps?.style;
    TextInput.defaultProps = TextInput.defaultProps ?? {};
    TextInput.defaultProps.style = mergeWithBaseStyle(existingInputStyle);
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AppProviders />
    </ThemeProvider>
  );
}

function AppProviders() {
  const { mode } = useThemeMode();
  return (
    <SafeAreaProvider>
      <NavigationThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </SafeAreaView>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} translucent={false} />
      </NavigationThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const colors = useThemeColors();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, loading, router, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
