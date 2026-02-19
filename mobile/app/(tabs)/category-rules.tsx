import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Category, CategoryRule } from '@/lib/types';

type AppliesToKind = 'all' | 'expense' | 'income';
type MatchType = 'contains' | 'starts_with' | 'equals' | 'regex';

const MATCH_TYPES: { value: MatchType; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'equals', label: 'Equals' },
  { value: 'regex', label: 'Regex' },
];

const APPLIES_TO_OPTIONS: { value: AppliesToKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

type RuleForm = {
  categoryId: number | null;
  pattern: string;
  matchType: MatchType;
  appliesToKind: AppliesToKind;
  priority: string;
  caseSensitive: boolean;
  isActive: boolean;
};

const DEFAULT_FORM: RuleForm = {
  categoryId: null,
  pattern: '',
  matchType: 'contains',
  appliesToKind: 'all',
  priority: '100',
  caseSensitive: false,
  isActive: true,
};

export default function CategoryRulesScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleForm>(DEFAULT_FORM);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    const [rulesData, categoriesData] = await Promise.all([
      request<CategoryRule[]>('/category-rules'),
      request<Category[]>('/categories'),
    ]);
    setRules(rulesData);
    setCategories(categoriesData);
    setForm((prev) => ({
      ...prev,
      categoryId:
        prev.categoryId && categoriesData.some((item) => item.id === prev.categoryId)
          ? prev.categoryId
          : categoriesData[0]?.id ?? null,
    }));
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
        setError('Unable to load category rules.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadData]);

  const categoryMap = useMemo(() => {
    const map: Record<number, Category> = {};
    categories.forEach((category) => {
      map[category.id] = category;
    });
    return map;
  }, [categories]);

  const selectableCategories = useMemo(() => {
    if (form.appliesToKind === 'all') {
      return categories;
    }
    return categories.filter((category) => category.kind.toLowerCase() === form.appliesToKind);
  }, [categories, form.appliesToKind]);

  useEffect(() => {
    if (!form.categoryId) {
      return;
    }
    const exists = selectableCategories.some((item) => item.id === form.categoryId);
    if (!exists) {
      setForm((prev) => ({ ...prev, categoryId: selectableCategories[0]?.id ?? null }));
    }
  }, [form.categoryId, selectableCategories]);

  const resetForm = () => {
    setForm({
      ...DEFAULT_FORM,
      categoryId: categories[0]?.id ?? null,
    });
    setFormError('');
    setEditingId(null);
  };

  const handleSave = async () => {
    const pattern = form.pattern.trim();
    const priority = Number(form.priority);

    if (!form.categoryId) {
      setFormError('Select a category.');
      return;
    }
    if (!pattern) {
      setFormError('Pattern is required.');
      return;
    }
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
      setFormError('Priority must be an integer from 0 to 1000.');
      return;
    }

    const selectedCategory = categoryMap[form.categoryId];
    if (!selectedCategory) {
      setFormError('Selected category does not exist.');
      return;
    }
    if (
      form.appliesToKind !== 'all' &&
      selectedCategory.kind.toLowerCase() !== form.appliesToKind
    ) {
      setFormError('Category type must match rule scope.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        category_id: form.categoryId,
        pattern,
        match_type: form.matchType,
        applies_to_kind: form.appliesToKind,
        priority,
        case_sensitive: form.caseSensitive,
        is_active: form.isActive,
      };

      if (editingId) {
        const updated = await request<CategoryRule>(`/category-rules/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
        setRules((prev) => prev.map((rule) => (rule.id === updated.id ? updated : rule)));
      } else {
        const created = await request<CategoryRule>('/category-rules', {
          method: 'POST',
          body: payload,
        });
        setRules((prev) => [...prev, created].sort((a, b) => a.priority - b.priority || a.id - b.id));
      }
      resetForm();
      setShowForm(false);
    } catch {
      setFormError(editingId ? 'Unable to update rule.' : 'Unable to create rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (rule: CategoryRule) => {
    setForm({
      categoryId: rule.category_id,
      pattern: rule.pattern,
      matchType: rule.match_type,
      appliesToKind: rule.applies_to_kind,
      priority: String(rule.priority),
      caseSensitive: rule.case_sensitive,
      isActive: rule.is_active,
    });
    setEditingId(rule.id);
    setFormError('');
    setShowForm(true);
  };

  const deleteRule = async (rule: CategoryRule) => {
    try {
      await request(`/category-rules/${rule.id}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
      if (editingId === rule.id) {
        resetForm();
        setShowForm(false);
      }
    } catch {
      setError('Unable to delete rule.');
    }
  };

  const confirmDelete = (rule: CategoryRule) => {
    Alert.alert('Delete category rule', `Delete "${rule.pattern}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteRule(rule) },
    ]);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);
  const showSkeleton = loading && rules.length === 0 && !error;
  const isEditing = editingId !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Category Rules</Text>
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
            <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Auto-categorize transactions</Text>
        <Text style={styles.bannerSubtitle}>
          Rules run by priority. Lower numbers run first.
        </Text>
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
          <Text style={styles.formTitle}>{isEditing ? 'Edit rule' : 'New rule'}</Text>
          <MaterialIcons name={showForm ? 'close' : 'rule'} size={20} color={colors.text} />
        </Pressable>
        {showForm ? (
          <View style={styles.formBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Pattern</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Lidl, Payroll, Rent"
                placeholderTextColor={colors.muted}
                value={form.pattern}
                onChangeText={(text) => setForm((prev) => ({ ...prev, pattern: text }))}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Match type</Text>
              <View style={styles.chipRow}>
                {MATCH_TYPES.map((item) => (
                  <Pressable
                    key={item.value}
                    style={[styles.chip, form.matchType === item.value && styles.chipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, matchType: item.value }))}>
                    <Text
                      style={[
                        styles.chipText,
                        form.matchType === item.value && styles.chipTextActive,
                      ]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Applies to</Text>
              <View style={styles.chipRow}>
                {APPLIES_TO_OPTIONS.map((item) => (
                  <Pressable
                    key={item.value}
                    style={[styles.chip, form.appliesToKind === item.value && styles.chipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, appliesToKind: item.value }))}>
                    <Text
                      style={[
                        styles.chipText,
                        form.appliesToKind === item.value && styles.chipTextActive,
                      ]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipRow}>
                {selectableCategories.map((category) => (
                  <Pressable
                    key={category.id}
                    style={[styles.chip, form.categoryId === category.id && styles.chipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, categoryId: category.id }))}>
                    <View style={styles.chipLabel}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: category.color || colors.accent },
                        ]}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          form.categoryId === category.id && styles.chipTextActive,
                        ]}>
                        {category.name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {selectableCategories.length === 0 ? (
                  <Text style={styles.emptyText}>No matching categories. Create one first.</Text>
                ) : null}
              </View>
              <Pressable style={styles.manageButton} onPress={() => router.push('/(tabs)/categories')}>
                <MaterialIcons name="category" size={16} color={colors.text} />
                <Text style={styles.manageButtonText}>Manage categories</Text>
              </Pressable>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Priority</Text>
                <TextInput
                  style={styles.input}
                  placeholder="100"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  value={form.priority}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, priority: text }))}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Options</Text>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleButton, form.caseSensitive && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, caseSensitive: !prev.caseSensitive }))}>
                  <Text
                    style={[styles.toggleText, form.caseSensitive && styles.toggleTextActive]}>
                    Case sensitive
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleButton, form.isActive && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}>
                  <Text style={[styles.toggleText, form.isActive && styles.toggleTextActive]}>
                    {form.isActive ? 'Active' : 'Inactive'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save rule'}
              </Text>
            </Pressable>
            {isEditing ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  resetForm();
                  setShowForm(false);
                }}>
                <Text style={styles.secondaryButtonText}>Cancel edit</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        {showSkeleton ? (
          <CategoryRulesSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && rules.length === 0 ? (
              <Text style={styles.emptyText}>No rules yet. Create one above.</Text>
            ) : null}
            {rules.map((rule) => {
              const category = categoryMap[rule.category_id];
              return (
                <View key={rule.id} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowPattern}>{rule.pattern}</Text>
                    <Text style={styles.rowMeta}>
                      {(category?.name ?? 'Category') +
                        ` • ${rule.match_type} • ${rule.applies_to_kind} • P${rule.priority}`}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    {!rule.is_active ? <Text style={styles.badge}>Off</Text> : null}
                    <Pressable style={styles.actionButton} onPress={() => handleEdit(rule)}>
                      <MaterialIcons name="edit" size={16} color={colors.text} />
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, styles.actionDelete]}
                      onPress={() => confirmDelete(rule)}>
                      <MaterialIcons name="delete-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
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
      gap: SPACING.sm,
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
    chipActive: {
      backgroundColor: colors.primaryDark,
      borderColor: colors.primaryDark,
    },
    chipLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipText: {
      color: colors.text,
      fontWeight: '600',
    },
    chipTextActive: {
      color: '#fff',
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
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
    manageButton: {
      marginTop: SPACING.sm,
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
      gap: SPACING.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: SPACING.md,
    },
    rowInfo: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    rowPattern: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 15,
    },
    rowMeta: {
      color: colors.muted,
      fontSize: 12,
    },
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    badge: {
      color: colors.muted,
      fontWeight: '700',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    skeletonText: {
      gap: 8,
    },
  });

type CategoryRulesStyles = ReturnType<typeof createStyles>;

function CategoryRulesSkeleton({ styles }: { styles: CategoryRulesStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonText}>
            <Skeleton width={160} height={12} />
            <Skeleton width={120} height={10} />
          </View>
          <Skeleton width={64} height={12} />
        </View>
      ))}
    </View>
  );
}
