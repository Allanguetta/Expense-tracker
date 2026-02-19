import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Debt, DebtPayoff } from '@/lib/types';

export default function DebtsScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [payoffMap, setPayoffMap] = useState<Record<number, DebtPayoff | null>>({});
  const [form, setForm] = useState({
    name: '',
    currency: 'EUR',
    balance: '',
    interestRate: '',
    minPayment: '',
    dueDay: '',
  });
  const showSkeleton = loading && debts.length === 0 && !error;
  const isEditing = editingId !== null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    request<Debt[]>('/debts')
      .then((data) => {
        if (!active) return;
        setDebts(data);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load debts.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  const resetForm = () => {
    setForm({
      name: '',
      currency: 'EUR',
      balance: '',
      interestRate: '',
      minPayment: '',
      dueDay: '',
    });
    setEditingId(null);
    setFormError('');
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const currency = form.currency.trim().toUpperCase();
    const balanceValue = Number(form.balance);
    if (!name) {
      setFormError('Debt name is required.');
      return;
    }
    if (currency.length !== 3) {
      setFormError('Currency must be a 3-letter code.');
      return;
    }
    if (Number.isNaN(balanceValue)) {
      setFormError('Balance must be a number.');
      return;
    }
    const interestRate = form.interestRate.trim() ? Number(form.interestRate) : null;
    if (form.interestRate.trim() && Number.isNaN(interestRate)) {
      setFormError('Interest rate must be a number.');
      return;
    }
    const minPayment = form.minPayment.trim() ? Number(form.minPayment) : null;
    if (form.minPayment.trim() && Number.isNaN(minPayment)) {
      setFormError('Min payment must be a number.');
      return;
    }
    const dueDay = form.dueDay.trim() ? Number(form.dueDay) : null;
    if (form.dueDay.trim() && (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 31)) {
      setFormError('Due day must be between 1 and 31.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name,
        currency,
        balance: balanceValue,
        interest_rate: interestRate,
        min_payment: minPayment,
        due_day: dueDay,
      };
      if (isEditing && editingId) {
        const updated = await request<Debt>(`/debts/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
        setDebts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await request<Debt>('/debts', {
          method: 'POST',
          body: payload,
        });
        setDebts((prev) => [created, ...prev]);
      }
      resetForm();
      setShowForm(false);
    } catch {
      setFormError(isEditing ? 'Unable to update debt.' : 'Unable to create debt.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (debt: Debt) => {
    setForm({
      name: debt.name,
      currency: debt.currency,
      balance: debt.balance.toString(),
      interestRate: debt.interest_rate === null ? '' : debt.interest_rate.toString(),
      minPayment: debt.min_payment === null ? '' : debt.min_payment.toString(),
      dueDay: debt.due_day === null ? '' : debt.due_day.toString(),
    });
    setEditingId(debt.id);
    setFormError('');
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    resetForm();
    setShowForm(false);
  };

  const deleteDebt = async (debt: Debt) => {
    try {
      await request(`/debts/${debt.id}`, { method: 'DELETE' });
      setDebts((prev) => prev.filter((item) => item.id !== debt.id));
      setPayoffMap((prev) => {
        const updated = { ...prev };
        delete updated[debt.id];
        return updated;
      });
      if (editingId === debt.id) {
        resetForm();
        setShowForm(false);
      }
    } catch {
      setError('Unable to delete debt.');
    }
  };

  const confirmDelete = (debt: Debt) => {
    Alert.alert('Delete debt', `Delete ${debt.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteDebt(debt) },
    ]);
  };

  const handlePayoff = async (debt: Debt) => {
    setPayoffMap((prev) => ({ ...prev, [debt.id]: prev[debt.id] ?? null }));
    try {
      const payoff = await request<DebtPayoff>(`/debts/${debt.id}/payoff`);
      setPayoffMap((prev) => ({ ...prev, [debt.id]: payoff }));
    } catch {
      setError('Unable to load payoff details.');
    }
  };

  const summary = useMemo(() => {
    const totalBalance = debts.reduce((sum, debt) => sum + debt.balance, 0);
    return { totalBalance };
  }, [debts]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Debts</Text>
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
            <MaterialIcons name="add" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Total debt</Text>
        <Text style={styles.heroValue}>EUR {summary.totalBalance.toFixed(2)}</Text>
        <Text style={styles.heroHint}>Track balances and payoff timelines.</Text>
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
          <Text style={styles.formTitle}>{isEditing ? 'Edit debt' : 'New debt'}</Text>
          <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
        </Pressable>
        {showForm ? (
          <View style={styles.formBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Credit card"
                placeholderTextColor={colors.muted}
                value={form.name}
                onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Balance</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1200"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={form.balance}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, balance: text }))}
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
            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Interest %</Text>
                <TextInput
                  style={styles.input}
                  placeholder="12.9"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={form.interestRate}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, interestRate: text }))}
                />
              </View>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Min payment</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={form.minPayment}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, minPayment: text }))}
                />
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Due day</Text>
              <TextInput
                style={styles.input}
                placeholder="15"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={form.dueDay}
                onChangeText={(text) => setForm((prev) => ({ ...prev, dueDay: text }))}
              />
            </View>
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save debt'}
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
          <DebtsSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && debts.length === 0 ? (
              <Text style={styles.emptyText}>No debts yet.</Text>
            ) : null}
            {debts.map((debt) => {
              const payoff = payoffMap[debt.id];
              return (
                <View key={debt.id} style={styles.row}>
                  <View>
                    <Text style={styles.rowTitle}>{debt.name}</Text>
                    <Text style={styles.rowSubtitle}>
                      {debt.currency} {debt.balance.toFixed(2)} | Min{' '}
                      {debt.min_payment ? debt.min_payment.toFixed(2) : 'n/a'} | Due{' '}
                      {debt.due_day ?? 'n/a'}
                    </Text>
                    {payoff ? (
                      <Text style={styles.payoffText}>
                        Payoff: {payoff.months_to_payoff ?? 'n/a'} months | Interest{' '}
                        {debt.currency} {payoff.total_interest_paid.toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.rowRight}>
                    <Pressable style={styles.tagButton} onPress={() => handlePayoff(debt)}>
                      <Text style={styles.tagText}>Payoff</Text>
                    </Pressable>
                    <View style={styles.rowActions}>
                      <Pressable style={styles.actionButton} onPress={() => handleEdit(debt)}>
                        <MaterialIcons name="edit" size={16} color={colors.text} />
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.actionDelete]}
                        onPress={() => confirmDelete(debt)}>
                        <MaterialIcons name="delete-outline" size={16} color={colors.danger} />
                      </Pressable>
                    </View>
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
    width: 38,
    height: 38,
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
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 12,
  },
  heroValue: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  heroHint: {
    color: '#fff',
    marginTop: SPACING.sm,
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
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
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
  payoffText: {
    marginTop: 6,
    color: colors.text,
    fontWeight: '600',
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  tagButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  tagText: {
    color: colors.text,
    fontWeight: '600',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonText: {
    gap: 8,
  },
  });

type DebtsStyles = ReturnType<typeof createStyles>;

function DebtsSkeleton({ styles }: { styles: DebtsStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonText}>
            <Skeleton width={140} height={12} />
            <Skeleton width={120} height={10} />
          </View>
          <Skeleton width={70} height={12} />
        </View>
      ))}
    </View>
  );
}

