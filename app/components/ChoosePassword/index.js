import React, { Component } from 'react';
import PropTypes from 'prop-types';
import {
	Animated,
	Switch,
	AsyncStorage,
	ActivityIndicator,
	Alert,
	Text,
	View,
	TextInput,
	SafeAreaView,
	StyleSheet,
	Platform,
	TouchableOpacity
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { connect } from 'react-redux';
import { passwordSet } from '../../actions/user';
import StyledButton from '../StyledButton';
import Engine from '../../core/Engine';

import { colors, fontStyles } from '../../styles/common';
import { strings } from '../../../locales/i18n';
import { getOnboardingNavbarOptions } from '../Navbar';
import SecureKeychain from '../../core/SecureKeychain';
import Icon from 'react-native-vector-icons/FontAwesome';

const styles = StyleSheet.create({
	mainWrapper: {
		backgroundColor: colors.white,
		flex: 1
	},
	wrapper: {
		flex: 1,
		padding: 20
	},
	content: {
		alignItems: 'flex-start'
	},
	title: {
		width: 200,
		fontSize: 32,
		marginTop: 20,
		marginBottom: 20,
		color: colors.fontPrimary,
		justifyContent: 'center',
		textAlign: 'left',
		...fontStyles.normal
	},
	subtitle: {
		fontSize: 16,
		lineHeight: 23,
		color: colors.fontPrimary,
		textAlign: 'left',
		...fontStyles.normal
	},
	text: {
		marginBottom: 10,
		justifyContent: 'center'
	},

	label: {
		position: 'absolute',
		marginTop: -35,
		marginLeft: 5,
		fontSize: 16,
		color: colors.fontSecondary,
		textAlign: 'left',
		...fontStyles.normal
	},
	field: {
		marginTop: 20,
		marginBottom: 10
	},
	input: {
		borderBottomWidth: Platform.OS === 'android' ? 0 : 1,
		borderBottomColor: colors.borderColor,
		paddingLeft: 0,
		paddingVertical: 10,
		borderRadius: 4,
		fontSize: Platform.OS === 'android' ? 14 : 20,
		...fontStyles.normal
	},
	ctaWrapper: {
		marginTop: 20,
		paddingHorizontal: 10
	},
	errorMsg: {
		color: colors.error,
		...fontStyles.normal
	},
	biometrics: {
		alignItems: 'flex-start',
		marginTop: 30,
		marginBottom: 30
	},
	biometryLabel: {
		flex: 1,
		fontSize: 16,
		...fontStyles.normal
	},
	biometrySwitch: {
		marginTop: 10,
		flex: 0
	},
	passwordStrengthLabel: {
		height: 20,
		marginLeft: 5,
		marginTop: 10,
		fontSize: 12,
		color: colors.fontSecondary,
		textAlign: 'left',
		...fontStyles.normal
	},
	// eslint-disable-next-line react-native/no-unused-styles
	strength_weak: {
		color: colors.red
	},
	// eslint-disable-next-line react-native/no-unused-styles
	strength_good: {
		color: colors.primary
	},
	// eslint-disable-next-line react-native/no-unused-styles
	strength_strong: {
		color: colors.brightGreen
	},
	showHideToggle: {
		position: 'absolute',
		marginTop: 8,
		alignSelf: 'flex-end'
	},
	showMatchingPasswords: {
		position: 'absolute',
		marginTop: 8,
		alignSelf: 'flex-end'
	}
});

const PASSCODE_NOT_SET_ERROR = 'Error: Passcode not set.';

/**
 * View where users can set their password for the first time
 */
class ChoosePassword extends Component {
	static navigationOptions = ({ navigation }) => getOnboardingNavbarOptions(navigation);

	static propTypes = {
		/**
		 * The navigator object
		 */
		navigation: PropTypes.object,
		/**
		 * The action to update the password set flag
		 * in the redux store
		 */
		passwordSet: PropTypes.func
	};

	state = {
		password: '',
		confirmPassword: '',
		secureTextEntry: true,
		biometryType: null,
		biometryChoice: false,
		labelsScaleNew: new Animated.Value(1),
		labelsScaleConfirm: new Animated.Value(1),
		loading: false,
		error: null
	};

	mounted = true;

	confirmPasswordInput = React.createRef();

	async componentDidMount() {
		const biometryType = await SecureKeychain.getSupportedBiometryType();
		if (biometryType) {
			this.setState({ biometryType, biometryChoice: true });
		}
	}

	componentWillUnmount() {
		this.mounted = false;
	}

	onPressCreate = async () => {
		if (this.state.loading) return;
		let error = null;
		if (this.state.password.length < 8) {
			error = strings('choose_password.password_length_error');
		} else if (this.state.password !== this.state.confirmPassword) {
			error = strings('choose_password.password_dont_match');
		}
		if (error) {
			Alert.alert('Error', error);
		} else {
			try {
				this.setState({ loading: true });
				const { KeyringController } = Engine.context;
				const mnemonic = await KeyringController.exportSeedPhrase('');
				const seed = JSON.stringify(mnemonic).replace(/"/g, '');
				await KeyringController.createNewVaultAndRestore(this.state.password, seed);

				const authOptions = {
					accessControl: this.state.biometryChoice
						? SecureKeychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE
						: SecureKeychain.ACCESS_CONTROL.DEVICE_PASSCODE
				};

				await SecureKeychain.setGenericPassword('metamask-user', this.state.password, authOptions);

				if (!this.state.biometryChoice) {
					await AsyncStorage.removeItem('@MetaMask:biometryChoice');
				} else {
					await AsyncStorage.setItem('@MetaMask:biometryChoice', this.state.biometryType);
				}

				// mark the user as existing so it doesn't see the create password screen again
				await AsyncStorage.setItem('@MetaMask:existingUser', 'true');
				this.setState({ loading: false });
				this.props.passwordSet();
				this.props.navigation.navigate('AccountBackupStep1', { words: seed.split(' ') });
			} catch (error) {
				// Should we force people to enable passcode / biometrics?
				if (error.toString() === PASSCODE_NOT_SET_ERROR) {
					Alert.alert(
						strings('choose_password.security_alert_title'),
						strings('choose_password.security_alert_message')
					);
					this.setState({ loading: false });
				} else {
					this.setState({ loading: false, error: error.toString() });
				}
			}
		}
	};

	jumpToConfirmPassword = () => {
		const { current } = this.confirmPasswordInput;
		current && current.focus();
	};

	animateInLabel = label => {
		if (
			(label === 'new' && this.state.password !== '') ||
			(label === 'confirm' && this.state.confirmPassword !== '')
		) {
			return;
		}
		Animated.timing(label === 'new' ? this.state.labelsScaleNew : this.state.labelsScaleConfirm, {
			toValue: 1,
			duration: 200,
			useNativeDriver: true
		}).start();
	};

	animateOutLabel = label => {
		Animated.timing(label === 'new' ? this.state.labelsScaleNew : this.state.labelsScaleConfirm, {
			toValue: 0.66,
			duration: 200,
			useNativeDriver: true
		}).start();
	};

	getPasswordStrengthWord() {
		switch (this.state.passwordStrength) {
			case 1:
				return 'weak';
			case 2:
				return 'good';
			case 3:
				return 'strong';
		}
	}

	onPasswordChange = val => {
		let strength = 1;

		// If the password length is greater than 6 and contain alphabet,number,special character respectively
		if (
			val.length > 6 &&
			((val.match(/[a-z]/) && val.match(/\d+/)) ||
				(val.match(/\d+/) && val.match(/.[!,@,#,$,%,^,&,*,?,_,~,-,(,)]/)) ||
				(val.match(/[a-z]/) && val.match(/.[!,@,#,$,%,^,&,*,?,_,~,-,(,)]/)))
		)
			strength = 2;

		// If the password length is greater than 6 and must contain alphabets,numbers and special characters
		if (val.length > 6 && val.match(/[a-z]/) && val.match(/\d+/) && val.match(/.[!,@,#,$,%,^,&,*,?,_,~,-,(,)]/))
			strength = 3;

		this.setState({ password: val, passwordStrength: strength });
	};

	toggleShowHide = () => {
		this.setState({ secureTextEntry: !this.state.secureTextEntry });
	};

	render() {
		const startX = 0;
		const startY = 0;
		const width = 100;
		const height = 24;
		const initialScale = 1;
		const endX = 0;
		const endY = 50;

		return (
			<SafeAreaView style={styles.mainWrapper}>
				<View style={styles.wrapper} testID={'choose-password-screen'}>
					<KeyboardAwareScrollView style={styles.wrapper} resetScrollToCoords={{ x: 0, y: 0 }}>
						<View testID={'create-password-screen'}>
							<View style={styles.content}>
								<Text style={styles.title}>{strings('choose_password.title')}</Text>
								<View style={styles.text}>
									<Text style={styles.subtitle}>{strings('choose_password.subtitle')}</Text>
								</View>
							</View>
							<View style={styles.field}>
								<Animated.Text
									style={[
										styles.label,
										{
											transform: [
												{
													scale: this.state.labelsScaleNew
												},
												{
													translateX: this.state.labelsScaleNew.interpolate({
														inputRange: [0, 1],
														outputRange: [
															startX - width / 2 - (width * initialScale) / 2,
															endX
														]
													})
												},
												{
													translateY: this.state.labelsScaleNew.interpolate({
														inputRange: [0, 1],
														outputRange: [
															startY - height / 2 - (height * initialScale) / 2,
															endY
														]
													})
												}
											]
										}
									]}
								>
									{strings('choose_password.password')}
								</Animated.Text>
								<TextInput
									style={styles.input}
									value={this.state.password}
									onChangeText={this.onPasswordChange} // eslint-disable-line  react/jsx-no-bind
									secureTextEntry={this.state.secureTextEntry}
									placeholder={''}
									underlineColorAndroid={colors.borderColor}
									testID={'input-password'}
									onSubmitEditing={this.jumpToConfirmPassword}
									returnKeyType={'next'}
									onFocus={() => this.animateOutLabel('new')} // eslint-disable-line  react/jsx-no-bind
									onBlur={() => this.animateInLabel('new')} // eslint-disable-line  react/jsx-no-bind
								/>
								<TouchableOpacity onPress={this.toggleShowHide} style={styles.showHideToggle}>
									<Text style={styles.passwordStrengthLabel}>
										{strings(`choose_password.${this.state.secureTextEntry ? 'show' : 'hide'}`)}
									</Text>
								</TouchableOpacity>
								{(this.state.password !== '' && (
									<Text style={styles.passwordStrengthLabel}>
										{strings('choose_password.password_strength')}
										<Text style={styles[`strength_${this.getPasswordStrengthWord()}`]}>
											{' '}
											{strings(`choose_password.strength_${this.getPasswordStrengthWord()}`)}
										</Text>
									</Text>
								)) || <Text style={styles.passwordStrengthLabel} />}
							</View>
							<View style={styles.field}>
								<Animated.Text
									style={[
										styles.label,
										{
											transform: [
												{
													scale: this.state.labelsScaleConfirm
												},
												{
													translateX: this.state.labelsScaleConfirm.interpolate({
														inputRange: [0, 1],
														outputRange: [
															startX - width / 2 - (width * initialScale) / 2,
															endX
														]
													})
												},
												{
													translateY: this.state.labelsScaleConfirm.interpolate({
														inputRange: [0, 1],
														outputRange: [
															startY - height / 2 - (height * initialScale) / 2,
															endY
														]
													})
												}
											]
										}
									]}
								>
									{strings('choose_password.confirm_password')}
								</Animated.Text>
								<TextInput
									ref={this.confirmPasswordInput}
									style={styles.input}
									value={this.state.confirmPassword}
									onChangeText={val => this.setState({ confirmPassword: val })} // eslint-disable-line  react/jsx-no-bind
									secureTextEntry={this.state.secureTextEntry}
									placeholder={''}
									underlineColorAndroid={colors.borderColor}
									testID={'input-password-confirm'}
									onSubmitEditing={this.onPressCreate}
									returnKeyType={'done'}
									onFocus={() => this.animateOutLabel('confirm')} // eslint-disable-line  react/jsx-no-bind
									onBlur={() => this.animateInLabel('confirm')} // eslint-disable-line  react/jsx-no-bind
								/>
								<View style={styles.showMatchingPasswords}>
									{this.state.password !== '' &&
									this.state.password === this.state.confirmPassword ? (
										<Icon name="check" size={12} color={colors.brightGreen} />
									) : null}
								</View>
								<Text style={styles.passwordStrengthLabel}>
									{strings('choose_password.must_be_at_least', { number: 8 })}
								</Text>
							</View>

							{this.state.biometryType && (
								<View style={styles.biometrics}>
									<Text style={styles.biometryLabel}>
										{strings(`biometrics.enable_${this.state.biometryType.toLowerCase()}`)}
									</Text>
									<Switch
										onValueChange={biometryChoice => this.setState({ biometryChoice })} // eslint-disable-line react/jsx-no-bind
										value={this.state.biometryChoice}
										style={styles.biometrySwitch}
										trackColor={
											Platform.OS === 'ios'
												? { true: colors.switchOnColor, false: colors.switchOffColor }
												: null
										}
										ios_backgroundColor={colors.switchOffColor}
									/>
								</View>
							)}

							{this.state.error && <Text style={styles.errorMsg}>{this.state.error}</Text>}
						</View>
					</KeyboardAwareScrollView>
					<View style={styles.ctaWrapper}>
						<StyledButton
							type={'blue'}
							onPress={this.onPressCreate}
							testID={'submit-button'}
							disabled={
								!(this.state.password !== '' && this.state.password === this.state.confirmPassword)
							}
						>
							{this.state.loading ? (
								<ActivityIndicator size="small" color="white" />
							) : (
								strings('choose_password.create_button')
							)}
						</StyledButton>
					</View>
				</View>
			</SafeAreaView>
		);
	}
}

const mapDispatchToProps = dispatch => ({
	passwordSet: () => dispatch(passwordSet())
});

export default connect(
	null,
	mapDispatchToProps
)(ChoosePassword);
