import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { MenuButton } from '@/components/ui/menu-button';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Account, Category, RecurringPayment } from '@/lib/types';

type Frequency = 'weekly' | 'monthly';
type Kind = 'expense' | 'income';

export default function RecurringScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [items, setItems] = useState<RecurringPayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    amount: '',
    currency: 'EUR',
    kind: 'expense' as Kind,
    frequency: 'monthly' as Frequency,
    interval: '1',
    nextDueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  });
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const showSkeleton = loading && items.length === 0;

  const loadData = useCallback(async () => {
    const [payments, accountRows, categoryRows] = await Promise.all([
      request<RecurringPayment[]>('/recurring-payments'),
      request<Account[]>('/accounts'),
      request<Category[]>('/categories'),
    ]);
    setItems(payments);
    setAccounts(accountRows);
    setCategories(categoryRows);
    setSelectedAccountId((prev) => prev ?? accountRows[0]?.id ?? null);
  }, [request]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadData()
      .then(() => {
        if (!active) return;
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load recurring payments.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadData]);

  useEffect(() => {
    const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
    if (selectedCategory && selectedCategory.kind.toLowerCase() !== form.kind) {
      setSelectedCategoryId(null);
    }
  }, [categories, form.kind, selectedCategoryId]);

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.kind.toLowerCase() === form.kind),
    [categories, form.kind]
  );

  const resetForm = () => {
    setForm({
      name: '',
      amount: '',
      currency: 'EUR',
      kind: 'expense',
      frequency: 'monthly',
      interval: '1',
      nextDueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    });
    setSelectedCategoryId(null);
    setFormError('');
  };

  const handleCreate = async () => {
    const name = form.name.trim();
    const amount = Number(form.amount);
    const currency = form.currency.trim().toUpperCase();
    const interval = Number(form.interval);

    if (!selectedAccountId) {
      setFormError('Select an account.');
      return;
    }
    if (!name) {
      setFormError('Name is required.');
      return;
    }
    if (Number.isNaN(amount) || amount <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }
    if (currency.length !== 3) {
      setFormError('Currency must be 3 letters.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.nextDueDate)) {
      setFormError('Use due date format YYYY-MM-DD.');
      return;
    }
    if (Number.isNaN(interval) || interval < 1) {
      setFormError('Interval must be at least 1.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const created = await request<RecurringPayment>('/recurring-payments', {
        method: 'POST',
        body: {
          name,
          amount,
          currency,
          kind: form.kind,
          frequency: form.frequency,
          interval,
          next_due_date: form.nextDueDate,
          account_id: selectedAccountId,
          category_id: selectedCategoryId,
        },
      });
      setItems((prev) => [...prev, created].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)));
      resetForm();
      setShowForm(false);
    } catch {
      setFormError('Unable to create recurring payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (item: RecurringPayment) => {
    try {
      const response = await request<{ recurring_payment: RecurringPayment; transaction_id: number }>(
        `/recurring-payments/${item.id}/record-payment`,
        { method: 'POST', body: {} }
      );
      setItems((prev) =>
        prev
          .map((row) => (row.id === item.id ? response.recurring_payment : row))
          .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
      );
      Alert.alert('Payment recorded', `Transaction #${response.transaction_id} created.`);
    } catch {
      Alert.alert('Unable to record', 'Could not record this recurring payment.');
    }
  };

  const handleDelete = (item: RecurringPayment) => {
    Alert.alert('Delete recurring payment', `Delete ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await request(`/recurring-payments/${item.id}`, { method: 'DELETE' });
              setItems((prev) => prev.filter((row) => row.id !== item.id));
            } catch {
              setError('Unable to delete recurring payment.');
            }
          })();
        },
      },
    ]);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Recurring</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.iconButton} />
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              if (showForm) resetForm();
              setShowForm((prev) => !prev);
            }}>
            <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Never re-enter rent and subscriptions</Text>
        <Text style={styles.bannerSubtitle}>Create once, then record each payment in one tap.</Text>
      </View>

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>New recurring payment</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Rent"
              placeholderTextColor={colors.muted}
              value={form.name}
              onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
            />
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldGrow}>
              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.input}
                placeholder="850"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={form.amount}
                onChangeText={(text) => setForm((prev) => ({ ...prev, amount: text }))}
              />
            </View>
            <View style={styles.fieldGrow}>
              <Text style={styles.label}>Currency</Text>
              <TextInput
                style={styles.input}
                placeholder="EUR"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                value={form.currency}
                onChangeText={(text) => setForm((prev) => ({ ...prev, currency: text }))}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, form.kind === 'expense' && styles.chipActive]}
                onPress={() => setForm((prev) => ({ ...prev, kind: 'expense' }))}>
                <Text style={[styles.chipText, form.kind === 'expense' && styles.chipTextActive]}>
                  Expense
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, form.kind === 'income' && styles.chipActive]}
                onPress={() => setForm((prev) => ({ ...prev, kind: 'income' }))}>
                <Text style={[styles.chipText, form.kind === 'income' && styles.chipTextActive]}>
                  Income
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldGrow}>
              <Text style={styles.label}>Frequency</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, form.frequency === 'monthly' && styles.chipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, frequency: 'monthly' }))}>
                  <Text
                    style={[styles.chipText, form.frequency === 'monthly' && styles.chipTextActive]}>
                    Monthly
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, form.frequency === 'weekly' && styles.chipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, frequency: 'weekly' }))}>
                  <Text
                    style={[styles.chipText, form.frequency === 'weekly' && styles.chipTextActive]}>
                    Weekly
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.fieldGrow}>
              <Text style={styles.label}>Interval</Text>
              <TextInput
                style={styles.input}
                placeholder="1"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={form.interval}
                onChangeText={(text) => setForm((prev) => ({ ...prev, interval: text }))}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Next Due Date</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
              value={form.nextDueDate}
              onChangeText={(text) => setForm((prev) => ({ ...prev, nextDueDate: text }))}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Account</Text>
            <View style={styles.chipRow}>
              {accounts.map((account) => (
                <Pressable
                  key={account.id}
                  style={[styles.chip, selectedAccountId === account.id && styles.chipActive]}
                  onPress={() => setSelectedAccountId(account.id)}>
                  <Text
                    style={[
                      styles.chipText,
                      selectedAccountId === account.id && styles.chipTextActive,
                    ]}>
                    {account.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Category (optional)</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, selectedCategoryId === null && styles.chipActive]}
                onPress={() => setSelectedCategoryId(null)}>
                <Text
                  style={[styles.chipText, selectedCategoryId === null && styles.chipTextActive]}>
                  None
                </Text>
              </Pressable>
              {filteredCategories.map((category) => (
                <Pressable
                  key={category.id}
                  style={[styles.chip, selectedCategoryId === category.id && styles.chipActive]}
                  onPress={() => setSelectedCategoryId(category.id)}>
                  <Text
                    style={[
                      styles.chipText,
                      selectedCategoryId === category.id && styles.chipTextActive,
                    ]}>
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <Pressable
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleCreate}
            disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save recurring payment'}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        {showSkeleton ? (
          <RecurringSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && items.length === 0 ? (
              <Text style={styles.emptyText}>No recurring payments yet.</Text>
            ) : null}
            {items.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {item.kind === 'expense' ? '-' : '+'}
                    {item.currency} {item.amount.toFixed(2)} | {item.frequency} x{item.interval}
                  </Text>
                  <Text style={styles.rowSubtitle}>
                    Due {item.next_due_date}
                    {typeof item.days_until_due === 'number'
                      ? ` (${item.days_until_due} day${item.days_until_due === 1 ? '' : 's'})`
                      : ''}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable style={styles.actionButton} onPress={() => handleRecordPayment(item)}>
                    <MaterialIcons name="check-circle-outline" size={16} color={colors.accent} />
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => handleDelete(item)}>
                    <MaterialIcons name="delete-outline" size={16} color={colors.danger} />
                  </Pressable>
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
    banner: {
      backgroundColor: colors.accentSoft,
      padding: SPACING.lg,
      borderRadius: RADIUS.lg,
      marginBottom: SPACING.lg,
    },
    bannerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    bannerSubtitle: {
      marginTop: 6,
      color: colors.muted,
    },
    formCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
      gap: SPACING.md,
    },
    formTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    field: {
      gap: 6,
    },
    fieldRow: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
    fieldGrow: {
      flex: 1,
      gap: 6,
    },
    label: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.text,
      backgroundColor: colors.card,
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
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      alignItems: 'center',
      paddingVertical: SPACING.md,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: '700',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingBottom: SPACING.md,
      marginBottom: SPACING.sm,
    },
    rowLeft: {
      flex: 1,
      paddingRight: SPACING.sm,
    },
    rowTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 15,
    },
    rowSubtitle: {
      color: colors.muted,
      marginTop: 4,
    },
    rowActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    actionButton: {
      width: 30,
      height: 30,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
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

type RecurringStyles = ReturnType<typeof createStyles>;

function RecurringSkeleton({ styles }: { styles: RecurringStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonText}>
            <Skeleton width={140} height={12} />
            <Skeleton width={160} height={10} />
          </View>
          <View style={styles.skeletonText}>
            <Skeleton width={28} height={28} />
          </View>
        </View>
      ))}
    </View>
  );
}
