import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface DriverOtpVerificationModalProps {
  visible: boolean;
  correctOtp: string;
  customerName: string;
  onOtpVerified: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function DriverOtpVerificationModal({
  visible,
  correctOtp,
  customerName,
  onOtpVerified,
  onCancel,
  loading = false,
}: DriverOtpVerificationModalProps) {
  const [enteredOtp, setEnteredOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;

  const handleVerifyOtp = () => {
    if (!enteredOtp.trim()) {
      Alert.alert('Error', 'Por favor ingresa el código OTP');
      return;
    }

    if (enteredOtp.trim() === correctOtp.trim()) {
      console.log('✅ [OTP] Código correcto ingresado por conductor');
      setEnteredOtp('');
      setAttempts(0);
      onOtpVerified();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= MAX_ATTEMPTS) {
        Alert.alert(
          'Demasiados intentos',
          'Has superado el límite de intentos. Contacta al cliente.',
          [{ text: 'OK', onPress: onCancel }]
        );
        setEnteredOtp('');
        setAttempts(0);
      } else {
        Alert.alert(
          'Código incorrecto',
          `Código inválido. Intentos restantes: ${MAX_ATTEMPTS - newAttempts}`,
          [{ text: 'Reintentar' }]
        );
        setEnteredOtp('');
      }
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade">
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <MaterialCommunityIcons name="shield-check" size={40} color="#00f4f5" />
              <Text style={styles.title}>Verificar OTP</Text>
              <Text style={styles.subtitle}>
                Solicita el código al cliente {customerName}
              </Text>
            </View>

            {/* OTP Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Código OTP (4-6 dígitos)</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    enteredOtp.length === 0 ? styles.inputEmpty : styles.inputFilled,
                  ]}
                  placeholder="Código OTP"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={enteredOtp}
                  onChangeText={setEnteredOtp}
                  maxLength={6}
                  keyboardType="numeric"
                  secureTextEntry={!showOtp}
                  editable={!loading}
                  allowFontScaling={false}
                />
                <TouchableOpacity
                  onPress={() => setShowOtp(!showOtp)}
                  style={styles.eyeIcon}
                >
                  <MaterialCommunityIcons
                    name={showOtp ? 'eye' : 'eye-off'}
                    size={24}
                    color="#00f4f5"
                  />
                </TouchableOpacity>
              </View>
              
              {/* Attempts counter */}
              {attempts > 0 && (
                <Text style={styles.attemptsText}>
                  Intentos restantes: {MAX_ATTEMPTS - attempts}
                </Text>
              )}
            </View>

            {/* Info */}
            <View style={styles.infoBox}>
              <MaterialCommunityIcons name="information" size={20} color="#00f4f5" />
              <Text style={styles.infoText}>
                El cliente debe proporcionar este código para que inicies el viaje
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onCancel}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.verifyButton, loading && styles.buttonDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#00204a" size="small" />
                ) : (
                  <Text style={styles.verifyButtonText}>Verificar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    width: '85%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#00f4f5',
    shadowColor: '#00f4f5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#00f4f5',
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00f4f5',
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
    paddingRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#00f4f5',
  },
  inputEmpty: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0,
  },
  inputFilled: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
  },
  eyeIcon: {
    padding: 8,
  },
  attemptsText: {
    fontSize: 12,
    color: '#ff6b6b',
    marginTop: 8,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 244, 245, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: '#00f4f5',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#00f4f5',
    marginLeft: 12,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#00f4f5',
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00f4f5',
  },
  verifyButton: {
    backgroundColor: '#00f4f5',
  },
  verifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00204a',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
