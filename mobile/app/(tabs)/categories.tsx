import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Category } from '@/lib/types';

const EXPENSE_COLORS = ['#0EA5A4', '#F97316', '#EF4444', '#3B82F6', '#F59E0B', '#10B981'];
const INCOME_COLORS = ['#10B981', '#14B8A6', '#22C55E', '#84CC16', '#06B6D4', '#0EA5E9'];

type CategoryKindFilter = 'all' | 'expense' | 'income';
type CategoryKind = 'expense' | 'income';

export default function CategoriesScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<CategoryKindFilter>('all');
  const [form, setForm] = useState({
    name: '',
    kind: 'expense' as CategoryKind,
    color: EXPENSE_COLORS[0],
  });

  const fetchCategories = useCallback(async () => {
    const data = await request<Category[]>('/categories');
    setItems(data);
  }, [request]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCategories()
      .then(() => {
        if (!active) return;
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load categories.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchCategories]);

  const availableColors = form.kind === 'expense' ? EXPENSE_COLORS : INCOME_COLORS;

  useEffect(() => {
    if (!availableColors.includes(form.color)) {
      setForm((prev) => ({ ...prev, color: availableColors[0] }));
    }
  }, [availableColors, form.color]);

  const visibleItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((category) => category.kind.toLowerCase() === filter);
  }, [filter, items]);

  const resetForm = () => {
    setForm({ name: '', kind: 'expense', color: EXPENSE_COLORS[0] });
    setEditingId(null);
    setFormError('');
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      setFormError('Category name is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editingId) {
        const updated = await request<Category>(`/categories/${editingId}`, {
          method: 'PATCH',
          body: { name, kind: form.kind, color: form.color },
        });
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await request<Category>('/categories', {
          method: 'POST',
          body: { name, kind: form.kind, color: form.color },
        });
        setItems((prev) => [created, ...prev]);
      }
      resetForm();
      setShowForm(false);
    } catch {
      setFormError(editingId ? 'Unable to update category.' : 'Unable to create category.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: Category) => {
    setForm({
      name: item.name,
      kind: item.kind.toLowerCase() === 'income' ? 'income' : 'expense',
      color:
        item.color ||
        (item.kind.toLowerCase() === 'income' ? INCOME_COLORS[0] : EXPENSE_COLORS[0]),
    });
    setEditingId(item.id);
    setFormError('');
    setShowForm(true);
  };

  const deleteCategory = async (item: Category) => {
    try {
      await request(`/categories/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((category) => category.id !== item.id));
      if (editingId === item.id) {
        resetForm();
        setShowForm(false);
      }
    } catch {
      setError('Unable to delete category.');
    }
  };

  const confirmDelete = (item: Category) => {
    Alert.alert('Delete category', `Delete ${item.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteCategory(item) },
    ]);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);
  const showSkeleton = loading && items.length === 0 && !error;
  const isEditing = editingId !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Categories</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.iconButton} />
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              if (showForm && isEditing) resetForm();
              setShowForm((prev) => !prev);
            }}>
            <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterCard}>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, filter === 'all' && styles.chipActive]}
            onPress={() => setFilter('all')}>
            <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>All</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, filter === 'expense' && styles.chipActive]}
            onPress={() => setFilter('expense')}>
            <Text style={[styles.chipText, filter === 'expense' && styles.chipTextActive]}>
              Expense
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, filter === 'income' && styles.chipActive]}
            onPress={() => setFilter('income')}>
            <Text style={[styles.chipText, filter === 'income' && styles.chipTextActive]}>
              Income
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.formCard}>
        <Pressable
          style={styles.formToggle}
          onPress={() => {
            if (showForm && isEditing) resetForm();
            setShowForm((prev) => !prev);
          }}>
          <Text style={styles.formTitle}>{isEditing ? 'Edit category' : 'New category'}</Text>
          <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
        </Pressable>
        {showForm ? (
          <View style={styles.formBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Groceries"
                placeholderTextColor={colors.muted}
                value={form.name}
                onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleButton, form.kind === 'expense' && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, kind: 'expense' }))}>
                  <Text style={[styles.toggleText, form.kind === 'expense' && styles.toggleTextActive]}>
                    Expense
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleButton, form.kind === 'income' && styles.toggleButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, kind: 'income' }))}>
                  <Text style={[styles.toggleText, form.kind === 'income' && styles.toggleTextActive]}>
                    Income
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Color</Text>
              <View style={styles.colorRow}>
                {availableColors.map((color) => (
                  <Pressable
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      form.color === color && styles.colorSwatchActive,
                    ]}
                    onPress={() => setForm((prev) => ({ ...prev, color }))}
                  />
                ))}
              </View>
            </View>

            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save category'}
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
          <CategoriesSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && visibleItems.length === 0 ? (
              <Text style={styles.emptyText}>No categories found.</Text>
            ) : null}
            {visibleItems.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={[styles.rowDot, { backgroundColor: item.color || colors.accent }]} />
                  <View>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.rowSubtitle}>{item.kind}</Text>
                  </View>
                </View>
                <View style={styles.rowActions}>
                  {!item.is_system ? (
                    <>
                      <Pressable style={styles.actionButton} onPress={() => handleEdit(item)}>
                        <MaterialIcons name="edit" size={16} color={colors.text} />
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.actionDelete]}
                        onPress={() => confirmDelete(item)}>
                        <MaterialIcons name="delete-outline" size={16} color={colors.danger} />
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.systemBadge}>System</Text>
                  )}
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
    filterCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
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
    formCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
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
    colorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    colorSwatch: {
      width: 28,
      height: 28,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorSwatchActive: {
      borderColor: colors.text,
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
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    rowDot: {
      width: 12,
      height: 12,
      borderRadius: 999,
    },
    rowTitle: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 15,
    },
    rowSubtitle: {
      color: colors.muted,
      marginTop: 4,
    },
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
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
    systemBadge: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
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

type CategoriesStyles = ReturnType<typeof createStyles>;

function CategoriesSkeleton({ styles }: { styles: CategoriesStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonText}>
            <Skeleton width={120} height={12} />
            <Skeleton width={80} height={10} />
          </View>
          <Skeleton width={50} height={12} />
        </View>
      ))}
    </View>
  );
}

