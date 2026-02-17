import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Account, Category, Transaction } from '@/lib/types';

const EXPENSE_COLORS = ['#0EA5A4', '#F97316', '#EF4444', '#3B82F6', '#F59E0B', '#10B981'];
const INCOME_COLORS = ['#10B981', '#14B8A6', '#22C55E', '#84CC16', '#06B6D4', '#0EA5E9'];
type RecurringFrequency = 'weekly' | 'monthly';

function computeNextRecurringDate(dateText: string, frequency: RecurringFrequency): string {
  const base = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return dateText;
  }
  if (frequency === 'weekly') {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString().slice(0, 10);
  }
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const targetMonth = month + 1;
  const nextYear = year + Math.floor(targetMonth / 12);
  const nextMonth = targetMonth % 12;
  const maxDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const nextDate = new Date(Date.UTC(nextYear, nextMonth, Math.min(day, maxDay)));
  return nextDate.toISOString().slice(0, 10);
}

export default function TransactionsScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [items, setItems] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('monthly');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isExpense, setIsExpense] = useState(true);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'EUR',
    occurredAt: new Date().toISOString().slice(0, 10),
  });
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    accountId: null as number | null,
    categoryId: null as number | null,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const showSkeleton = loading && items.length === 0 && !error;
  const isEditing = editingId !== null;
  const categoryKind = isExpense ? 'expense' : 'income';
  const categoryKindLabel = isExpense ? 'Expense' : 'Income';

  const buildQuery = useCallback((activeFilters: typeof filters) => {
    const params = new URLSearchParams();
    if (activeFilters.startDate) {
      params.set('start_date', `${activeFilters.startDate}T00:00:00Z`);
    }
    if (activeFilters.endDate) {
      params.set('end_date', `${activeFilters.endDate}T23:59:59Z`);
    }
    if (activeFilters.accountId) {
      params.set('account_id', String(activeFilters.accountId));
    }
    if (activeFilters.categoryId) {
      params.set('category_id', String(activeFilters.categoryId));
    }
    params.set('limit', '50');
    return params.toString();
  }, []);

  const loadTransactions = useCallback(
    async (activeFilters: typeof filters) => {
      const query = buildQuery(activeFilters);
      const path = query ? `/transactions?${query}` : '/transactions';
      return request<Transaction[]>(path);
    },
    [buildQuery, request]
  );

  const loadMetadata = useCallback(async () => {
    const [accountsData, categoriesData] = await Promise.all([
      request<Account[]>('/accounts'),
      request<Category[]>('/categories'),
    ]);
    setAccounts(accountsData);
    setCategories(categoriesData);
    setSelectedAccountId((prev) => {
      if (prev && accountsData.some((account) => account.id === prev)) {
        return prev;
      }
      return accountsData[0]?.id ?? null;
    });
  }, [request]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadTransactions(appliedFilters)
      .then((transactionsData) => {
        if (!active) return;
        setItems(transactionsData);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load transactions.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedFilters, loadTransactions]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadMetadata()
        .then(() => {
          if (!active) return;
          setError((prev) => (prev === 'Unable to load metadata.' ? '' : prev));
        })
        .catch(() => {
          if (!active) return;
          setError('Unable to load metadata.');
        });
      return () => {
        active = false;
      };
    }, [loadMetadata])
  );

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }
    const match = categories.find((category) => category.id === selectedCategoryId);
    if (!match || match.kind.toLowerCase() !== categoryKind) {
      setSelectedCategoryId(null);
    }
  }, [categories, categoryKind, selectedCategoryId]);

  const resetForm = () => {
    setForm({
      description: '',
      amount: '',
      currency: 'EUR',
      occurredAt: new Date().toISOString().slice(0, 10),
    });
    setIsExpense(true);
    setIsRecurring(false);
    setRecurringFrequency('monthly');
    setEditingId(null);
    setSelectedCategoryId(null);
    setSelectedAccountId(accounts[0]?.id ?? null);
    setFormError('');
  };

  const handleSave = async () => {
    const description = form.description.trim();
    const amountValue = Number(form.amount);
    const currency = form.currency.trim().toUpperCase();
    const dateText = form.occurredAt.trim();

    if (!selectedAccountId) {
      setFormError('Select an account first.');
      return;
    }
    if (!description) {
      setFormError('Description is required.');
      return;
    }
    if (Number.isNaN(amountValue) || amountValue === 0) {
      setFormError('Enter a valid amount.');
      return;
    }
    if (currency.length !== 3) {
      setFormError('Currency must be a 3-letter code.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      setFormError('Use date format YYYY-MM-DD.');
      return;
    }
    const parsedDate = new Date(`${dateText}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime())) {
      setFormError('Enter a valid date.');
      return;
    }
    const signedAmount = isExpense ? -Math.abs(amountValue) : Math.abs(amountValue);

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        description,
        currency,
        amount: signedAmount,
        occurred_at: parsedDate.toISOString(),
        category_id: selectedCategoryId,
        account_id: selectedAccountId,
      };
      if (isEditing && editingId) {
        const updated = await request<Transaction>(`/transactions/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await request<Transaction>('/transactions', {
          method: 'POST',
          body: {
            ...payload,
            is_manual: true,
          },
        });
        let recurringFailed = false;
        if (isRecurring) {
          const nextDueDate = computeNextRecurringDate(dateText, recurringFrequency);
          try {
            await request('/recurring-payments', {
              method: 'POST',
              body: {
                account_id: selectedAccountId,
                category_id: selectedCategoryId,
                name: description,
                currency,
                amount: Math.abs(amountValue),
                kind: isExpense ? 'expense' : 'income',
                frequency: recurringFrequency,
                interval: 1,
                next_due_date: nextDueDate,
                is_active: true,
              },
            });
          } catch {
            recurringFailed = true;
          }
        }
        setItems((prev) => [created, ...prev]);
        if (recurringFailed) {
          Alert.alert(
            'Recurring setup failed',
            'Transaction was saved, but recurring setup could not be created.'
          );
        }
      }
      resetForm();
      setShowForm(false);
      const refreshed = await loadTransactions(appliedFilters);
      setItems(refreshed);
    } catch {
      setFormError(isEditing ? 'Unable to update transaction.' : 'Unable to create transaction.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: Transaction) => {
    setForm({
      description: item.description,
      amount: Math.abs(item.amount).toString(),
      currency: item.currency,
      occurredAt: item.occurred_at.slice(0, 10),
    });
    setIsExpense(item.amount < 0);
    setIsRecurring(false);
    setRecurringFrequency('monthly');
    setEditingId(item.id);
    setSelectedAccountId(item.account_id);
    setSelectedCategoryId(item.category_id ?? null);
    setFormError('');
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    resetForm();
    setShowForm(false);
  };

  const deleteTransaction = async (item: Transaction) => {
    try {
      await request(`/transactions/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      if (editingId === item.id) {
        resetForm();
        setShowForm(false);
      }
    } catch {
      setError('Unable to delete transaction.');
    }
  };

  const confirmDelete = (item: Transaction) => {
    Alert.alert('Delete transaction', `Delete ${item.description}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteTransaction(item) },
    ]);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
  };

  const handleClearFilters = () => {
    const cleared = { startDate: '', endDate: '', accountId: null, categoryId: null };
    setFilters(cleared);
    setAppliedFilters(cleared);
  };

  const accountMap = useMemo(() => {
    const map: Record<number, string> = {};
    accounts.forEach((account) => {
      map[account.id] = account.name;
    });
    return map;
  }, [accounts]);

  const categoryMap = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach((category) => {
      map[category.id] = category.name;
    });
    return map;
  }, [categories]);

  const categoryColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    const fallback = [...EXPENSE_COLORS, ...INCOME_COLORS];
    categories.forEach((category, index) => {
      map[category.id] = category.color || fallback[index % fallback.length];
    });
    return map;
  }, [categories]);

  const selectableCategories = useMemo(
    () => categories.filter((category) => category.kind.toLowerCase() === categoryKind),
    [categories, categoryKind]
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Transactions</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.iconButton} />
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              if (showForm && isEditing) {
                resetForm();
              }
              setShowForm((prev) => !prev);
            }}>
            <MaterialIcons name="add" size={20} color={colors.text} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setShowFilters((prev) => !prev)}>
            <MaterialIcons name="tune" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Review new expenses</Text>
        <Text style={styles.bannerSubtitle}>4 items need category updates.</Text>
      </View>

      <View style={styles.filterCard}>
        <Pressable style={styles.formToggle} onPress={() => setShowFilters((prev) => !prev)}>
          <Text style={styles.formTitle}>Filters</Text>
          <MaterialIcons name={showFilters ? 'close' : 'tune'} size={20} color={colors.text} />
        </Pressable>
        {showFilters ? (
          <View style={styles.formBody}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Start date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  value={filters.startDate}
                  onChangeText={(text) => setFilters((prev) => ({ ...prev, startDate: text }))}
                />
              </View>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>End date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  value={filters.endDate}
                  onChangeText={(text) => setFilters((prev) => ({ ...prev, endDate: text }))}
                />
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Accounts</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, filters.accountId === null && styles.chipActive]}
                  onPress={() => setFilters((prev) => ({ ...prev, accountId: null }))}>
                  <Text
                    style={[
                      styles.chipText,
                      filters.accountId === null && styles.chipTextActive,
                    ]}>
                    All accounts
                  </Text>
                </Pressable>
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    style={[styles.chip, filters.accountId === account.id && styles.chipActive]}
                    onPress={() => setFilters((prev) => ({ ...prev, accountId: account.id }))}>
                    <Text
                      style={[
                        styles.chipText,
                        filters.accountId === account.id && styles.chipTextActive,
                      ]}>
                      {account.name}
                    </Text>
                  </Pressable>
                ))}
                {accounts.length === 0 ? (
                  <Text style={styles.emptyText}>Add an account to filter.</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Categories</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, filters.categoryId === null && styles.chipActive]}
                  onPress={() => setFilters((prev) => ({ ...prev, categoryId: null }))}>
                  <View style={styles.chipLabel}>
                    <View style={[styles.colorDot, { backgroundColor: colors.ringTrack }]} />
                    <Text
                      style={[
                        styles.chipText,
                        filters.categoryId === null && styles.chipTextActive,
                      ]}>
                      All categories
                    </Text>
                  </View>
                </Pressable>
                {categories.map((category) => (
                  <Pressable
                    key={category.id}
                    style={[styles.chip, filters.categoryId === category.id && styles.chipActive]}
                    onPress={() => setFilters((prev) => ({ ...prev, categoryId: category.id }))}>
                    <View style={styles.chipLabel}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: categoryColorMap[category.id] ?? colors.accent },
                        ]}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          filters.categoryId === category.id && styles.chipTextActive,
                        ]}>
                        {category.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {categories.length === 0 ? (
                  <Text style={styles.emptyText}>No categories yet.</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.filterActions}>
              <Pressable style={styles.primaryButton} onPress={handleApplyFilters}>
                <Text style={styles.primaryButtonText}>Apply filters</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={handleClearFilters}>
                <Text style={styles.secondaryButtonText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.formCard}>
        <Pressable
          style={styles.formToggle}
          onPress={() => {
            if (showForm && isEditing) {
              resetForm();
            }
            setShowForm((prev) => !prev);
          }}>
          <Text style={styles.formTitle}>
            {isEditing ? 'Edit transaction' : 'New manual transaction'}
          </Text>
          <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
        </Pressable>
        {showForm ? (
          <View style={styles.formBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="Groceries"
                placeholderTextColor={colors.muted}
                value={form.description}
                onChangeText={(text) => setForm((prev) => ({ ...prev, description: text }))}
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.input}
                  placeholder="25.00"
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
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleButton, isExpense && styles.toggleButtonActive]}
                  onPress={() => setIsExpense(true)}>
                  <Text style={[styles.toggleText, isExpense && styles.toggleTextActive]}>
                    Expense
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleButton, !isExpense && styles.toggleButtonActive]}
                  onPress={() => setIsExpense(false)}>
                  <Text style={[styles.toggleText, !isExpense && styles.toggleTextActive]}>
                    Income
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Account</Text>
              <View style={styles.chipRow}>
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    style={[
                      styles.chip,
                      selectedAccountId === account.id && styles.chipActive,
                    ]}
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
                {accounts.length === 0 ? (
                  <Text style={styles.emptyText}>Add an account first.</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, selectedCategoryId === null && styles.chipActive]}
                  onPress={() => setSelectedCategoryId(null)}>
                  <View style={styles.chipLabel}>
                    <View style={[styles.colorDot, { backgroundColor: colors.ringTrack }]} />
                    <Text
                      style={[
                        styles.chipText,
                        selectedCategoryId === null && styles.chipTextActive,
                      ]}>
                      Uncategorized
                    </Text>
                  </View>
                </Pressable>
                {selectableCategories.map((category) => (
                  <Pressable
                    key={category.id}
                    style={[
                      styles.chip,
                      selectedCategoryId === category.id && styles.chipActive,
                    ]}
                    onPress={() => setSelectedCategoryId(category.id)}>
                    <View style={styles.chipLabel}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: categoryColorMap[category.id] ?? colors.accent },
                        ]}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          selectedCategoryId === category.id && styles.chipTextActive,
                        ]}>
                        {category.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {selectableCategories.length === 0 ? (
                  <Text style={styles.emptyText}>No {categoryKindLabel.toLowerCase()} categories yet.</Text>
                ) : null}
              </View>
              <View style={styles.manageRow}>
                <Pressable
                  style={styles.manageButton}
                  onPress={() => router.push('/(tabs)/categories')}>
                  <MaterialIcons name="category" size={16} color={colors.text} />
                  <Text style={styles.manageButtonText}>Manage categories</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                value={form.occurredAt}
                onChangeText={(text) => setForm((prev) => ({ ...prev, occurredAt: text }))}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Recurring</Text>
              <Pressable
                style={[
                  styles.recurringToggle,
                  isRecurring && styles.recurringToggleActive,
                  isEditing && styles.recurringToggleDisabled,
                ]}
                onPress={() => setIsRecurring((prev) => !prev)}
                disabled={isEditing}>
                <View style={styles.recurringToggleMain}>
                  <MaterialIcons
                    name={isRecurring ? 'check-box' : 'check-box-outline-blank'}
                    size={20}
                    color={isRecurring ? '#fff' : colors.muted}
                  />
                  <Text style={[styles.recurringToggleLabel, isRecurring && styles.recurringToggleLabelActive]}>
                    Make this transaction recurring
                  </Text>
                </View>
                <Text style={[styles.recurringToggleState, isRecurring && styles.recurringToggleStateActive]}>
                  {isRecurring ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
              <Text style={styles.helperText}>
                {isEditing
                  ? 'Recurring can be set when creating a new transaction.'
                  : 'Default is off. Turning this on creates a recurring schedule after this payment.'}
              </Text>
              {isRecurring && !isEditing ? (
                <View style={styles.frequencyWrap}>
                  <Text style={styles.label}>Frequency</Text>
                  <View style={styles.frequencyRow}>
                    <Pressable
                      style={[
                        styles.frequencyChip,
                        recurringFrequency === 'weekly' && styles.frequencyChipActive,
                      ]}
                      onPress={() => setRecurringFrequency('weekly')}>
                      <Text
                        style={[
                          styles.frequencyChipText,
                          recurringFrequency === 'weekly' && styles.frequencyChipTextActive,
                        ]}>
                        Weekly
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.frequencyChip,
                        recurringFrequency === 'monthly' && styles.frequencyChipActive,
                      ]}
                      onPress={() => setRecurringFrequency('monthly')}>
                      <Text
                        style={[
                          styles.frequencyChipText,
                          recurringFrequency === 'monthly' && styles.frequencyChipTextActive,
                        ]}>
                        Monthly
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save transaction'}
              </Text>
            </Pressable>
            {isEditing ? (
              <Pressable style={styles.secondaryButton} onPress={handleCancelEdit}>
                <Text style={styles.secondaryButtonText}>Cancel edit</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        {showSkeleton ? (
          <TransactionsSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && items.length === 0 ? (
              <Text style={styles.emptyText}>No transactions yet.</Text>
            ) : null}
            {items.map((item) => (
              <View key={item.id} style={styles.row}>
                <View>
                  <Text style={styles.rowTitle}>{item.description}</Text>
                  <Text style={styles.rowSubtitle}>
                    {(accountMap[item.account_id] ?? 'Account') +
                      ' | ' +
                      (item.category_id ? categoryMap[item.category_id] ?? 'Category' : 'Uncategorized') +
                      ' | ' +
                      item.occurred_at.slice(0, 10)}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.amount, item.amount > 0 && styles.amountPositive]}>
                    {item.amount > 0 ? '+' : '-'}
                    {item.currency} {Math.abs(item.amount).toFixed(2)}
                  </Text>
                  <View style={styles.rowActions}>
                    <Pressable style={styles.actionButton} onPress={() => handleEdit(item)}>
                      <MaterialIcons name="edit" size={16} color={colors.text} />
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, styles.actionDelete]}
                      onPress={() => confirmDelete(item)}>
                      <MaterialIcons name="delete-outline" size={16} color={colors.danger} />
                    </Pressable>
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
    marginBottom: SPACING.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
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
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    marginBottom: SPACING.lg,
  },
  formCard: {
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
  formToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  formBody: {
    marginTop: SPACING.md,
    gap: SPACING.md,
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
  toggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    color: colors.text,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
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
  chipLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
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
  manageRow: {
    marginTop: SPACING.sm,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
  },
  manageButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  recurringToggle: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recurringToggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  recurringToggleDisabled: {
    opacity: 0.55,
  },
  recurringToggleMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  recurringToggleLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  recurringToggleLabelActive: {
    color: '#fff',
  },
  recurringToggleState: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  recurringToggleStateActive: {
    color: '#fff',
  },
  helperText: {
    color: colors.muted,
    fontSize: 12,
  },
  frequencyWrap: {
    marginTop: SPACING.sm,
    gap: 6,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  frequencyChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: colors.card,
  },
  frequencyChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDark,
  },
  frequencyChipText: {
    color: colors.text,
    fontWeight: '600',
  },
  frequencyChipTextActive: {
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    backgroundColor: colors.card,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  filterActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
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
  rowRight: {
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  rowActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  actionDelete: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
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

type TransactionsStyles = ReturnType<typeof createStyles>;

function TransactionsSkeleton({ styles }: { styles: TransactionsStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonText}>
            <Skeleton width={140} height={12} />
            <Skeleton width={90} height={10} />
          </View>
          <Skeleton width={80} height={12} />
        </View>
      ))}
    </View>
  );
}


