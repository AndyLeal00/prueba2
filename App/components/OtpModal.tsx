import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import { Modal, View, StyleSheet, TextInput, TouchableOpacity, Text } from "react-native";
import { useColorScheme } from "react-native";

interface OtpModalProps {
  requestModalClose: () => void;
  modalVisible: boolean;
  otp?: string;
  verifyOtp?: (code: string) => Promise<boolean>;
  onMatch: (isMatch: boolean) => void;
  timeRemaining?: number; // 🔴 NUEVO: recibe tiempo sincronizado
  isExpired?: boolean; // 🔴 NUEVO: indica si el timer ya expiró
}

const OtpModal: React.FC<OtpModalProps> = ({
  requestModalClose,
  modalVisible,
  otp,
  onMatch,
  verifyOtp,
  timeRemaining = 0, // Default a 0 si no se pasa
  isExpired = true, // Default a true (código listo)
}) => {
  const [inputValue, setInputValue] = useState("");
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (modalVisible) {
      setInputValue("");
    }
  }, [modalVisible, otp]);

  const handleConfirm = async () => {
    const isMatch = verifyOtp ? await verifyOtp(inputValue).catch(() => false) : false;
    
    onMatch(isMatch);
    if (isMatch) {
      requestModalClose();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const styles = colorScheme === "dark" ? darkStyles : lightStyles;

  return (
    <Modal
      visible={modalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={requestModalClose}
    >
      <View style={styles.container}>
        <View style={styles.modalContainer}>
          <View style={styles.blankViewStyle}>
            <TouchableOpacity onPress={requestModalClose}>
              <AntDesign name="closecircleo" size={24} color="#00E5FF" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContainerViewStyle}>
            <Text style={styles.titleText}>Código de Verificación</Text>
            
            <Text style={styles.instructionText}>Pide al cliente su código y digítalo para iniciar el viaje.</Text>
            
            <TextInput
              style={styles.input}
              underlineColorAndroid="transparent"
              placeholder="0000"
              keyboardType="numeric"
              value={inputValue}
              onChangeText={setInputValue}
              maxLength={4}
              placeholderTextColor={colorScheme === "dark" ? "#666" : "#CCC"}
              editable={true}
            />
            
            <TouchableOpacity 
              style={styles.confirmButton}
              onPress={handleConfirm}
              disabled={inputValue.length < 4}
            >
              <Text style={styles.confirmButtonText}>
                {inputValue.length < 4 ? "Ingresa el código" : "Confirmar"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const lightStyles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingTop: 0,
  },
  modalContainer: {
    backgroundColor: "#E0F7FA",
    width: "85%",
    borderRadius: 16,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    borderWidth: 1.5,
    borderColor: "#00E5FF",
    padding: 24,
  },
  blankViewStyle: {
    flexDirection: "row",
    alignSelf: "flex-end",
    marginBottom: 12,
  },
  modalContainerViewStyle: {
    alignItems: "center",
  },
  titleText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#051A26",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#00E5FF",
  },
  timerText: {
    color: "#00d4d7",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
    letterSpacing: 2,
  },
  otpDisplayContainer: {
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#00E5FF",
    width: "90%",
    alignItems: "center",
  },
  otpLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  otpCode: {
    fontSize: 42,
    fontWeight: "700",
    color: "#00E5FF",
    letterSpacing: 6,
    fontFamily: "monospace",
  },
  instructionText: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  input: {
    fontSize: 32,
    marginBottom: 16,
    borderColor: "#00E5FF",
    borderWidth: 2,
    borderRadius: 8,
    width: "80%",
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 12,
    paddingLeft: 12,
    textAlign: "center",
    fontWeight: "600",
    letterSpacing: 4,
    backgroundColor: "#FFF",
    color: "#00E5FF",
  },
  confirmButton: {
    backgroundColor: "#00E5FF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 40,
    marginTop: 8,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  confirmButtonText: {
    color: "#051A26",
    fontSize: 16,
    fontWeight: "700",
  },
});
const darkStyles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingTop: 0,
  },
  modalContainer: {
    backgroundColor: "#051A26",
    width: "85%",
    borderRadius: 16,
    elevation: 20,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    borderWidth: 1.5,
    borderColor: "#00E5FF",
    padding: 24,
  },
  blankViewStyle: {
    flexDirection: "row",
    alignSelf: "flex-end",
    marginBottom: 12,
  },
  modalContainerViewStyle: {
    alignItems: "center",
  },
  titleText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#00E5FF",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#00E5FF",
  },
  timerText: {
    color: "#00E5FF",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
    letterSpacing: 2,
  },
  otpDisplayContainer: {
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#00E5FF",
    width: "90%",
    alignItems: "center",
  },
  otpLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 8,
  },
  otpCode: {
    fontSize: 42,
    fontWeight: "700",
    color: "#00E5FF",
    letterSpacing: 6,
    fontFamily: "monospace",
  },
  instructionText: {
    fontSize: 13,
    color: "#AAA",
    marginBottom: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  input: {
    fontSize: 32,
    marginBottom: 16,
    borderColor: "#00E5FF",
    borderWidth: 2,
    borderRadius: 8,
    width: "80%",
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 12,
    paddingLeft: 12,
    textAlign: "center",
    fontWeight: "600",
    letterSpacing: 4,
    backgroundColor: "#0A2E3E",
    color: "#00E5FF",
  },
  confirmButton: {
    backgroundColor: "#00E5FF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 40,
    marginTop: 8,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  confirmButtonText: {
    color: "#051A26",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default OtpModal;
