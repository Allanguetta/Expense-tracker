import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { ReportSummary } from '@/lib/types';

export default function ReportsScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [monthsRange, setMonthsRange] = useState(6);

  const loadReports = useCallback(async () => {
    const data = await request<ReportSummary>(`/reports/summary?months=${monthsRange}`);
    setSummary(data);
  }, [monthsRange, request]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadReports()
      .then(() => {
        if (!active) return;
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load reports.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadReports]);

  const months = useMemo(() => summary?.months ?? [], [summary]);
  const topCategories = useMemo(() => summary?.top_expense_categories ?? [], [summary]);
  const currency = summary?.currency ?? 'EUR';
  const maxFlow = useMemo(
    () =>
      Math.max(
        ...months.map((item) => Math.max(item.inflow, item.outflow, Math.abs(item.net))),
        1
      ),
    [months]
  );
  const showSkeleton = loading && !summary && !error;
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Reports</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.iconButton} />
        </View>
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.sectionTitle}>Range</Text>
        <View style={styles.chipRow}>
          {[3, 6, 12].map((monthsOption) => (
            <Pressable
              key={monthsOption}
              style={[styles.chip, monthsRange === monthsOption && styles.chipActive]}
              onPress={() => setMonthsRange(monthsOption)}>
              <Text style={[styles.chipText, monthsRange === monthsOption && styles.chipTextActive]}>
                {monthsOption} months
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        {showSkeleton ? (
          <ReportsSkeleton />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Monthly cashflow</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && months.length === 0 ? (
              <Text style={styles.emptyText}>No report data yet.</Text>
            ) : null}
            {months.map((item) => {
              const monthLabel = item.month.slice(0, 7);
              const inflowWidth = `${(item.inflow / maxFlow) * 100}%`;
              const outflowWidth = `${(item.outflow / maxFlow) * 100}%`;
              return (
                <View key={item.month} style={styles.row}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowTitle}>{monthLabel}</Text>
                    <Text style={styles.rowNet}>
                      Net {item.net >= 0 ? '+' : '-'}
                      {currency} {Math.abs(item.net).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.barWrap}>
                    <Text style={styles.barLabel}>In</Text>
                    <View style={styles.track}>
                      <View style={[styles.inflowFill, { width: inflowWidth }]} />
                    </View>
                    <Text style={styles.barValue}>
                      {currency} {item.inflow.toFixed(0)}
                    </Text>
                  </View>
                  <View style={styles.barWrap}>
                    <Text style={styles.barLabel}>Out</Text>
                    <View style={styles.track}>
                      <View style={[styles.outflowFill, { width: outflowWidth }]} />
                    </View>
                    <Text style={styles.barValue}>
                      {currency} {item.outflow.toFixed(0)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </View>

      <View style={styles.card}>
        {showSkeleton ? (
          <ReportsSkeleton />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Top expense categories</Text>
            {!loading && topCategories.length === 0 ? (
              <Text style={styles.emptyText}>No category spend yet.</Text>
            ) : null}
            {topCategories.map((item) => (
              <View key={`${item.category_id}-${item.category_name}`} style={styles.categoryRow}>
                <Text style={styles.categoryName}>{item.category_name || 'Uncategorized'}</Text>
                <Text style={styles.categoryValue}>
                  -{currency} {item.total_spent.toFixed(2)}
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
      gap: SPACING.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    filterCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      gap: SPACING.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    chip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
    },
    chipActive: {
      backgroundColor: colors.primaryDark,
      borderColor: colors.primaryDark,
    },
    chipText: {
      color: colors.text,
      fontWeight: '600',
    },
    chipTextActive: {
      color: '#fff',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    sectionTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 16,
    },
    row: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: SPACING.md,
      gap: SPACING.sm,
    },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    rowTitle: {
      color: colors.text,
      fontWeight: '700',
    },
    rowNet: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
    },
    barWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    barLabel: {
      width: 28,
      color: colors.muted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    track: {
      flex: 1,
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.ringTrack,
      overflow: 'hidden',
    },
    inflowFill: {
      height: '100%',
      backgroundColor: colors.accent,
    },
    outflowFill: {
      height: '100%',
      backgroundColor: colors.danger,
    },
    barValue: {
      minWidth: 70,
      textAlign: 'right',
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    categoryRow: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    categoryName: {
      color: colors.text,
      fontWeight: '600',
    },
    categoryValue: {
      color: colors.danger,
      fontWeight: '700',
    },
    error: {
      color: colors.danger,
      marginBottom: SPACING.sm,
    },
    emptyText: {
      color: colors.muted,
    },
  });

function ReportsSkeleton() {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={{ gap: 8 }}>
          <Skeleton width={120} height={12} />
          <Skeleton width="100%" height={8} />
          <Skeleton width="100%" height={8} />
        </View>
      ))}
    </View>
  );
}
