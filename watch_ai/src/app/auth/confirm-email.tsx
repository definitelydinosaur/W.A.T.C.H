import React, { useCallback, useEffect, useState } from 'react';
import {
	BackHandler,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import supabase from '../../lib/supabase';
import { safeBack } from '../../utils/safeBack';

const OTP_LENGTH = 6;
const RESEND_DELAY_SECONDS = 60;

export default function ConfirmEmailScreen() {
	const { email: routeEmail } = useLocalSearchParams<{ email?: string }>();
	const email = typeof routeEmail === 'string' ? routeEmail.trim().toLowerCase() : '';
	const [code, setCode] = useState('');
	const [isVerifying, setIsVerifying] = useState(false);
	const [isVerified, setIsVerified] = useState(false);
	const [verificationError, setVerificationError] = useState('');
	const [isResending, setIsResending] = useState(false);
	const [resendCountdown, setResendCountdown] = useState(RESEND_DELAY_SECONDS);
	const [resendNotice, setResendNotice] = useState('');

	const returnToRegistration = useCallback(
		() => safeBack({ pathname: '/auth/register', params: { email } }),
		[email],
	);

	useEffect(() => {
		if (Platform.OS !== 'android') return;
		const subscription = BackHandler.addEventListener(
			'hardwareBackPress',
			() => {
				returnToRegistration();
				return true;
			},
		);
		return () => subscription.remove();
	}, [returnToRegistration]);

	useEffect(() => {
		if (resendCountdown === 0) return;
		const countdown = setTimeout(() => setResendCountdown((seconds) => seconds - 1), 1000);
		return () => clearTimeout(countdown);
	}, [resendCountdown]);

	const maskedEmail = (() => {
		const separator = email.lastIndexOf('@');
		if (separator < 1) return email || 'your email address';
		return `${email[0]}${'*'.repeat(Math.max(6, separator - 1))}${email.slice(separator)}`;
	})();

	const verifyCode = async () => {
		if (code.length !== OTP_LENGTH || !email || isVerifying) return;

		setIsVerifying(true);
		setVerificationError('');
		setResendNotice('');
		try {
			const { error } = await supabase.auth.verifyOtp({
				email,
				token: code,
				type: 'signup',
			});
			if (error) throw error;
			setIsVerified(true);
		} catch (error) {
			setVerificationError(
				error instanceof Error ? error.message : 'That code could not be verified. Try again.',
			);
			setIsVerified(false);
		} finally {
			setIsVerifying(false);
		}
	};

	const resendCode = async () => {
		if (!email || resendCountdown > 0 || isResending) return;

		setIsResending(true);
		setVerificationError('');
		setResendNotice('');
		try {
			const { error } = await supabase.auth.resend({ type: 'signup', email });
			if (error) throw error;
			setCode('');
			setIsVerified(false);
			setResendCountdown(RESEND_DELAY_SECONDS);
			setResendNotice('A new code was sent.');
		} catch (error) {
			setVerificationError(
				error instanceof Error
					? error.message
					: 'Please try again in a moment.',
			);
		} finally {
			setIsResending(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
			<KeyboardAvoidingView
				style={styles.screen}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<View style={styles.content}>
					<Text style={styles.heading}>
						Enter the 6-digit code sent to you{`\n`}at: {maskedEmail}
					</Text>

					<View style={styles.codeRow}>
						{Array.from({ length: OTP_LENGTH }, (_, index) => (
							<View
								key={index}
								style={[styles.codeCell, code[index] ? styles.filledCodeCell : null]}
								pointerEvents="none"
							>
								<Text style={styles.codeDigit}>{code[index] ?? ''}</Text>
							</View>
						))}
						<TextInput
							accessibilityLabel="6-digit email verification code"
							autoFocus
							autoComplete="one-time-code"
							caretHidden
							editable={!isVerified && !isVerifying}
							keyboardType="number-pad"
							maxLength={OTP_LENGTH}
							onChangeText={(value) => {
								setCode(value.replace(/\D/g, '').slice(0, OTP_LENGTH));
								setVerificationError('');
							}}
							selectionColor="transparent"
							style={styles.codeInput}
							value={code}
						/>
					</View>

					{verificationError ? (
						<Text accessibilityRole="alert" style={styles.errorText}>
							{verificationError}
						</Text>
					) : null}
					{resendNotice ? (
						<Text accessibilityRole="text" style={styles.successText}>
							{resendNotice}
						</Text>
					) : null}

					<Pressable
						accessibilityRole="button"
						disabled={resendCountdown > 0 || isResending || isVerified}
						onPress={resendCode}
						style={styles.resendButton}
					>
						<Text style={styles.resendText}>
							{isResending
								? 'Sending code...'
								: resendCountdown > 0
									? `I haven't received a code (${String(Math.floor(resendCountdown / 60)).padStart(2, '0')}:${String(resendCountdown % 60).padStart(2, '0')})`
									: 'I haven\'t received a code? Resend'}
						</Text>
					</Pressable>

					<Pressable
						accessibilityRole="button"
						disabled={!isVerified}
						onPress={() =>
							router.replace({
								pathname: '/onboarding',
								params: { startRegistration: 'true' },
							})
						}
						style={[styles.passwordButton, !isVerified && styles.disabledPasswordButton]}
					>
						<Text style={[styles.passwordButtonText, !isVerified && styles.disabledPasswordText]}>
							Continue setup
						</Text>
					</Pressable>
				</View>

				<View style={styles.footer}>
					<Pressable
						accessibilityLabel="Back to registration"
						accessibilityRole="button"
						onPress={returnToRegistration}
						style={styles.backButton}
					>
						<Text style={styles.backIcon}>‹</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						disabled={code.length !== OTP_LENGTH || isVerifying || isVerified}
						onPress={verifyCode}
						style={[
							styles.nextButton,
							(code.length !== OTP_LENGTH || isVerifying || isVerified) && styles.disabledNextButton,
						]}
					>
						<Text style={styles.nextButtonText}>{isVerifying ? 'Checking...' : 'Next'}</Text>
					</Pressable>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: '#f4f6fa',
	},
	screen: {
		flex: 1,
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 12,
	},
	content: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	heading: {
		color: '#171821',
		fontSize: 17,
		fontWeight: '600',
		lineHeight: 24,
		textAlign: 'center',
		marginBottom: 28,
	},
	codeRow: {
		width: '100%',
		flexDirection: 'row',
		justifyContent: 'center',
		gap: 8,
		position: 'relative',
	},
	codeCell: {
		flex: 1,
		maxWidth: 72,
		height: 60,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#ffffff',
		borderColor: '#e4e7ed',
		borderWidth: 1,
		borderRadius: 8,
	},
	filledCodeCell: {
		borderColor: '#78729d',
	},
	codeDigit: {
		color: '#252333',
		fontSize: 26,
		fontWeight: '500',
	},
	codeInput: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		color: 'transparent',
		opacity: 0.02,
		textAlign: 'center',
	},
	errorText: {
		color: '#b42318',
		fontSize: 14,
		marginTop: 10,
		textAlign: 'center',
	},
	successText: {
		color: '#217a42',
		fontSize: 14,
		marginTop: 10,
		textAlign: 'center',
	},
	resendButton: {
		width: '100%',
		minHeight: 48,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#fafbfc',
		borderRadius: 8,
		marginTop: 32,
		paddingHorizontal: 12,
	},
	resendText: {
		color: '#a5aab4',
		fontSize: 13,
		textAlign: 'center',
	},
	passwordButton: {
		width: '100%',
		minHeight: 48,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#565078',
		borderRadius: 8,
		marginTop: 8,
	},
	disabledPasswordButton: {
		backgroundColor: '#eceef2',
	},
	passwordButtonText: {
		color: '#ffffff',
		fontSize: 14,
		fontWeight: '500',
	},
	disabledPasswordText: {
		color: '#aeb2bb',
	},
	footer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		minHeight: 48,
	},
	backButton: {
		width: 44,
		height: 44,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#dfe2e8',
		borderRadius: 22,
	},
	backIcon: {
		color: '#20212a',
		fontSize: 32,
		lineHeight: 36,
	},
	nextButton: {
		minWidth: 96,
		minHeight: 48,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#565078',
		borderRadius: 8,
		paddingHorizontal: 20,
	},
	disabledNextButton: {
		backgroundColor: '#aaa6c3',
	},
	nextButtonText: {
		color: '#ffffff',
		fontSize: 15,
		fontWeight: '500',
	},
});
