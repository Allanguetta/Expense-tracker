import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useAuth } from '@/context/auth';
import { RADIUS, SPACING, type ThemeColors } from '@/constants/ui-theme';
import { useThemeColors } from '@/context/theme';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await signUp(normalizedEmail, password);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.toLowerCase().includes('email already registered')) {
          setError('Email already registered. Try logging in instead.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = () => {
    setError('Google sign-in is not configured yet.');
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start tracking your finances.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@email.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Create a password"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          style={[styles.button, submitting && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>{submitting ? 'Creating...' : 'Create Account'}</Text>
        </Pressable>

        <Pressable onPress={onGoogle} style={styles.googleButton}>
          <MaterialCommunityIcons name="google" size={18} color={colors.text} />
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/(auth)/login" style={styles.footerLink}>
            Sign in
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: 8,
    color: colors.muted,
  },
  field: {
    marginTop: SPACING.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.line,
  },
  error: {
    marginTop: SPACING.md,
    color: colors.danger,
  },
  button: {
    marginTop: SPACING.lg,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  googleButton: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  googleText: {
    color: colors.text,
    fontWeight: '600',
  },
  footer: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  footerText: {
    color: colors.muted,
  },
  footerLink: {
    color: colors.primary,
    fontWeight: '700',
  },
  });

