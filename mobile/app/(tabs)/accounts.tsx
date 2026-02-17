import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import type { Account } from '@/lib/types';

export default function AccountsScreen() {
  const { request } = useAuth();
  const router = useRouter();
  const colors = useThemeColors();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    accountType: 'checking',
    currency: 'EUR',
    balance: '',
  });
  const showSkeleton = loading && accounts.length === 0 && !error;
  const isEditing = editingId !== null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    request<Account[]>('/accounts')
      .then((data) => {
        if (!active) return;
        setAccounts(data);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load accounts.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request]);

  const resetForm = () => {
    setForm({ name: '', accountType: 'checking', currency: 'EUR', balance: '' });
    setEditingId(null);
    setFormError('');
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const accountType = form.accountType.trim() || 'checking';
    const currency = form.currency.trim().toUpperCase();
    if (!name) {
      setFormError('Account name is required.');
      return;
    }
    if (currency.length !== 3) {
      setFormError('Currency must be a 3-letter code.');
      return;
    }
    let balanceValue: number | null = null;
    if (form.balance.trim()) {
      const parsed = Number(form.balance);
      if (Number.isNaN(parsed)) {
        setFormError('Balance must be a number.');
        return;
      }
      balanceValue = parsed;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name,
        account_type: accountType,
        currency,
        balance: balanceValue,
      };
      if (isEditing && editingId) {
        const updated = await request<Account>(`/accounts/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
        setAccounts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await request<Account>('/accounts', {
          method: 'POST',
          body: { ...payload, is_manual: true },
        });
        setAccounts((prev) => [created, ...prev]);
      }
      resetForm();
      setShowForm(false);
    } catch (saveError) {
      setFormError(isEditing ? 'Unable to update account.' : 'Unable to create account.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account: Account) => {
    setForm({
      name: account.name,
      accountType: account.account_type,
      currency: account.currency,
      balance: account.balance === null ? '' : account.balance.toString(),
    });
    setEditingId(account.id);
    setFormError('');
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    resetForm();
    setShowForm(false);
  };

  const deleteAccount = async (account: Account) => {
    try {
      await request(`/accounts/${account.id}`, { method: 'DELETE' });
      setAccounts((prev) => prev.filter((item) => item.id !== account.id));
      if (editingId === account.id) {
        resetForm();
        setShowForm(false);
      }
    } catch (deleteError) {
      setError('Unable to delete account.');
    }
  };

  const confirmDelete = (account: Account) => {
    Alert.alert('Delete account', `Delete ${account.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteAccount(account) },
    ]);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Accounts</Text>
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

      <View style={styles.formCard}>
        <Pressable
          style={styles.formToggle}
          onPress={() => {
            if (showForm && isEditing) {
              resetForm();
            }
            setShowForm((prev) => !prev);
          }}>
          <Text style={styles.formTitle}>{isEditing ? 'Edit account' : 'New manual account'}</Text>
          <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
        </Pressable>
        {showForm ? (
          <View style={styles.formBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Account name</Text>
              <TextInput
                style={styles.input}
                placeholder="Main checking"
                placeholderTextColor={colors.muted}
                value={form.name}
                onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <Text style={styles.label}>Type</Text>
                <TextInput
                  style={styles.input}
                  placeholder="checking"
                  placeholderTextColor={colors.muted}
                  value={form.accountType}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, accountType: text }))}
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
              <Text style={styles.label}>Balance (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={form.balance}
                onChangeText={(text) => setForm((prev) => ({ ...prev, balance: text }))}
              />
            </View>
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save account'}
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
          <AccountsSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && accounts.length === 0 ? (
              <Text style={styles.emptyText}>No accounts yet.</Text>
            ) : null}
            {accounts.map((account) => (
              <View key={account.id} style={styles.row}>
                <View>
                  <Text style={styles.rowTitle}>{account.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {account.account_type} | {account.is_manual ? 'Manual' : 'Linked'}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.balance}>
                    {account.currency} {(account.balance ?? 0).toFixed(2)}
                  </Text>
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => router.push(`/accounts/${account.id}`)}>
                      <MaterialIcons name="chevron-right" size={18} color={colors.text} />
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={() => handleEdit(account)}>
                      <MaterialIcons name="edit" size={16} color={colors.text} />
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, styles.actionDelete]}
                      onPress={() => confirmDelete(account)}>
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
  balance: {
    fontWeight: '700',
    color: colors.text,
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

type AccountsStyles = ReturnType<typeof createStyles>;

function AccountsSkeleton({ styles }: { styles: AccountsStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 3 }).map((_, index) => (
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


