import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import supabase from '../../lib/supabase';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const handledUrls = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;

    const handleRecoveryUrl = async (url: string) => {
      if (handledUrls.current.has(url)) return;
      handledUrls.current.add(url);

      const params = parseUrlParams(url);
      const linkError =
        params.get('error_description') ?? params.get('error');
      if (linkError) {
        if (isMounted) {
          setIsCheckingLink(false);
          setErrorMessage(linkError);
        }
        return;
      }

      const type = params.get('type');
      const code = params.get('code');
      const tokenHash = params.get('token_hash');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (type !== 'recovery' && !code) {
        if (isMounted) {
          setIsCheckingLink(false);
          setErrorMessage(
            'Open the password reset link from your email to continue.',
          );
        }
        return;
      }

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (type === 'recovery' && tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (error) throw error;
        } else if (type === 'recovery' && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error(
            'The password reset link is invalid or has expired. Request a new one from Settings > Security.',
          );
        }

        if (isMounted) {
          setIsCheckingLink(false);
          setIsRecoveryReady(true);
          setErrorMessage('');
        }
      } catch (error) {
        if (isMounted) {
          setIsCheckingLink(false);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to verify the password reset link. Request a new one from Settings > Security.',
          );
        }
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleRecoveryUrl(url);
    });

    void Linking.getInitialURL()
      .then((url) => {
        if (url) {
          void handleRecoveryUrl(url);
        } else if (isMounted) {
          setIsCheckingLink(false);
          setErrorMessage(
            'Open the password reset link from your email to continue.',
          );
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setIsCheckingLink(false);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to read the password reset link.',
          );
        }
      });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const updatePassword = async () => {
    if (isUpdating || isComplete) return;

    setErrorMessage('');
    setSuccessMessage('');
    if (!isRecoveryReady) {
      setErrorMessage('Open the password reset link from your email to continue.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Your password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Your passwords do not match.');
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsComplete(true);
      setPassword('');
      setConfirmPassword('');
      setSuccessMessage('Your password has been updated successfully.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to update your password. Please try again.',
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <LinearGradient
      colors={['#351356', '#511079', '#17152D']}
      locations={[0, 0.48, 1]}
      style={styles.screen}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.centerWrap}
      >
        <View style={styles.cardWrap}>
          <BlurView
            intensity={40}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(60,60,90,0.35)', 'rgba(150,150,170,0.25)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.cardContent}>
            <Image
              source={require('../../../assets/images/authpage/Logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="W.A.T.C.H. logo"
            />
            <Text style={styles.brand}>W.A.T.C.H.</Text>

            <View style={styles.intro}>
              <Text style={styles.heading}>Create New Password</Text>
              <Text style={styles.description}>
                Choose a strong password to secure your account.
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                accessibilityLabel="New password"
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor="rgba(255,255,255,0.9)"
                autoCapitalize="none"
                autoComplete="new-password"
                editable={isRecoveryReady && !isUpdating && !isComplete}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
                value={password}
              />
              <Text style={[styles.label, styles.confirmLabel]}>
                Confirm New Password
              </Text>
              <TextInput
                accessibilityLabel="Confirm new password"
                style={styles.input}
                placeholder="Re-enter new password"
                placeholderTextColor="rgba(255,255,255,0.9)"
                autoCapitalize="none"
                autoComplete="new-password"
                editable={isRecoveryReady && !isUpdating && !isComplete}
                onChangeText={setConfirmPassword}
                secureTextEntry
                textContentType="newPassword"
                value={confirmPassword}
              />

              {isCheckingLink ? (
                <Text style={styles.statusText}>Verifying reset link...</Text>
              ) : null}
              {errorMessage ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {errorMessage}
                </Text>
              ) : null}
              {successMessage ? (
                <Text accessibilityRole="text" style={styles.successText}>
                  {successMessage}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    !isRecoveryReady || isUpdating || isComplete,
                }}
                disabled={!isRecoveryReady || isUpdating || isComplete}
                onPress={() => void updatePassword()}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  (!isRecoveryReady || isUpdating || isComplete) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.buttonText}>
                  {isUpdating
                    ? 'Updating...'
                    : isComplete
                      ? 'Password Updated'
                      : 'Update Password'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerPrompt}>Ready to sign in? </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.replace('/auth/login')}
              >
                <Text style={styles.loginLink}>Log in</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function parseUrlParams(url: string) {
  const hashIndex = url.indexOf('#');
  const urlWithoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const query = urlWithoutHash.split('?')[1] ?? '';
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex + 1);
  const search = [query, fragment].filter(Boolean).join('&');
  return new URLSearchParams(search);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cardWrap: {
    height: '72%',
    overflow: 'hidden',
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(185,195,255,0.75)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 32,
    paddingBottom: 26,
  },
  logo: {
    width: 76,
    height: 76,
    alignSelf: 'center',
  },
  brand: {
    marginTop: 14,
    color: '#f2f2f5',
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 3.5,
    textAlign: 'center',
  },
  intro: {
    alignItems: 'center',
    marginTop: 42,
  },
  heading: {
    color: '#f4f4f8',
    fontSize: 25,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  form: {
    marginTop: 32,
  },
  label: {
    marginBottom: 7,
    marginLeft: 9,
    color: '#f4f4f8',
    fontSize: 16,
  },
  confirmLabel: {
    marginTop: 16,
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.42)',
    color: '#ffffff',
    fontSize: 17,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 4,
  },
  button: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    borderWidth: 1,
    borderColor: 'rgba(90,115,255,0.6)',
    borderRadius: 24,
    backgroundColor: 'rgba(40,45,94,0.9)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#f2f2f5',
    fontSize: 19,
    fontWeight: '500',
  },
  statusText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    color: '#FFD4D4',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  successText: {
    marginTop: 12,
    color: '#D5FFD9',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
  },
  footerPrompt: {
    color: '#ffffff',
    fontSize: 14,
  },
  loginLink: {
    color: '#b7d0ff',
    fontSize: 14,
    fontWeight: '600',
  },
});