import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { UserProfile } from '@/lib/types';

const QUICK_ACTIONS = [
  { label: 'Edit profile', icon: 'edit' },
  { label: 'Verify identity', icon: 'verified-user' },
  { label: 'Support', icon: 'support-agent' },
];

const DETAILS = [
  { label: 'Phone', value: 'Add phone number', icon: 'call' },
  { label: 'Address', value: 'Add address', icon: 'home' },
  { label: 'Nationality', value: 'Add details', icon: 'public' },
];

const SECURITY = [
  { label: 'Passcode', value: 'Enabled', icon: 'lock-outline' },
  { label: 'Two-factor', value: 'Not set', icon: 'shield' },
  { label: 'Devices', value: '2 active', icon: 'devices' },
];

const PREFERENCES = [
  { label: 'Base currency', value: 'EUR', icon: 'payments' },
  { label: 'Language', value: 'English', icon: 'translate' },
  { label: 'Notifications', value: 'On', icon: 'notifications-active' },
];

export default function ProfileScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    request<UserProfile>('/users/me')
      .then((data) => {
        if (!active) return;
        setUser(data);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  const displayName = useMemo(() => {
    if (!user?.email) return 'Profile';
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

  const memberSince = user?.created_at ? user.created_at.slice(0, 10) : '—';

  const handleAction = (label: string) => {
    Alert.alert(label, 'This is a placeholder for now.');
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Profile</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} onPress={() => router.push('/(tabs)')}>
            <MaterialIcons name="home" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        {loading && !user ? (
          <ProfileSkeleton />
        ) : (
          <>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{displayName}</Text>
              <Text style={styles.heroEmail}>{user?.email ?? '—'}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Standard</Text>
                </View>
                <Text style={styles.heroHint}>Member since {memberSince}</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionRow}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.label}
              style={styles.actionCard}
              onPress={() => handleAction(action.label)}>
              <MaterialIcons name={action.icon as never} size={20} color={colors.primary} />
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Personal details</Text>
        {DETAILS.map((item) => (
          <View key={item.label} style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={item.icon as never} size={18} color={colors.text} />
              </View>
              <View>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowValue}>{item.value}</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Security</Text>
        {SECURITY.map((item) => (
          <View key={item.label} style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={item.icon as never} size={18} color={colors.text} />
              </View>
              <View>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowValue}>{item.value}</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        {PREFERENCES.map((item) => (
          <View key={item.label} style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.iconWrap}>
                <MaterialIcons name={item.icon as never} size={18} color={colors.text} />
              </View>
              <View>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowValue}>{item.value}</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </View>
        ))}
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
  hero: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 20,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  heroEmail: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  heroHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
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
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  actionText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  rowValue: {
    marginTop: 4,
    color: colors.muted,
  },
  error: {
    color: colors.danger,
    marginBottom: SPACING.md,
  },
  });

function ProfileSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
      <Skeleton width={64} height={64} radius={24} />
      <View style={{ gap: 8 }}>
        <Skeleton width={140} height={14} />
        <Skeleton width={180} height={10} />
        <Skeleton width={120} height={10} />
      </View>
    </View>
  );
}

