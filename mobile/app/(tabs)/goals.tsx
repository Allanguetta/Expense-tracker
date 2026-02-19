import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Goal } from '@/lib/types';

type GoalKind = 'savings' | 'debt_payoff' | 'purchase';
type GoalStatus = 'active' | 'completed' | 'archived';

const KIND_OPTIONS: { value: GoalKind; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'debt_payoff', label: 'Debt payoff' },
  { value: 'purchase', label: 'Purchase' },
];

const STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export default function GoalsScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [items, setItems] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    name: '',
    currency: 'EUR',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    kind: 'savings' as GoalKind,
    status: 'active' as GoalStatus,
    notes: '',
  });

  const fetchGoals = useCallback(async () => {
    const data = await request<Goal[]>('/goals');
    setItems(data);
  }, [request]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchGoals()
      .then(() => {
        if (!active) return;
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load goals.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchGoals]);

  const resetForm = () => {
    setForm({
      name: '',
      currency: 'EUR',
      targetAmount: '',
      currentAmount: '',
      targetDate: '',
      kind: 'savings',
      status: 'active',
      notes: '',
    });
    setEditingId(null);
    setFormError('');
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const currency = form.currency.trim().toUpperCase();
    const targetAmount = Number(form.targetAmount);
    const currentAmount = form.currentAmount.trim() ? Number(form.currentAmount) : 0;
    const targetDate = form.targetDate.trim();
    const notes = form.notes.trim();

    if (!name) {
      setFormError('Goal name is required.');
      return;
    }
    if (currency.length !== 3) {
      setFormError('Currency must be a 3-letter code.');
      return;
    }
    if (Number.isNaN(targetAmount) || targetAmount <= 0) {
      setFormError('Target amount must be greater than zero.');
      return;
    }
    if (Number.isNaN(currentAmount) || currentAmount < 0) {
      setFormError('Current amount cannot be negative.');
      return;
    }
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setFormError('Target date must be YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name,
        currency,
        target_amount: targetAmount,
        current_amount: currentAmount,
        target_date: targetDate || null,
        kind: form.kind,
        status: form.status,
        notes: notes || null,
      };

      if (editingId) {
        const updated = await request<Goal>(`/goals/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await request<Goal>('/goals', {
          method: 'POST',
          body: payload,
        });
        setItems((prev) => [...prev, created]);
      }

      resetForm();
      setShowForm(false);
      await fetchGoals();
    } catch {
      setFormError(editingId ? 'Unable to update goal.' : 'Unable to create goal.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (goal: Goal) => {
    setForm({
      name: goal.name,
      currency: goal.currency,
      targetAmount: goal.target_amount.toString(),
      currentAmount: goal.current_amount.toString(),
      targetDate: goal.target_date ? goal.target_date.slice(0, 10) : '',
      kind: goal.kind,
      status: goal.status,
      notes: goal.notes ?? '',
    });
    setEditingId(goal.id);
    setFormError('');
    setShowForm(true);
  };

  const deleteGoal = async (goal: Goal) => {
    try {
      await request(`/goals/${goal.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== goal.id));
      if (editingId === goal.id) {
        resetForm();
        setShowForm(false);
      }
    } catch {
      setError('Unable to delete goal.');
    }
  };

  const quickContribute = async (goal: Goal, amount: number) => {
    try {
      const updated = await request<Goal>(`/goals/${goal.id}/contribute`, {
        method: 'POST',
        body: { amount },
      });
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      Alert.alert('Unable to contribute', 'Could not update this goal right now.');
    }
  };

  const confirmDelete = (goal: Goal) => {
    Alert.alert('Delete goal', `Delete ${goal.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteGoal(goal) },
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
          <Text style={styles.title}>Goals</Text>
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

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Track progress toward your targets</Text>
        <Text style={styles.bannerSubtitle}>Goals help keep savings and debt payoff on plan.</Text>
      </View>

      <View style={styles.formCard}>
        <Pressable
          style={styles.formToggle}
          onPress={() => {
            if (showForm && isEditing) resetForm();
            setShowForm((prev) => !prev);
          }}>
          <Text style={styles.formTitle}>{isEditing ? 'Edit goal' : 'New goal'}</Text>
          <MaterialIcons name={showForm ? 'close' : 'flag'} size={20} color={colors.text} />
        </Pressable>
        {showForm ? (
          <View style={styles.formBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Emergency fund"
                placeholderTextColor={colors.muted}
                value={form.name}
                onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Target amount</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5000"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={form.targetAmount}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, targetAmount: text }))}
                />
              </View>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Current amount</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1200"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={form.currentAmount}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, currentAmount: text }))}
                />
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Currency</Text>
                <TextInput
                  style={styles.input}
                  placeholder="EUR"
                  placeholderTextColor={colors.muted}
                  value={form.currency}
                  autoCapitalize="characters"
                  onChangeText={(text) => setForm((prev) => ({ ...prev, currency: text }))}
                />
              </View>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Target date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  value={form.targetDate}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, targetDate: text }))}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.chipRow}>
                {KIND_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, form.kind === option.value && styles.chipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, kind: option.value }))}>
                    <Text style={[styles.chipText, form.kind === option.value && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.chipRow}>
                {STATUS_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, form.status === option.value && styles.chipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, status: option.value }))}>
                    <Text style={[styles.chipText, form.status === option.value && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textAreaInput]}
                placeholder="Optional note"
                placeholderTextColor={colors.muted}
                multiline
                value={form.notes}
                onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
              />
            </View>

            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save goal'}
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
          <GoalsSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && items.length === 0 ? <Text style={styles.emptyText}>No goals yet.</Text> : null}
            {items.map((goal) => {
              const progress = Math.max(0, Math.min(goal.progress_pct, 100));
              const isComplete = goal.status === 'completed' || goal.current_amount >= goal.target_amount;
              return (
                <View key={goal.id} style={styles.rowCard}>
                  <View style={styles.rowHeader}>
                    <View style={styles.rowHeaderText}>
                      <Text style={styles.rowTitle}>{goal.name}</Text>
                      <Text style={styles.rowSubtitle}>
                        {goal.kind.replace('_', ' ')} | {goal.status}
                        {goal.target_date ? ` | due ${goal.target_date.slice(0, 10)}` : ''}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable style={styles.actionButton} onPress={() => handleEdit(goal)}>
                        <MaterialIcons name="edit" size={16} color={colors.text} />
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.actionDelete]}
                        onPress={() => confirmDelete(goal)}>
                        <MaterialIcons name="delete-outline" size={16} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.amountText}>
                    {goal.currency} {goal.current_amount.toFixed(2)} / {goal.currency}{' '}
                    {goal.target_amount.toFixed(2)}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progress}%` },
                        isComplete && styles.progressFillComplete,
                      ]}
                    />
                  </View>
                  <View style={styles.rowFooter}>
                    <Text style={styles.progressText}>{goal.progress_pct.toFixed(1)}%</Text>
                    {goal.status === 'active' ? (
                      <View style={styles.quickButtons}>
                        <Pressable style={styles.quickButton} onPress={() => void quickContribute(goal, 50)}>
                          <Text style={styles.quickButtonText}>+50</Text>
                        </Pressable>
                        <Pressable style={styles.quickButton} onPress={() => void quickContribute(goal, 100)}>
                          <Text style={styles.quickButtonText}>+100</Text>
                        </Pressable>
                      </View>
                    ) : null}
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
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    bannerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    bannerSubtitle: {
      color: colors.muted,
      marginTop: 6,
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
    textAreaInput: {
      minHeight: 78,
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
    rowCard: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      padding: SPACING.md,
      gap: SPACING.sm,
      backgroundColor: colors.card,
    },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: SPACING.sm,
    },
    rowHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 15,
    },
    rowSubtitle: {
      color: colors.muted,
      marginTop: 4,
      fontSize: 12,
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
    amountText: {
      color: colors.text,
      fontWeight: '600',
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
      backgroundColor: colors.primary,
    },
    progressFillComplete: {
      backgroundColor: colors.accent,
    },
    rowFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    progressText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    quickButtons: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    quickButton: {
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      borderRadius: 999,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
    },
    quickButtonText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
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
      gap: 8,
      paddingVertical: SPACING.sm,
    },
  });

type GoalsStyles = ReturnType<typeof createStyles>;

function GoalsSkeleton({ styles }: { styles: GoalsStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={150} height={12} />
          <Skeleton width={120} height={10} />
          <Skeleton width="100%" height={8} />
        </View>
      ))}
    </View>
  );
}

