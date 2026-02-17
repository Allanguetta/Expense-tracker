import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { Skeleton } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/ui/menu-button';
import { ThemeToggleButton } from '@/components/ui/theme-toggle';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useAuth } from '@/context/auth';
import { useThemeColors } from '@/context/theme';
import { ApiError } from '@/lib/api';
import type { CryptoHolding, CryptoSymbol } from '@/lib/types';

const DEFAULT_CURRENCY = 'EUR';
const POPULAR_ASSETS: { symbol: string; name: string }[] = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'LINK', name: 'Chainlink' },
  { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'DOGE', name: 'Dogecoin' },
];
type SymbolOption = { symbol: string; name: string };

function resolveSymbolInput(rawInput: string, options: SymbolOption[]): string | null {
  const input = rawInput.trim();
  if (!input) {
    return null;
  }

  const inputUpper = input.toUpperCase();
  const inputLower = input.toLowerCase();

  const exactSymbol = options.find((option) => option.symbol === inputUpper);
  if (exactSymbol) {
    return exactSymbol.symbol;
  }

  const exactName = options.find((option) => option.name.toLowerCase() === inputLower);
  if (exactName) {
    return exactName.symbol;
  }

  if (inputUpper.length >= 2) {
    const prefixSymbol = options.find((option) => option.symbol.startsWith(inputUpper));
    if (prefixSymbol) {
      return prefixSymbol.symbol;
    }
  }

  if (inputLower.length >= 2) {
    const prefixName = options.find((option) => option.name.toLowerCase().startsWith(inputLower));
    if (prefixName) {
      return prefixName.symbol;
    }
  }

  if (inputLower.length >= 3) {
    const containsName = options.find((option) => option.name.toLowerCase().includes(inputLower));
    if (containsName) {
      return containsName.symbol;
    }
  }

  return null;
}

function parseLocalizedNumber(rawInput: string): number {
  const text = rawInput.trim().replace(/\s+/g, '');
  if (!text) {
    return Number.NaN;
  }
  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      return Number(text.replace(/\./g, '').replace(',', '.'));
    }
    return Number(text.replace(/,/g, ''));
  }
  if (text.includes(',')) {
    return Number(text.replace(',', '.'));
  }
  return Number(text);
}

export default function PortfolioScreen() {
  const { request } = useAuth();
  const colors = useThemeColors();
  const loadedOnceRef = useRef(false);
  const [holdings, setHoldings] = useState<CryptoHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [symbolOptions, setSymbolOptions] = useState<SymbolOption[]>(POPULAR_ASSETS);
  const [symbolLoading, setSymbolLoading] = useState(false);
  const [form, setForm] = useState({
    symbol: '',
    quantity: '',
    buyPrice: '',
  });
  const showSkeleton = loading && holdings.length === 0 && !error;

  const fetchPortfolio = useCallback(async () => {
    return request<CryptoHolding[]>(`/crypto/holdings?currency=${DEFAULT_CURRENCY}`);
  }, [request]);

  const fetchSymbols = useCallback(async () => {
    setSymbolLoading(true);
    try {
      const rows = await request<CryptoSymbol[]>('/crypto/symbols');
      if (!rows.length) {
        return;
      }
      const merged = new Map<string, SymbolOption>();
      POPULAR_ASSETS.forEach((item) => merged.set(item.symbol, item));
      rows.forEach((row) => {
        const symbol = row.symbol.toUpperCase();
        merged.set(symbol, {
          symbol,
          name: merged.get(symbol)?.name ?? symbol,
        });
      });
      setSymbolOptions(Array.from(merged.values()));
    } catch {
      // Keep fallback symbols when backend list is unavailable.
    } finally {
      setSymbolLoading(false);
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const firstLoad = !loadedOnceRef.current;
        if (firstLoad) {
          setLoading(true);
        }
        try {
          const holdingData = await fetchPortfolio();
          if (!active) return;
          setHoldings(holdingData);
          setError('');
        } catch (requestError) {
          if (!active) return;
          if (requestError instanceof ApiError && requestError.message) {
            setError(requestError.message);
          } else {
            setError('Unable to load portfolio.');
          }
        } finally {
          if (firstLoad && active) {
            setLoading(false);
            loadedOnceRef.current = true;
          }
        }
      };
      void run();
      return () => {
        active = false;
      };
    }, [fetchPortfolio])
  );

  useEffect(() => {
    void fetchSymbols();
  }, [fetchSymbols]);

  const reloadPortfolio = useCallback(async () => {
    const holdingData = await fetchPortfolio();
    setHoldings(holdingData);
    setError('');
  }, [fetchPortfolio]);

  const handleRefresh = async () => {
    if (holdings.length === 0) {
      setError('Add assets before refreshing prices.');
      return;
    }
    setRefreshing(true);
    setError('');
    try {
      const symbols = [...new Set(holdings.map((holding) => holding.symbol))];
      await request('/crypto/prices/refresh', {
        method: 'POST',
        body: {
          symbols,
          currency: DEFAULT_CURRENCY,
        },
      });
      await reloadPortfolio();
    } catch {
      setError('Unable to refresh prices.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddAsset = async () => {
    const rawSymbolInput = form.symbol.trim();
    const matchedSymbol = resolveSymbolInput(rawSymbolInput, symbolOptions);
    const symbol = (matchedSymbol ?? rawSymbolInput).toUpperCase();
    const quantity = parseLocalizedNumber(form.quantity);
    const buyPrice = form.buyPrice.trim() ? parseLocalizedNumber(form.buyPrice) : null;

    if (!symbol) {
      setFormError('Symbol is required.');
      return;
    }
    if (!/^[A-Z0-9]{2,15}$/.test(symbol)) {
      setFormError('Use a valid asset symbol, e.g. BTC or ETH.');
      return;
    }
    if (Number.isNaN(quantity) || quantity <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (buyPrice !== null && (Number.isNaN(buyPrice) || buyPrice < 0)) {
      setFormError('Buy price must be zero or positive.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (matchedSymbol && matchedSymbol !== form.symbol.trim().toUpperCase()) {
        setForm((prev) => ({ ...prev, symbol: matchedSymbol }));
      }
      const created = await request<CryptoHolding>('/crypto/holdings', {
        method: 'POST',
        body: {
          symbol,
          quantity,
          buy_price: buyPrice,
        },
      });
      setHoldings((prev) => [created, ...prev]);
      setForm({
        symbol: '',
        quantity: '',
        buyPrice: '',
      });
      setShowForm(false);
      void (async () => {
        try {
          await request('/crypto/prices/refresh', {
            method: 'POST',
            body: {
              symbols: [symbol],
              currency: DEFAULT_CURRENCY,
            },
          });
          await reloadPortfolio();
        } catch {
          // Keep optimistic data if background price refresh fails.
        }
      })();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.message) {
        setFormError(requestError.message);
      } else {
        setFormError('Unable to add asset. Check symbol and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAsset = async (holding: CryptoHolding) => {
    Alert.alert('Remove asset', `Remove ${holding.symbol} from portfolio?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await request(`/crypto/holdings/${holding.id}`, { method: 'DELETE' });
              setHoldings((prev) => prev.filter((item) => item.id !== holding.id));
            } catch {
              setError('Unable to remove asset.');
            }
          })();
        },
      },
    ]);
  };

  const totalValue = holdings.reduce((sum, holding) => {
    const value = holding.current_value ?? (holding.current_price ?? 0) * holding.quantity;
    return sum + value;
  }, 0);

  const totalGainLoss = holdings.reduce((sum, holding) => {
    return sum + (holding.gain_loss ?? 0);
  }, 0);

  const filteredSymbolOptions = useMemo(() => {
    const query = form.symbol.trim().toUpperCase();
    if (!query) {
      return symbolOptions.slice(0, 8);
    }
    return symbolOptions
      .filter((item) => {
        return (
          item.symbol.includes(query) ||
          item.name.toLowerCase().includes(query.toLowerCase())
        );
      })
      .slice(0, 8);
  }, [form.symbol, symbolOptions]);

  const matchedSymbolPreview = useMemo(() => {
    return resolveSymbolInput(form.symbol, symbolOptions);
  }, [form.symbol, symbolOptions]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MenuButton style={styles.iconButton} />
          <Text style={styles.title}>Portfolio</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggleButton style={styles.iconButton} />
          <Pressable
            style={styles.iconButton}
            onPress={() =>
              setShowForm((prev) => {
                const next = !prev;
                if (!next) {
                  setFormError('');
                }
                return next;
              })
            }
            disabled={saving}>
            <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={colors.text} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={handleRefresh} disabled={refreshing}>
            <MaterialIcons name="sync" size={20} color={refreshing ? colors.muted : colors.text} />
          </Pressable>
        </View>
      </View>

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add Asset</Text>
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Symbol</Text>
              {symbolLoading ? <Text style={styles.labelHint}>Loading symbols...</Text> : null}
            </View>
            <TextInput
              style={styles.input}
              value={form.symbol}
              autoCapitalize="characters"
              placeholder="Search BTC, ETH..."
              placeholderTextColor={colors.muted}
              onChangeText={(text) => setForm((prev) => ({ ...prev, symbol: text }))}
            />
            {matchedSymbolPreview && matchedSymbolPreview !== form.symbol.trim().toUpperCase() ? (
              <Text style={styles.matchHint}>Matched to {matchedSymbolPreview}</Text>
            ) : null}
            <View style={styles.symbolList}>
              {filteredSymbolOptions.map((option) => {
                const isSelected = form.symbol.trim().toUpperCase() === option.symbol;
                return (
                  <Pressable
                    key={option.symbol}
                    style={[styles.symbolChip, isSelected && styles.symbolChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, symbol: option.symbol }))}>
                    <Text
                      style={[
                        styles.symbolChipText,
                        isSelected && styles.symbolChipTextActive,
                      ]}>
                      {option.symbol}
                    </Text>
                    <Text
                      style={[
                        styles.symbolChipSubtext,
                        isSelected && styles.symbolChipTextActive,
                      ]}>
                      {option.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldGrow}>
              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.input}
                value={form.quantity}
                keyboardType="numeric"
                placeholder="0.25"
                placeholderTextColor={colors.muted}
                onChangeText={(text) => setForm((prev) => ({ ...prev, quantity: text }))}
              />
            </View>
            <View style={styles.fieldGrow}>
              <Text style={styles.label}>Buy Price</Text>
              <TextInput
                style={styles.input}
                value={form.buyPrice}
                keyboardType="numeric"
                placeholder="45000"
                placeholderTextColor={colors.muted}
                onChangeText={(text) => setForm((prev) => ({ ...prev, buyPrice: text }))}
              />
            </View>
          </View>
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <Pressable
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={handleAddAsset}
            disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save asset'}</Text>
          </Pressable>
        </View>
      ) : null}

      {showSkeleton ? (
        <View style={styles.hero}>
          <Skeleton width={90} height={10} style={styles.heroSkeleton} />
          <Skeleton width={160} height={22} style={styles.heroSkeleton} />
          <Skeleton width={140} height={10} style={styles.heroSkeleton} />
        </View>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Total Value</Text>
          <Text style={styles.heroAmount}>
            {DEFAULT_CURRENCY} {totalValue.toFixed(2)}
          </Text>
          <Text style={[styles.heroDelta, totalGainLoss >= 0 ? styles.heroDeltaPositive : styles.heroDeltaNegative]}>
            {totalGainLoss >= 0 ? '+' : ''}
            {DEFAULT_CURRENCY} {totalGainLoss.toFixed(2)} total gain/loss
          </Text>
        </View>
      )}

      <View style={styles.card}>
        {showSkeleton ? (
          <PortfolioSkeleton styles={styles} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && holdings.length === 0 ? (
              <Text style={styles.emptyText}>No assets yet. Add your first holding.</Text>
            ) : null}
            {holdings.map((coin) => {
              const price = coin.current_price ?? 0;
              const value = coin.current_value ?? price * coin.quantity;
              const gainLoss = coin.gain_loss;
              const gainLossPct = coin.gain_loss_pct;
              const hasGainData = gainLoss !== null && gainLoss !== undefined;
              const isPositive = (gainLoss ?? 0) >= 0;

              return (
                <View key={coin.id} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <View>
                      <Text style={styles.rowTitle}>{coin.symbol}</Text>
                      <Text style={styles.rowSubtitle}>
                        Amount {coin.quantity.toFixed(6)}
                        {coin.buy_price !== null && coin.buy_price !== undefined
                          ? ` | Buy ${DEFAULT_CURRENCY} ${coin.buy_price.toFixed(2)}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowValue}>
                      {DEFAULT_CURRENCY} {value.toFixed(2)}
                    </Text>
                    <Text style={styles.rowChange}>
                      {price > 0
                        ? `Price ${DEFAULT_CURRENCY} ${price.toFixed(2)}`
                        : 'Price unavailable'}
                    </Text>
                    {hasGainData ? (
                      <Text style={[styles.rowGain, isPositive ? styles.gainPositive : styles.gainNegative]}>
                        {isPositive ? '+' : ''}
                        {DEFAULT_CURRENCY} {(gainLoss ?? 0).toFixed(2)}
                        {gainLossPct !== null && gainLossPct !== undefined
                          ? ` (${isPositive ? '+' : ''}${gainLossPct.toFixed(2)}%)`
                          : ''}
                      </Text>
                    ) : null}
                    <Pressable style={styles.deleteButton} onPress={() => handleDeleteAsset(coin)}>
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
    formCard: {
      backgroundColor: colors.card,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
      gap: SPACING.md,
      shadowColor: colors.shadow,
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
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
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelHint: {
      color: colors.muted,
      fontSize: 11,
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
    symbolList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    matchHint: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: '600',
      marginTop: SPACING.xs,
    },
    symbolChip: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      backgroundColor: colors.card,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      minWidth: 88,
    },
    symbolChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    symbolChipText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },
    symbolChipSubtext: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 2,
    },
    symbolChipTextActive: {
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
      letterSpacing: 1.2,
      fontSize: 12,
    },
    heroAmount: {
      color: '#fff',
      fontSize: 32,
      fontWeight: '700',
      marginTop: SPACING.sm,
    },
    heroDelta: {
      marginTop: SPACING.sm,
      fontWeight: '600',
    },
    heroDeltaPositive: {
      color: '#D1FAE5',
    },
    heroDeltaNegative: {
      color: '#FECACA',
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
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    rowSubtitle: {
      marginTop: 4,
      color: colors.muted,
    },
    rowRight: {
      alignItems: 'flex-end',
      gap: 4,
    },
    rowValue: {
      fontWeight: '700',
      color: colors.text,
    },
    rowChange: {
      color: colors.muted,
      fontWeight: '600',
      fontSize: 12,
    },
    rowGain: {
      fontWeight: '700',
      fontSize: 12,
    },
    gainPositive: {
      color: colors.accent,
    },
    gainNegative: {
      color: colors.danger,
    },
    deleteButton: {
      marginTop: 6,
      width: 28,
      height: 28,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
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
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.35)',
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

type PortfolioStyles = ReturnType<typeof createStyles>;

function PortfolioSkeleton({ styles }: { styles: PortfolioStyles }) {
  return (
    <View style={{ gap: SPACING.md }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonText}>
            <Skeleton width={60} height={12} />
            <Skeleton width={130} height={10} />
          </View>
          <View style={styles.skeletonText}>
            <Skeleton width={90} height={12} />
            <Skeleton width={70} height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}
