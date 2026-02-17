import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Account, Transaction } from '@/lib/types';

export default function AccountDetailScreen() {
  const { request } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const accountId = Number(id);
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accountId) {
      setError('Invalid account.');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      request<Account[]>('/accounts'),
      request<Transaction[]>(`/transactions?account_id=${accountId}&limit=50`),
    ])
      .then(([accountsData, transactionData]) => {
        if (!active) return;
        const found = accountsData.find((item) => item.id === accountId) ?? null;
        setAccount(found);
        setTransactions(transactionData);
        setError(found ? '' : 'Account not found.');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load account.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountId, request]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Account</Text>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.profileButton} />
        </View>
      </View>

      <View style={styles.hero}>
        {loading && !account ? (
          <AccountSkeleton />
        ) : account ? (
          <>
            <Text style={styles.heroLabel}>{account.account_type} account</Text>
            <Text style={styles.heroName}>{account.name}</Text>
            <Text style={styles.heroBalance}>
              {account.currency} {(account.balance ?? 0).toFixed(2)}
            </Text>
            <Text style={styles.heroHint}>{account.is_manual ? 'Manual' : 'Linked'}</Text>
          </>
        ) : (
          <Text style={styles.error}>{error || 'Account not found.'}</Text>
        )}
      </View>

      <View style={styles.card}>
        {loading && transactions.length === 0 ? (
          <TransactionsSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && transactions.length === 0 ? (
              <Text style={styles.emptyText}>No transactions yet.</Text>
            ) : null}
            {transactions.map((item) => (
              <View key={item.id} style={styles.row}>
                <View>
                  <Text style={styles.rowTitle}>{item.description}</Text>
                  <Text style={styles.rowSubtitle}>{item.occurred_at.slice(0, 10)}</Text>
                </View>
                <Text style={[styles.amount, item.amount > 0 && styles.amountPositive]}>
                  {item.amount > 0 ? '+' : '-'}
                  {item.currency} {Math.abs(item.amount).toFixed(2)}
                </Text>
              </View>
            ))}
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
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 12,
  },
  heroName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  heroBalance: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  heroHint: {
    color: '#fff',
    marginTop: SPACING.sm,
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
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowSubtitle: {
    marginTop: 4,
    color: colors.muted,
  },
  amount: {
    fontWeight: '700',
    color: colors.danger,
  },
  amountPositive: {
    color: colors.accent,
  },
  error: {
    color: colors.danger,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    color: colors.muted,
    marginBottom: SPACING.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonText: {
    gap: 8,
  },
  });

function AccountSkeleton() {
  return (
    <View style={{ gap: SPACING.sm }}>
      <Skeleton width={120} height={10} />
      <Skeleton width={160} height={14} />
      <Skeleton width={120} height={18} />
    </View>
  );
}

type AccountStyles = ReturnType<typeof createStyles>;

function TransactionsSkeleton({ styles }: { styles: AccountStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonText}>
            <Skeleton width={140} height={12} />
            <Skeleton width={90} height={10} />
          </View>
          <Skeleton width={70} height={12} />
        </View>
      ))}
    </View>
  );
}

