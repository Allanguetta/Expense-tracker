import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Budget, Category, DashboardSummary } from '@/lib/types';

type BudgetItemInput = {
  categoryId: number;
  limitAmount: number;
};

export default function BudgetsScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    month: new Date().toISOString().slice(0, 7),
    currency: 'EUR',
  });
  const [items, setItems] = useState<BudgetItemInput[]>([]);
  const [itemCategoryId, setItemCategoryId] = useState<number | null>(null);
  const [itemLimit, setItemLimit] = useState('');
  const showSummarySkeleton = summaryLoading && !summary && !error;
  const showBudgetsSkeleton = budgetsLoading && budgets.length === 0 && !error;
  const isEditing = editingId !== null;

  useEffect(() => {
    let active = true;
    setSummaryLoading(true);
    request<DashboardSummary>('/dashboard/summary')
      .then((data) => {
        if (!active) return;
        setSummary(data);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load budgets.');
      })
      .finally(() => {
        if (active) setSummaryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    let active = true;
    setBudgetsLoading(true);
    Promise.all([request<Budget[]>('/budgets'), request<Category[]>('/categories')])
      .then(([budgetData, categoryData]) => {
        if (!active) return;
        setBudgets(budgetData);
        setCategories(categoryData);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load budgets.');
      })
      .finally(() => {
        if (active) setBudgetsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  const budgetRows = useMemo(() => {
    const budgets = summary?.budgets ?? [];
    return budgets.map((budget) => {
      const totals = budget.items.reduce(
        (acc, item) => {
          acc.spent += item.spent;
          acc.limit += item.limit_amount;
          return acc;
        },
        { spent: 0, limit: 0 }
      );
      const progress = totals.limit ? totals.spent / totals.limit : 0;
      return {
        id: budget.id,
        name: budget.name,
        spent: totals.spent,
        limit: totals.limit,
        progress,
      };
    });
  }, [summary]);

  const categoryMap = useMemo(() => {
    const map: Record<number, string> = {};
    categories.forEach((category) => {
      map[category.id] = category.name;
    });
    return map;
  }, [categories]);

  const categoryColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    const fallback = ['#0EA5A4', '#F97316', '#EF4444', '#3B82F6', '#F59E0B', '#10B981'];
    categories.forEach((category, index) => {
      map[category.id] = category.color || fallback[index % fallback.length];
    });
    return map;
  }, [categories]);

  const resetForm = () => {
    setForm({
      name: '',
      month: new Date().toISOString().slice(0, 7),
      currency: 'EUR',
    });
    setItems([]);
    setItemCategoryId(null);
    setItemLimit('');
    setEditingId(null);
    setFormError('');
  };

  const handleAddItem = () => {
    if (!itemCategoryId) {
      setFormError('Select a category for the budget item.');
      return;
    }
    const limitValue = Number(itemLimit);
    if (Number.isNaN(limitValue) || limitValue <= 0) {
      setFormError('Enter a valid limit amount.');
      return;
    }
    setItems((prev) => [...prev, { categoryId: itemCategoryId, limitAmount: limitValue }]);
    setItemCategoryId(null);
    setItemLimit('');
    setFormError('');
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const currency = form.currency.trim().toUpperCase();
    if (!name) {
      setFormError('Budget name is required.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(form.month)) {
      setFormError('Month must be in YYYY-MM format.');
      return;
    }
    if (currency.length !== 3) {
      setFormError('Currency must be a 3-letter code.');
      return;
    }
    if (items.length === 0) {
      setFormError('Add at least one budget item.');
      return;
    }
    const monthValue = `${form.month}-01`;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name,
        month: monthValue,
        currency,
        items: items.map((item) => ({
          category_id: item.categoryId,
          limit_amount: item.limitAmount,
        })),
      };
      if (isEditing && editingId) {
        const updated = await request<Budget>(`/budgets/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
        setBudgets((prev) => prev.map((budget) => (budget.id === updated.id ? updated : budget)));
      } else {
        const created = await request<Budget>('/budgets', {
          method: 'POST',
          body: payload,
        });
        setBudgets((prev) => [created, ...prev]);
      }
      resetForm();
      setShowForm(false);
    } catch (saveError) {
      setFormError(isEditing ? 'Unable to update budget.' : 'Unable to create budget.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (budget: Budget) => {
    setForm({
      name: budget.name,
      month: budget.month.slice(0, 7),
      currency: budget.currency,
    });
    setItems(
      budget.items.map((item) => ({
        categoryId: item.category_id,
        limitAmount: item.limit_amount,
      }))
    );
    setEditingId(budget.id);
    setFormError('');
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    resetForm();
    setShowForm(false);
  };

  const deleteBudget = async (budget: Budget) => {
    try {
      await request(`/budgets/${budget.id}`, { method: 'DELETE' });
      setBudgets((prev) => prev.filter((item) => item.id !== budget.id));
      if (editingId === budget.id) {
        resetForm();
        setShowForm(false);
      }
    } catch (deleteError) {
      setError('Unable to delete budget.');
    }
  };

  const confirmDelete = (budget: Budget) => {
    Alert.alert('Delete budget', `Delete ${budget.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteBudget(budget) },
    ]);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Budgets</Text>
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
        </View>
      </View>

      <View style={styles.card}>
        {showSummarySkeleton ? (
          <BudgetsSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!summaryLoading && budgetRows.length === 0 ? (
              <Text style={styles.emptyText}>No budget activity yet.</Text>
            ) : null}
            {budgetRows.map((budget) => {
              const progress = Math.min(budget.progress, 1);
              return (
                <View key={budget.name} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{budget.name}</Text>
                    <Text style={styles.rowSubtitle}>
                      {budget.spent.toFixed(2)} of {budget.limit.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  </View>
                </View>
              );
            })}
          </>
        )}
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
          <Text style={styles.formTitle}>{isEditing ? 'Edit budget' : 'New budget'}</Text>
          <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
        </Pressable>
        {showForm ? (
          <View style={styles.formBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Budget name</Text>
              <TextInput
                style={styles.input}
                placeholder="Monthly essentials"
                placeholderTextColor={colors.muted}
                value={form.name}
                onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Month</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM"
                  placeholderTextColor={colors.muted}
                  value={form.month}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, month: text }))}
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
              <Text style={styles.label}>Add budget item</Text>
              <View style={styles.chipRow}>
                {categories.map((category) => (
                  <Pressable
                    key={category.id}
                    style={[
                      styles.chip,
                      itemCategoryId === category.id && styles.chipActive,
                    ]}
                    onPress={() => setItemCategoryId(category.id)}>
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
                          itemCategoryId === category.id && styles.chipTextActive,
                        ]}>
                        {category.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {categories.length === 0 ? (
                  <Text style={styles.emptyText}>Create a category first.</Text>
                ) : null}
              </View>
              <View style={styles.inlineRow}>
                <TextInput
                  style={[styles.input, styles.inlineInput]}
                  placeholder="Limit amount"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={itemLimit}
                  onChangeText={setItemLimit}
                />
                <Pressable style={[styles.primaryButton, styles.inlineButton]} onPress={handleAddItem}>
                  <Text style={styles.primaryButtonText}>Add</Text>
                </Pressable>
              </View>
              {items.length > 0 ? (
                <View style={styles.itemList}>
                  {items.map((item, index) => (
                    <View key={`${item.categoryId}-${index}`} style={styles.itemRow}>
                      <View style={styles.itemLabel}>
                        <View
                          style={[
                            styles.colorDot,
                            {
                              backgroundColor:
                                categoryColorMap[item.categoryId] ?? colors.accent,
                            },
                          ]}
                        />
                        <Text style={styles.itemText}>
                          {categoryMap[item.categoryId] ?? 'Category'} |{' '}
                          {item.limitAmount.toFixed(2)}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.itemRemove}
                        onPress={() => handleRemoveItem(index)}>
                        <MaterialIcons name="close" size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save budget'}
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
        {showBudgetsSkeleton ? (
          <BudgetsSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!budgetsLoading && budgets.length === 0 ? (
              <Text style={styles.emptyText}>No budgets yet.</Text>
            ) : null}
            {budgets.map((budget) => (
              <View key={budget.id} style={styles.budgetRow}>
                <View>
                  <Text style={styles.rowTitle}>{budget.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {budget.month.slice(0, 7)} | {budget.currency}
                  </Text>
                  {budget.items.map((item) => (
                    <Text key={item.id} style={styles.itemDetail}>
                      {categoryMap[item.category_id] ?? 'Category'}: {item.limit_amount.toFixed(2)}
                    </Text>
                  ))}
                </View>
                <View style={styles.rowActions}>
                  <Pressable style={styles.actionButton} onPress={() => handleEdit(budget)}>
                    <MaterialIcons name="edit" size={16} color={colors.text} />
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.actionDelete]}
                    onPress={() => confirmDelete(budget)}>
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
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  inlineInput: {
    flex: 1,
  },
  inlineButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  itemList: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.card,
  },
  itemLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemText: {
    color: colors.text,
    fontWeight: '600',
  },
  itemRemove: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  card: {
    backgroundColor: colors.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    gap: SPACING.lg,
  },
  row: {
    gap: SPACING.sm,
  },
  rowInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowSubtitle: {
    color: colors.muted,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  itemDetail: {
    marginTop: 4,
    color: colors.text,
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
  error: {
    color: colors.danger,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    color: colors.muted,
    marginBottom: SPACING.md,
  },
  skeletonRow: {
    gap: 10,
  },
  });

type BudgetsStyles = ReturnType<typeof createStyles>;

function BudgetsSkeleton({ styles }: { styles: BudgetsStyles }) {
  return (
    <View style={{ gap: SPACING.lg }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={140} height={12} />
          <Skeleton width={120} height={10} />
          <Skeleton width="100%" height={8} radius={999} />
        </View>
      ))}
    </View>
  );
}

