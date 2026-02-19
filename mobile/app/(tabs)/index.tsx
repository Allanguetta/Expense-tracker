import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Category, DashboardSummary } from '@/lib/types';
import { useRouter } from 'expo-router';

type DashboardInsight = DashboardSummary['insights'][number];
type DismissedInsightMap = Record<string, string>;

const DISMISSED_INSIGHTS_KEY = 'DASHBOARD_DISMISSED_INSIGHTS_V1';

function insightSignature(insight: DashboardInsight): string {
  return `${insight.level}|${insight.title}|${insight.message}`;
}

async function readDismissedInsights(): Promise<DismissedInsightMap> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return {};
      const raw = window.localStorage.getItem(DISMISSED_INSIGHTS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as DismissedInsightMap;
      }
      return {};
    }
    const raw = await SecureStore.getItemAsync(DISMISSED_INSIGHTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as DismissedInsightMap;
    }
    return {};
  } catch {
    return {};
  }
}

async function writeDismissedInsights(map: DismissedInsightMap): Promise<void> {
  try {
    const serialized = JSON.stringify(map);
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(DISMISSED_INSIGHTS_KEY, serialized);
      return;
    }
    await SecureStore.setItemAsync(DISMISSED_INSIGHTS_KEY, serialized);
  } catch {
    return;
  }
}

export default function DashboardScreen() {
  const { request } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();
  const mountedRef = useRef(true);
  const loadedOnceRef = useRef(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [payingRecurringId, setPayingRecurringId] = useState<number | null>(null);
  const [dismissedInsights, setDismissedInsights] = useState<DismissedInsightMap>({});
  const [dismissedHydrated, setDismissedHydrated] = useState(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readDismissedInsights()
      .then((value) => {
        if (!active) return;
        setDismissedInsights(value);
      })
      .finally(() => {
        if (active) {
          setDismissedHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dismissedHydrated) return;
    writeDismissedInsights(dismissedInsights).catch(() => undefined);
  }, [dismissedHydrated, dismissedInsights]);

  const loadDashboard = useCallback(async () => {
    try {
      const [summaryData, categoryData] = await Promise.all([
        request<DashboardSummary>('/dashboard/summary?due_alert_days=3'),
        request<Category[]>('/categories'),
      ]);
      if (!mountedRef.current) return;
      setSummary(summaryData);
      setCategories(categoryData);
      setError('');
    } catch {
      if (!mountedRef.current) return;
      setError('Unable to load dashboard data.');
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const firstLoad = !loadedOnceRef.current;
        if (firstLoad && mountedRef.current) {
          setLoading(true);
        }
        await loadDashboard();
        if (firstLoad && active && mountedRef.current) {
          setLoading(false);
          loadedOnceRef.current = true;
        }
      };
      void run();
      return () => {
        active = false;
      };
    }, [loadDashboard])
  );

  const categoryColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    const fallback = ['#0EA5A4', '#F97316', '#EF4444', '#3B82F6', '#F59E0B', '#10B981'];
    categories.forEach((category, index) => {
      map[category.id] = category.color || fallback[index % fallback.length];
    });
    return map;
  }, [categories]);

  const categoryRows = useMemo(() => {
    const spend = summary?.spend_by_category ?? [];
    if (!spend.length) {
      return [];
    }
    const sorted = [...spend].sort((a, b) => b.total_spent - a.total_spent);
    const max = Math.max(...sorted.map((row) => row.total_spent), 1);
    const fallback = ['#0EA5A4', '#F97316', '#EF4444', '#3B82F6', '#F59E0B', '#10B981'];
    return sorted.map((row, index) => ({
      id: row.category_id ?? index,
      label: row.category_name || 'Uncategorized',
      value: row.total_spent,
      progress: row.total_spent / max,
      color:
        row.category_id && categoryColorMap[row.category_id]
          ? categoryColorMap[row.category_id]
          : fallback[index % fallback.length],
    }));
  }, [categoryColorMap, summary]);

  const pieData = useMemo(() => {
    return categoryRows.slice(0, 6).map((row) => ({
      label: row.label || 'Other',
      value: row.value,
      color: row.color,
    }));
  }, [categoryRows]);

  const totalSpent = useMemo(() => {
    return categoryRows.reduce((sum, row) => sum + row.value, 0);
  }, [categoryRows]);

  const safeToSpend = Math.max(summary?.cashflow.net ?? 0, 0);
  const netWorth = summary?.net_worth.net_worth ?? 0;
  const accountsTotal = summary?.net_worth.accounts_total ?? 0;
  const debtsTotal = summary?.net_worth.debts_total ?? 0;
  const cryptoTotal = summary?.net_worth.crypto_total ?? 0;
  const totalAssets = accountsTotal + cryptoTotal;
  const currency = summary?.net_worth.currency || 'EUR';
  const showSkeleton = loading && !summary && !error;
  const isNegative = netWorth < 0;
  const topCategories = categoryRows.slice(0, 3);
  const upcomingRecurring = summary?.upcoming_recurring ?? [];
  const insights = useMemo(() => summary?.insights ?? [], [summary]);
  const visibleInsights = useMemo(() => {
    if (!dismissedHydrated) {
      return [];
    }
    return insights.filter((item) => dismissedInsights[item.id] !== insightSignature(item));
  }, [dismissedHydrated, dismissedInsights, insights]);
  const isEmpty =
    !showSkeleton &&
    !error &&
    totalAssets === 0 &&
    debtsTotal === 0 &&
    categoryRows.length === 0 &&
    upcomingRecurring.length === 0;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [loadDashboard]);

  const handleMarkRecurringPaid = useCallback(
    async (paymentId: number) => {
      setPayingRecurringId(paymentId);
      try {
        await request(`/recurring-payments/${paymentId}/record-payment`, {
          method: 'POST',
          body: {},
        });
        await loadDashboard();
      } catch {
        Alert.alert('Unable to mark paid', 'Could not update this recurring payment.');
      } finally {
        if (mountedRef.current) {
          setPayingRecurringId((current) => (current === paymentId ? null : current));
        }
      }
    },
    [loadDashboard, request]
  );

  const dismissInsight = useCallback((insight: DashboardInsight) => {
    setDismissedInsights((prev) => ({
      ...prev,
      [insight.id]: insightSignature(insight),
    }));
  }, []);

  const getInsightAction = useCallback(
    (insight: DashboardInsight) => {
      if (insight.id.startsWith('budget-over-') || insight.id.startsWith('budget-risk-')) {
        return {
          label: 'Open budgets',
          onPress: () => router.push('/budgets'),
        };
      }
      if (insight.id === 'net-worth-negative') {
        return {
          label: 'Open debts',
          onPress: () => router.push('/debts'),
        };
      }
      if (insight.id === 'spending-trend-up' || insight.id === 'spending-trend-down') {
        return {
          label: 'Open transactions',
          onPress: () => router.push('/transactions'),
        };
      }
      if (insight.id === 'recurring-due-soon') {
        return {
          label: 'Open recurring',
          onPress: () => router.push('/recurring'),
        };
      }
      return null;
    },
    [router]
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <View style={styles.header}>
        <MenuButton style={styles.iconButton} />
        <View style={styles.brandBadge}>
          <MaterialIcons name="attach-money" size={20} color="#fff" />
        </View>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.iconButton} />
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.pageTitle}>Financial Overview</Text>
        <Text style={styles.pageSubtitle}>Your financial summary at a glance</Text>
      </View>

      {isEmpty ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="insights" size={22} color={colors.primary} />
          </View>
          <View style={styles.emptyTextBlock}>
            <Text style={styles.emptyTitle}>Start tracking your money</Text>
            <Text style={styles.emptyCopy}>
              Add your first account or transaction to unlock charts and insights.
            </Text>
          </View>
          <View style={styles.emptyActions}>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/accounts')}>
              <Text style={styles.primaryButtonText}>Add account</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push('/transactions')}>
              <Text style={styles.secondaryButtonText}>Add transaction</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {isNegative && !showSkeleton ? (
        <View style={styles.alertCard}>
          <View style={styles.alertIcon}>
            <MaterialIcons name="error-outline" size={18} color={colors.danger} />
          </View>
          <View style={styles.alertText}>
            <Text style={styles.alertTitle}>Negative Balance Alert</Text>
            <Text style={styles.alertSubtitle}>
              Net worth is below zero. Review debts and spending.
            </Text>
          </View>
        </View>
      ) : null}

      {!showSkeleton && visibleInsights.length > 0 ? (
        <View style={styles.insightsCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.cardTitle}>Insights</Text>
              <Text style={styles.chartSubtitle}>Smart highlights for this period</Text>
            </View>
          </View>
          <View style={styles.insightsList}>
            {visibleInsights.map((item) => {
              const action = getInsightAction(item);
              return (
              <View key={item.id} style={styles.insightRow}>
                <View
                  style={[
                    styles.insightIcon,
                    item.level === 'danger' && styles.insightIconDanger,
                    item.level === 'warning' && styles.insightIconWarning,
                    item.level === 'success' && styles.insightIconSuccess,
                  ]}>
                  <MaterialIcons
                    name={
                      item.level === 'danger'
                        ? 'error-outline'
                        : item.level === 'warning'
                          ? 'warning-amber'
                          : item.level === 'success'
                            ? 'check-circle-outline'
                            : 'info-outline'
                    }
                    size={16}
                    color={
                      item.level === 'danger'
                        ? colors.danger
                        : item.level === 'warning'
                          ? '#f59e0b'
                          : item.level === 'success'
                            ? colors.primary
                            : colors.text
                    }
                  />
                </View>
                <View style={styles.insightText}>
                  <Text style={styles.insightTitle}>{item.title}</Text>
                  <Text style={styles.insightMessage}>{item.message}</Text>
                  {action ? (
                    <Pressable
                      style={styles.insightActionButton}
                      onPress={action.onPress}>
                      <Text style={styles.insightActionText}>{action.label}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  style={styles.insightDismissButton}
                  onPress={() => dismissInsight(item)}
                  hitSlop={6}>
                  <MaterialIcons name="close" size={14} color={colors.muted} />
                </Pressable>
              </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {!showSkeleton && upcomingRecurring.length > 0 ? (
        <View style={styles.recurringCard}>
          <View style={styles.recurringHeader}>
            <View style={styles.recurringIcon}>
              <MaterialIcons name="repeat" size={18} color={colors.primary} />
            </View>
            <View style={styles.recurringHeaderText}>
              <Text style={styles.recurringTitle}>Due In The Next 3 Days</Text>
              <Text style={styles.recurringSubtitle}>
                {upcomingRecurring.length} recurring payment{upcomingRecurring.length === 1 ? '' : 's'} due soon.
              </Text>
            </View>
            <Pressable style={styles.recurringOpen} onPress={() => router.push('/transactions')}>
              <MaterialIcons name="chevron-right" size={18} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.recurringList}>
            {upcomingRecurring.slice(0, 3).map((item) => (
              <View key={item.id} style={styles.recurringRow}>
                <View style={styles.recurringRowHeader}>
                  <View style={styles.recurringRowInfo}>
                    <Text style={styles.recurringRowTitle}>{item.name}</Text>
                    <Text style={styles.recurringRowMeta}>
                      {item.currency} {item.amount.toFixed(2)} | {item.frequency} | due in{' '}
                      {item.days_until_due} day
                      {item.days_until_due === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.recurringPaidButton,
                      payingRecurringId === item.id && styles.recurringPaidButtonDisabled,
                    ]}
                    onPress={() => void handleMarkRecurringPaid(item.id)}
                    disabled={payingRecurringId === item.id}>
                    <Text style={styles.recurringPaidText}>
                      {payingRecurringId === item.id ? 'Saving...' : 'Mark paid'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.heroCard, isNegative ? styles.heroNegative : styles.heroPositive]}>
        {showSkeleton ? (
          <HeroSkeleton styles={styles} />
        ) : (
          <>
            <Text style={styles.heroLabel}>Net Worth</Text>
            <Text style={[styles.heroValue, isNegative && styles.heroValueNegative]}>
              {currency} {netWorth.toFixed(2)}
            </Text>
            <Text style={styles.heroMeta}>Accounts + Crypto − Debts</Text>
            <View style={styles.heroRow}>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillLabel}>Safe to Spend</Text>
                <Text style={styles.heroPillValue}>
                  {currency} {safeToSpend.toFixed(2)}
                </Text>
              </View>
              <View style={styles.heroMetrics}>
                <Text style={styles.heroMetric}>
                  Assets {currency} {totalAssets.toFixed(2)}
                </Text>
                <Text style={styles.heroMetric}>
                  Debts {currency} {debtsTotal.toFixed(2)}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      <View style={styles.metricRow}>
        {showSkeleton ? (
          <MetricsSkeleton styles={styles} />
        ) : (
          <>
            <View style={[styles.metricCard, styles.metricPositive]}>
              <View style={styles.metricIcon}>
                <MaterialIcons name="account-balance-wallet" size={20} color={colors.primary} />
              </View>
              <Text style={styles.metricLabel}>Total Assets</Text>
              <Text style={styles.metricValue}>
                {currency} {totalAssets.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.metricCard, styles.metricNegative]}>
              <View style={[styles.metricIcon, styles.metricIconDanger]}>
                <MaterialIcons name="payments" size={20} color={colors.danger} />
              </View>
              <Text style={styles.metricLabel}>Total Debts</Text>
              <Text style={styles.metricValue}>
                {currency} {debtsTotal.toFixed(2)}
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.chartCard}>
        {showSkeleton ? (
          <ChartSkeleton styles={styles} />
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.cardTitle}>All Spending by Category</Text>
                <Text style={styles.chartSubtitle}>This month</Text>
              </View>
              <View style={styles.chartMeta}>
                <Text style={styles.chartValue}>
                  {currency} {totalSpent.toFixed(2)}
                </Text>
                <Text style={styles.chartSubtitle}>Total spent</Text>
              </View>
            </View>
            {pieData.length === 0 ? (
              <Text style={styles.emptyText}>No spending data yet.</Text>
            ) : (
              <>
                <View style={styles.pieWrap}>
                  <PieChart data={pieData} size={190} />
                </View>
                <View style={styles.legendGrid}>
                  {pieData.map((item) => (
                    <View key={item.label} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendLabel}>
                        {item.label} {Math.round((item.value / Math.max(totalSpent, 1)) * 100)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </View>

      <View style={styles.categoryCard}>
        {showSkeleton ? (
          <CategorySkeleton styles={styles} />
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.cardTitle}>Top Spending Categories</Text>
                <Text style={styles.chartSubtitle}>Month to date</Text>
              </View>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && topCategories.length === 0 ? (
              <Text style={styles.emptyText}>No spending data yet.</Text>
            ) : null}
            {topCategories.map((item) => (
              <View key={item.label} style={styles.row}>
                <View style={styles.rowInfo}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <View>
                    <Text style={styles.rowTitle}>{item.label}</Text>
                    <Text style={styles.rowSubtitle}>Spent this month</Text>
                  </View>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>
                    -{currency} {item.value.toFixed(2)}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${item.progress * 100}%`, backgroundColor: item.color },
                      ]}
                    />
                  </View>
                </View>
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
      marginBottom: SPACING.md,
    },
    headerActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    iconButton: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOpacity: 1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    brandBadge: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOpacity: 1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    titleBlock: {
      marginBottom: SPACING.lg,
    },
    pageTitle: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
    },
    pageSubtitle: {
      color: colors.muted,
      marginTop: 6,
    },
    emptyCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
      borderWidth: 1,
      borderColor: colors.line,
      gap: SPACING.md,
    },
    emptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTextBlock: {
      gap: 6,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    emptyCopy: {
      color: colors.muted,
    },
    emptyActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: '700',
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '600',
    },
    alertCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: 'rgba(248, 113, 113, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(248, 113, 113, 0.35)',
      marginBottom: SPACING.lg,
    },
    alertIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: 'rgba(248, 113, 113, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertText: {
      flex: 1,
    },
    alertTitle: {
      color: colors.danger,
      fontWeight: '700',
    },
    alertSubtitle: {
      color: colors.muted,
      marginTop: 4,
    },
    recurringCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      gap: SPACING.md,
    },
    insightsCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
      gap: SPACING.md,
    },
    insightsList: {
      gap: SPACING.sm,
    },
    insightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: SPACING.sm,
    },
    insightIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      backgroundColor: colors.ringTrack,
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightIconDanger: {
      backgroundColor: 'rgba(248, 113, 113, 0.2)',
    },
    insightIconWarning: {
      backgroundColor: 'rgba(245, 158, 11, 0.18)',
    },
    insightIconSuccess: {
      backgroundColor: colors.accentSoft,
    },
    insightText: {
      flex: 1,
      gap: 2,
    },
    insightTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    insightMessage: {
      color: colors.muted,
      fontSize: 12,
    },
    insightActionButton: {
      alignSelf: 'flex-start',
      marginTop: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
    },
    insightActionText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    insightDismissButton: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      marginTop: 2,
    },
    recurringHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    recurringIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recurringHeaderText: {
      flex: 1,
    },
    recurringTitle: {
      color: colors.text,
      fontWeight: '700',
    },
    recurringSubtitle: {
      color: colors.muted,
      marginTop: 2,
      fontSize: 12,
    },
    recurringOpen: {
      width: 28,
      height: 28,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    recurringList: {
      gap: SPACING.sm,
    },
    recurringRow: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: SPACING.sm,
    },
    recurringRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    recurringRowInfo: {
      flex: 1,
    },
    recurringRowTitle: {
      color: colors.text,
      fontWeight: '600',
    },
    recurringRowMeta: {
      color: colors.muted,
      marginTop: 4,
      fontSize: 12,
    },
    recurringPaidButton: {
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.accentSoft,
      borderRadius: 999,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
    },
    recurringPaidButtonDisabled: {
      opacity: 0.6,
    },
    recurringPaidText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    heroCard: {
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
      backgroundColor: colors.card,
      shadowColor: colors.shadow,
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 5,
    },
    heroPositive: {
      borderWidth: 1,
      borderColor: 'rgba(0, 140, 132, 0.4)',
    },
    heroNegative: {
      borderWidth: 1,
      borderColor: 'rgba(248, 113, 113, 0.5)',
    },
    heroLabel: {
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontSize: 12,
      fontWeight: '600',
    },
    heroValue: {
      fontSize: 34,
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
    },
    heroValueNegative: {
      color: colors.danger,
    },
    heroMeta: {
      color: colors.muted,
      marginTop: 6,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      gap: SPACING.md,
      marginTop: SPACING.lg,
    },
    heroPill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
      minWidth: 150,
    },
    heroPillLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
    },
    heroPillValue: {
      color: colors.text,
      fontWeight: '700',
      marginTop: 6,
    },
    heroMetrics: {
      flex: 1,
      gap: 6,
    },
    heroMetric: {
      color: colors.muted,
      fontSize: 12,
    },
    metricRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    metricCard: {
      flex: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
    },
    metricPositive: {
      backgroundColor: colors.accentSoft,
      borderColor: 'rgba(0, 140, 132, 0.35)',
    },
    metricNegative: {
      backgroundColor: 'rgba(248, 113, 113, 0.12)',
      borderColor: 'rgba(248, 113, 113, 0.35)',
    },
    metricIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: 'rgba(0, 140, 132, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
    },
    metricIconDanger: {
      backgroundColor: 'rgba(248, 113, 113, 0.2)',
    },
    metricLabel: {
      color: colors.muted,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontWeight: '600',
    },
    metricValue: {
      marginTop: 6,
      fontWeight: '700',
      color: colors.text,
    },
    chartCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      shadowColor: colors.shadow,
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
      marginBottom: SPACING.lg,
    },
    categoryCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      shadowColor: colors.shadow,
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
      marginBottom: SPACING.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: SPACING.md,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    chartMeta: {
      alignItems: 'flex-end',
    },
    chartValue: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    chartSubtitle: {
      color: colors.muted,
      marginTop: 4,
    },
    pieWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.lg,
    },
    legendGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingRight: SPACING.md,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
    },
    legendLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.sm,
    },
    rowInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flex: 1,
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
    rowRight: {
      alignItems: 'flex-end',
      minWidth: 120,
    },
    rowValue: {
      color: colors.danger,
      fontWeight: '700',
    },
    progressTrack: {
      width: 100,
      height: 6,
      backgroundColor: colors.ringTrack,
      borderRadius: 999,
      marginTop: 6,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    error: {
      color: colors.danger,
      marginBottom: SPACING.sm,
    },
    emptyText: {
      color: colors.muted,
      marginBottom: SPACING.md,
    },
    heroSkeleton: {
      gap: SPACING.md,
    },
    metricSkeleton: {
      flex: 1,
      minHeight: 100,
    },
    chartSkeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      marginTop: SPACING.md,
    },
    chartSkeletonCircle: {
      width: 160,
      height: 160,
      borderRadius: 80,
    },
    categorySkeletonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
  });

type DashboardStyles = ReturnType<typeof createStyles>;

function HeroSkeleton({ styles }: { styles: DashboardStyles }) {
  return (
    <View style={styles.heroSkeleton}>
      <Skeleton width={120} height={12} />
      <Skeleton width={180} height={28} />
      <Skeleton width={160} height={10} />
      <View style={styles.heroRow}>
        <Skeleton width={150} height={50} radius={16} />
        <View style={{ gap: 8 }}>
          <Skeleton width={120} height={10} />
          <Skeleton width={120} height={10} />
        </View>
      </View>
    </View>
  );
}

function MetricsSkeleton({ styles }: { styles: DashboardStyles }) {
  return (
    <>
      <Skeleton style={styles.metricSkeleton} radius={RADIUS.lg} />
      <Skeleton style={styles.metricSkeleton} radius={RADIUS.lg} />
    </>
  );
}

function ChartSkeleton({ styles }: { styles: DashboardStyles }) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Skeleton width={140} height={14} />
        <Skeleton width={80} height={12} />
      </View>
      <View style={styles.chartSkeletonRow}>
        <Skeleton style={styles.chartSkeletonCircle} radius={80} />
        <View style={{ gap: 10, flex: 1 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} width={120} height={10} />
          ))}
        </View>
      </View>
    </View>
  );
}

function CategorySkeleton({ styles }: { styles: DashboardStyles }) {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Skeleton width={160} height={14} />
      </View>
      {Array.from({ length: 3 }).map((_, index) => (
        <View key={index} style={styles.categorySkeletonRow}>
          <View style={{ gap: 8 }}>
            <Skeleton width={120} height={12} />
            <Skeleton width={90} height={10} />
          </View>
          <Skeleton width={80} height={12} />
        </View>
      ))}
    </View>
  );
}

type PieDatum = {
  label: string;
  value: number;
  color: string;
};

function PieChart({ data, size }: { data: PieDatum[]; size: number }) {
  const radius = size / 2;
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let startAngle = 0;

  return (
    <Svg width={size} height={size}>
      {data.map((item, index) => {
        const angle = (item.value / total) * 360;
        const endAngle = startAngle + angle;
        const path = describeArc(radius, radius, radius, startAngle, endAngle);
        startAngle = endAngle;
        return <Path key={`${item.label}-${index}`} d={path} fill={item.color} />;
      })}
    </Svg>
  );
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

