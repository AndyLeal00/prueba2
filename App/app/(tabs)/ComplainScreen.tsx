import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSelector, useDispatch } from "react-redux";
import moment from "moment";
import { fetchComplains, addComplain } from "@/common/store/complainSlice";
import { RootState, AppDispatch } from "@/common/store";
import { Ionicons, AntDesign } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SESSION_STORAGE_KEY } from '@/config/SupabaseConfig';
import CustomAlert, { AlertButton } from '@/components/CustomAlert';

const MAX_EVIDENCE_IMAGES = 5;

type Props = NativeStackScreenProps<any>;
type ComplaintType = "queja" | "reclamo" | "sugerencia" | "otro";
type PriorityType = "baja" | "media" | "alta";

const Complain = ({ navigation }: Props) => {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth.user);
  const userAny = user as any;
  const complains = useSelector((state: RootState) => state.complains.list) || [];
  const complainLoading = useSelector((state: RootState) => state.complains.loading);
  const complainError = useSelector((state: RootState) => state.complains.error);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<ComplaintType>("queja");
  const [priority, setPriority] = useState<PriorityType>("media");
  const [showSuccess, setShowSuccess] = useState(false);
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertType, setAlertType] = useState<'success' | 'error' | 'warning' | 'info' | 'confirm'>('error');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);
  const showAlert = (type: 'success' | 'error' | 'warning' | 'info' | 'confirm', title: string, message: string, buttons?: AlertButton[]) => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons || [{ text: 'OK', onPress: () => setAlertVisible(false) }]);
    setAlertVisible(true);
  };

  const glow1 = useRef(new Animated.Value(0)).current;
  const glow2 = useRef(new Animated.Value(0)).current;
  const orbRotate = useRef(new Animated.Value(0)).current;
  const ctaPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user?.id) {
      dispatch(fetchComplains(user.id));
    }
  }, [dispatch, user?.id]);

  // Manejar errores del Redux
  useEffect(() => {
    if (complainError) {
      showAlert('error', 'Error', complainError);
    }
  }, [complainError]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow1, {
          toValue: 1,
          duration: 3500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow1, {
          toValue: 0,
          duration: 3500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow2, {
          toValue: 1,
          duration: 4600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow2, {
          toValue: 0,
          duration: 4600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(orbRotate, {
        toValue: 1,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ctaPulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [ctaPulse, glow1, glow2, orbRotate]);

  const charCount = body.length;

  const pickEvidence = (source: "camera" | "gallery") => {
    if (evidenceImages.length >= MAX_EVIDENCE_IMAGES) {
      showAlert('warning', 'Límite alcanzado', `Solo puedes adjuntar hasta ${MAX_EVIDENCE_IMAGES} imágenes.`);
      return;
    }

    const pick = async () => {
      let result: ImagePicker.ImagePickerResult;

      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          showAlert('warning', 'Permiso requerido', 'Necesitamos acceso a la cámara para tomar fotos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          allowsEditing: false,
        });
      } else {
        // Sin request explícito de READ_MEDIA_IMAGES/VIDEO — el Photo Picker nativo
        // no lo requiere para un uso puntual (adjuntar evidencia), y pedirlo de más
        // viola la política de Google Play sobre permisos de fotos y video.
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          allowsEditing: false,
        });
      }

      if (!result.canceled && result.assets?.[0]?.uri) {
        setEvidenceImages((prev) => [...prev, result.assets[0].uri]);
      }
    };

    pick().catch((err) => {
      console.error("Error al seleccionar imagen:", err);
      showAlert('error', 'Error', 'No se pudo seleccionar la imagen.');
    });
  };

  const removeEvidenceImage = (index: number) => {
    setEvidenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadEvidenceImages = async (): Promise<string[]> => {
    if (evidenceImages.length === 0) return [];

    const sessionRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    const token = sessionRaw ? JSON.parse(sessionRaw).access_token : SUPABASE_ANON_KEY;
    const userId = userAny?.uid || userAny?.id || "unknown";
    const urls: string[] = [];

    for (const uri of evidenceImages) {
      const ts = Date.now();
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${ts}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const res = await fetch(uri);
      const blob = await res.blob();

      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/complaint-evidence/${path}`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": blob.type || "image/jpeg",
            "x-upsert": "true",
          },
          body: blob,
        }
      );

      if (uploadRes.ok) {
        urls.push(`${SUPABASE_URL}/storage/v1/object/public/complaint-evidence/${path}`);
      } else {
        console.warn("Upload failed for", path, await uploadRes.text());
      }
    }

    return urls;
  };

  const latestComplaints = useMemo(() => {
    return [...complains].sort((a: any, b: any) => (b.complainDate || 0) - (a.complainDate || 0)).slice(0, 3);
  }, [complains]);

  const submitComplain = async () => {
    if (!userAny?.mobile && !userAny?.email) {
      showAlert('error', 'Error', 'Por favor verifica tu numero de telefono o correo electronico.');
      return;
    }

    if (!subject.trim() || !body.trim()) {
      showAlert('error', 'Error', 'Por favor completa asunto y mensaje.');
      return;
    }

    let evidenceUrls: string[] = [];
    if (evidenceImages.length > 0) {
      setUploadingImages(true);
      try {
        evidenceUrls = await uploadEvidenceImages();
      } catch (err) {
        console.error("Error subiendo evidencia:", err);
        showAlert('error', 'Error', 'No se pudieron subir las imágenes. Intenta de nuevo.');
        setUploadingImages(false);
        return;
      }
      setUploadingImages(false);
    }

    const complainData = {
      subject: subject.trim(),
      body: body.trim(),
      check: false,
      complaintType: type,
      priority,
      uid: user?.id,
      complainDate: new Date().getTime(),
      firstName: userAny?.firstName || userAny?.first_name || "",
      lastName: userAny?.lastName || userAny?.last_name || "",
      email: userAny?.email || "",
      mobile: userAny?.mobile || "",
      role: userAny?.usertype || userAny?.user_type || "",
      id: `${userAny?.uid || userAny?.id}_${new Date().getTime()}`,
      evidenceUrls,
    };

    try {
      // Dispatch y esperar a que se complete
      await dispatch(addComplain(complainData)).unwrap();
      setShowSuccess(true);
    } catch (error: any) {
      // El error ya se maneja en el useEffect arriba, no necesitamos hacer nada más aquí
      console.error('Error enviando queja:', error);
    }
  };

  const resetAndCloseSuccess = () => {
    setSubject("");
    setBody("");
    setType("queja");
    setPriority("media");
    setEvidenceImages([]);
    setShowSuccess(false);
  };

  const orbSpin = orbRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const glow1Scale = glow1.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.22],
  });

  const glow2Scale = glow2.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  const ctaGlowOpacity = ctaPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.bgLayer}>
        <Animated.View style={[styles.bgGlowOne, { transform: [{ scale: glow1Scale }] }]} />
        <Animated.View style={[styles.bgGlowTwo, { transform: [{ scale: glow2Scale }] }]} />
        <Animated.View style={[styles.bgOrb, { transform: [{ rotate: orbSpin }] }]}>
          <View style={styles.bgOrbInner} />
        </Animated.View>
        <View style={styles.bgGrid} />
      </View>

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <AntDesign name="arrow-left" size={22} color="#EAFBFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerBadgeIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color="#00E5FF" />
          </View>
          <Text style={styles.headerTitle}>Quejas y Reclamos</Text>
        </View>

        <View style={styles.iconBtnPlaceholder} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introBanner}>
          <View style={styles.introIcon}>
            <Ionicons name="alert-circle-outline" size={24} color="#00E5FF" />
          </View>
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>Tu voz importa</Text>
            <Text style={styles.introSub}>Revisamos cada mensaje. Tiempo de respuesta: 24-48 horas.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Tipo de solicitud</Text>
          <View style={styles.chipsRow}>
            {(["queja", "reclamo", "sugerencia", "otro"] as ComplaintType[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, type === item && styles.chipActive]}
                onPress={() => setType(item)}
              >
                <Text style={[styles.chipText, type === item && styles.chipTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Asunto</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Describe brevemente el asunto..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={subject}
              maxLength={80}
              onChangeText={setSubject}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Mensaje</Text>
          <View style={styles.textAreaWrap}>
            <TextInput
              style={styles.textArea}
              placeholder="Cuentanos en detalle que ocurrio, cuando y como podemos ayudarte..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={body}
              maxLength={500}
              multiline
              textAlignVertical="top"
              onChangeText={setBody}
            />
            <Text style={styles.counter}>{charCount}/500</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Prioridad</Text>
          <View style={styles.priorityRow}>
            {(["baja", "media", "alta"] as PriorityType[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.priorityBtn, priority === item && styles.priorityBtnActive]}
                onPress={() => setPriority(item)}
              >
                <View
                  style={[
                    styles.priorityDot,
                    item === "baja" && styles.priorityLow,
                    item === "media" && styles.priorityMid,
                    item === "alta" && styles.priorityHigh,
                  ]}
                />
                <Text style={styles.priorityText}>{item[0].toUpperCase() + item.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Evidencia (opcional)</Text>
          <Text style={styles.evidenceHint}>
            Adjunta hasta {MAX_EVIDENCE_IMAGES} fotos como evidencia.
          </Text>

          {evidenceImages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.evidenceScroll}
              contentContainerStyle={styles.evidenceScrollContent}
            >
              {evidenceImages.map((uri, idx) => (
                <View key={idx} style={styles.evidenceThumbWrap}>
                  <Image source={{ uri }} style={styles.evidenceThumb} />
                  <TouchableOpacity
                    style={styles.evidenceRemoveBtn}
                    onPress={() => removeEvidenceImage(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={22} color="#E91E63" />
                  </TouchableOpacity>
                  <View style={styles.evidenceBadge}>
                    <Text style={styles.evidenceBadgeText}>{idx + 1}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {evidenceImages.length < MAX_EVIDENCE_IMAGES && (
            <View style={styles.evidenceActions}>
              <TouchableOpacity
                style={styles.evidenceActionBtn}
                onPress={() => pickEvidence("camera")}
                activeOpacity={0.85}
              >
                <View style={styles.evidenceActionIcon}>
                  <Ionicons name="camera-outline" size={20} color="#00E5FF" />
                </View>
                <Text style={styles.evidenceActionText}>Cámara</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.evidenceActionBtn}
                onPress={() => pickEvidence("gallery")}
                activeOpacity={0.85}
              >
                <View style={styles.evidenceActionIcon}>
                  <Ionicons name="images-outline" size={20} color="#00E5FF" />
                </View>
                <Text style={styles.evidenceActionText}>Galería</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={[styles.submitBtn, (uploadingImages || complainLoading) && { opacity: 0.7 }]}
            onPress={submitComplain}
            activeOpacity={0.9}
            disabled={uploadingImages || complainLoading}
          >
            <Animated.View style={[styles.submitGlow, { opacity: ctaGlowOpacity }]} />
            <View style={styles.submitContent}>
              {uploadingImages || complainLoading ? (
                <>
                  <ActivityIndicator size="small" color="#051A26" />
                  <Text style={styles.submitText}>
                    {uploadingImages ? 'Subiendo imágenes...' : 'Enviando solicitud...'}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#051A26" />
                  <Text style={styles.submitText}>Enviar Solicitud</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            Al enviar, aceptas nuestra politica de privacidad. No compartiremos tu informacion con terceros.
          </Text>
        </View>

        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Tus solicitudes recientes</Text>
            {complains.length > 3 && <Text style={styles.seeAll}>Ultimas 3</Text>}
          </View>

          {latestComplaints.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={24} color="#00E5FF" />
              <Text style={styles.emptyText}>Aun no tienes solicitudes registradas.</Text>
            </View>
          ) : (
            latestComplaints.map((item: any) => (
              <View key={item.id} style={styles.historyCard}>
                <Text style={styles.historySubject}>{item.subject}</Text>
                <Text style={styles.historyDate}>{moment(item.complainDate).format("LL")}</Text>
                <Text style={styles.historyBody} numberOfLines={2}>{item.body}</Text>
                <Text style={[styles.historyStatus, item.check ? styles.statusSolved : styles.statusPending]}>
                  {item.check ? "Resuelto" : "Pendiente"}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={42} color="#051A26" />
          </View>
          <Text style={styles.successTitle}>Solicitud enviada</Text>
          <Text style={styles.successSub}>Te responderemos en un plazo de 24-48 horas.</Text>
          <TouchableOpacity style={styles.successBtn} onPress={resetAndCloseSuccess}>
            <Text style={styles.successBtnText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      )}
      <CustomAlert
        visible={alertVisible}
        type={alertType}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onDismiss={() => setAlertVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#051A26",
  },
  bgLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgGlowOne: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -60,
    left: -80,
    backgroundColor: "rgba(0,229,255,0.15)",
  },
  bgGlowTwo: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    bottom: "14%",
    right: -70,
    backgroundColor: "rgba(0,176,255,0.12)",
  },
  bgGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  bgOrb: {
    position: "absolute",
    bottom: "28%",
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  bgOrbInner: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.06)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: "rgba(5,26,38,0.9)",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,46,61,0.55)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
  },
  iconBtnPlaceholder: {
    width: 44,
    height: 44,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerBadgeIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,229,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.24)",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  introBanner: {
    marginTop: 10,
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.18)",
    backgroundColor: "rgba(0,229,255,0.08)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,229,255,0.16)",
  },
  introTextWrap: {
    flex: 1,
  },
  introTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  introSub: {
    color: "rgba(255,255,255,0.62)",
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
  },
  section: {
    marginBottom: 14,
  },
  label: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
    backgroundColor: "rgba(10,46,61,0.65)",
  },
  chipActive: {
    backgroundColor: "rgba(0,229,255,0.18)",
    borderColor: "rgba(0,229,255,0.35)",
  },
  chipText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#00E5FF",
  },
  inputWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
    backgroundColor: "rgba(10,46,61,0.56)",
    paddingLeft: 40,
    position: "relative",
  },
  inputIcon: {
    position: "absolute",
    left: 14,
    top: 15,
    zIndex: 1,
  },
  input: {
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 12,
    paddingRight: 12,
  },
  textAreaWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
    backgroundColor: "rgba(10,46,61,0.56)",
    padding: 12,
    minHeight: 130,
  },
  textArea: {
    color: "#FFFFFF",
    fontSize: 15,
    minHeight: 92,
    paddingRight: 8,
  },
  counter: {
    alignSelf: "flex-end",
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 4,
  },
  priorityRow: {
    flexDirection: "row",
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
    backgroundColor: "rgba(10,46,61,0.56)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  priorityBtnActive: {
    borderColor: "rgba(0,229,255,0.35)",
    backgroundColor: "rgba(0,229,255,0.12)",
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityLow: {
    backgroundColor: "#4CAF50",
  },
  priorityMid: {
    backgroundColor: "#00E5FF",
  },
  priorityHigh: {
    backgroundColor: "#E91E63",
  },
  priorityText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  attachBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(0,229,255,0.2)",
    backgroundColor: "rgba(10,46,61,0.56)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  attachIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,229,255,0.16)",
  },
  attachTextWrap: {
    flex: 1,
  },
  attachTitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "600",
  },
  attachSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    marginTop: 2,
  },
  evidenceHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17,
  },
  evidenceScroll: {
    marginBottom: 10,
  },
  evidenceScrollContent: {
    gap: 10,
    paddingRight: 4,
  },
  evidenceThumbWrap: {
    width: 90,
    height: 90,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.22)",
  },
  evidenceThumb: {
    width: "100%",
    height: "100%",
    borderRadius: 13,
  },
  evidenceRemoveBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "rgba(5,26,38,0.75)",
    borderRadius: 11,
  },
  evidenceBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,229,255,0.85)",
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceBadgeText: {
    color: "#051A26",
    fontSize: 10,
    fontWeight: "800",
  },
  evidenceActions: {
    flexDirection: "row",
    gap: 10,
  },
  evidenceActionBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(0,229,255,0.2)",
    backgroundColor: "rgba(10,46,61,0.56)",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  evidenceActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,229,255,0.14)",
  },
  evidenceActionText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "600",
  },
  ctaSection: {
    marginTop: 6,
    marginBottom: 18,
  },
  submitBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00E5FF",
    overflow: "hidden",
  },
  submitGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  submitContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  submitText: {
    color: "#051A26",
    fontSize: 16,
    fontWeight: "800",
  },
  disclaimer: {
    marginTop: 10,
    textAlign: "center",
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    lineHeight: 16,
  },
  historySection: {
    marginBottom: 18,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  seeAll: {
    color: "#00E5FF",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
    backgroundColor: "rgba(10,46,61,0.56)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    flex: 1,
  },
  historyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.16)",
    backgroundColor: "rgba(10,46,61,0.56)",
    padding: 12,
    marginBottom: 10,
  },
  historySubject: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  historyDate: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    marginTop: 3,
  },
  historyBody: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    marginTop: 6,
  },
  historyStatus: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusSolved: {
    color: "#4CAF50",
  },
  statusPending: {
    color: "#E91E63",
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,26,38,0.97)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#00E5FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  successSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
    lineHeight: 20,
  },
  successBtn: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.35)",
    backgroundColor: "rgba(0,229,255,0.16)",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  successBtnText: {
    color: "#00E5FF",
    fontSize: 15,
    fontWeight: "700",
  },
});

export default Complain;
