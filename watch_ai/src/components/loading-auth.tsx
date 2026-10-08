import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoadingAuth() {
	const rotation = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = Animated.loop(
			Animated.timing(rotation, {
				toValue: 1,
				duration: 900,
				easing: Easing.linear,
				useNativeDriver: true,
			}),
		);
		animation.start();

		return () => animation.stop();
	}, [rotation]);

	const spin = rotation.interpolate({
		inputRange: [0, 1],
		outputRange: ['0deg', '360deg'],
	});

	return (
		<LinearGradient
			colors={['#303653', '#1c1f38']}
			locations={[0, 1]}
			style={styles.screen}
		>
			<View style={styles.loaderTile} accessibilityLabel="Loading">
				<Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
			</View>
		</LinearGradient>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	loaderTile: {
		width: 24,
		height: 24,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 3,
		backgroundColor: '#aaa8c3',
	},
	spinner: {
		width: 13,
		height: 13,
		borderWidth: 2,
		borderColor: '#66647f',
		borderTopColor: 'transparent',
		borderRadius: 7,
	},
});