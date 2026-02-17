import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors, useThemeMode } from '@/context/theme';

const SETTINGS = [
  { label: 'Profile', icon: 'person-outline', href: '/profile' },
  { label: 'Connected Accounts', icon: 'link', href: '/accounts' },
  { label: 'Sync Coinbase', icon: 'sync', action: 'sync' },
  { label: 'Export Data', icon: 'download', action: 'export' },
  { label: 'Logout', icon: 'logout', action: 'logout' },
];

export default function SettingsScreen() {
  const { signOut, loading, request } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();
  const { mode, toggleTheme } = useThemeMode();
  const [loggingOut, setLoggingOut] = useState(false);
  const showSkeleton = loading;

  const handleSync = async () => {
    try {
      const response = await request<{ sync_id: number; status: string }>('/crypto/sync/coinbase', {
        method: 'POST',
      });
      Alert.alert('Coinbase sync queued', `Sync ${response.sync_id} is ${response.status}.`);
    } catch {
      Alert.alert('Sync failed', 'Unable to queue Coinbase sync.');
    }
  };

  const handleExport = () => {
    Alert.alert('Export data', 'Export is not available in this MVP yet.');
  };

  const executeLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

  const confirmLogout = () => {
    if (loggingOut) return;
    Alert.alert(
      'Log out',
      'You will need to sign in again to access your accounts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => {
            void executeLogout();
          },
        },
      ]
    );
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Settings</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.iconButton} />
        </View>
      </View>

      <View style={styles.card}>
        {showSkeleton ? (
          <SettingsSkeleton styles={styles} />
        ) : (
          <>
            <Pressable style={styles.row} onPress={toggleTheme}>
              <View style={styles.rowLeft}>
                <View style={styles.iconWrap}>
                  <MaterialIcons name="brightness-6" size={20} color={colors.text} />
                </View>
                <View style={styles.rowTextBlock}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    Theme
                  </Text>
                  <Text style={styles.rowValue}>{mode === 'dark' ? 'Dark' : 'Light'}</Text>
                </View>
              </View>
              <MaterialIcons style={styles.rowChevron} name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {SETTINGS.map((item) => {
            const isLogout = item.action === 'logout';
            const isDisabled = isLogout && loggingOut;
            return (
              <Pressable
                key={item.label}
                style={[styles.row, isDisabled && styles.rowDisabled]}
                disabled={isDisabled}
                onPress={() => {
                  if (item.href) {
                    router.push(item.href as never);
                    return;
                  }
                  if (isLogout) {
                    confirmLogout();
                    return;
                  }
                  if (item.action === 'sync') {
                    handleSync();
                    return;
                  }
                  if (item.action === 'export') {
                    handleExport();
                  }
                }}>
                <View style={styles.rowLeft}>
                  <View style={styles.iconWrap}>
                    <MaterialIcons name={item.icon as never} size={20} color={colors.text} />
                  </View>
                  <View style={styles.rowTextBlock}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {isLogout && loggingOut ? 'Logging out...' : item.label}
                    </Text>
                  </View>
                </View>
                <MaterialIcons style={styles.rowChevron} name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            );
          })}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'nowrap',
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
    minWidth: 0,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  rowValue: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    flexShrink: 1,
  },
  rowChevron: {
    marginLeft: SPACING.sm,
    flexShrink: 0,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skeletonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  });

type SettingsStyles = ReturnType<typeof createStyles>;

function SettingsSkeleton({ styles }: { styles: SettingsStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonLeft}>
            <Skeleton width={36} height={36} radius={12} />
            <Skeleton width={120} height={12} />
          </View>
          <Skeleton width={16} height={12} />
        </View>
      ))}
    </View>
  );
}

