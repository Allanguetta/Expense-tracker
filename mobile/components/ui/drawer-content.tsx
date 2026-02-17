import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';
import { StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { useThemeColors } from '@/context/theme';
import { useAuth } from '@/context/auth';
import type { UserProfile } from '@/lib/types';
import { RADIUS, SPACING } from '@/constants/ui-theme';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const colors = useThemeColors();
  const { request } = useAuth();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    let active = true;
    request<UserProfile>('/users/me')
      .then((data) => {
        if (!active) return;
        setUser(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);

  const displayName = useMemo(() => {
    if (!user?.email) return 'Account';
    const namePart = user.email.split('@')[0];
    const tokens = namePart.split(/[._-]+/).filter(Boolean);
    if (tokens.length === 0) return user.email;
    return tokens
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }, [user]);

  const initials = useMemo(() => {
    if (!user?.email) return 'ME';
    const namePart = user.email.split('@')[0];
    const tokens = namePart.split(/[._-]+/).filter(Boolean);
    if (tokens.length === 0) return user.email.slice(0, 2).toUpperCase();
    return tokens
      .slice(0, 2)
      .map((token) => token.charAt(0).toUpperCase())
      .join('');
  }, [user]);

  const styles = createStyles(colors);

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[styles.container, { paddingTop: SPACING.xl }]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.subtitle}>EUR Account</Text>
        </View>
        <ThemeToggleButton style={styles.themeToggle} />
      </View>

      <View style={styles.list}>
        <DrawerItemList {...props} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Built with care.</Text>
      </View>
    </DrawerContentScrollView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      paddingHorizontal: SPACING.lg,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingBottom: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      marginBottom: SPACING.lg,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primaryDark,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 18,
    },
    headerText: {
      flex: 1,
    },
    name: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 16,
    },
    subtitle: {
      color: colors.muted,
      marginTop: 4,
    },
    themeToggle: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      flex: 1,
    },
    footer: {
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    footerText: {
      color: colors.muted,
      fontSize: 12,
    },
  });
