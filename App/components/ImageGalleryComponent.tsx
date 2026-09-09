import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
import { Ionicons, AntDesign, MaterialIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/common/store";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SESSION_STORAGE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config/SupabaseConfig";
import { updateUserProfile } from "@/common/reducers/authReducer";

type Props = NativeStackScreenProps<any>;

type DocKey =
  | "verifyIdImage"
  | "verifyIdImageBk"
  | "SOATImage"
  | "cardPropImage"
  | "cardPropImageBK"
  | "licenseImage"
  | "licenseImageBack";

type DocDef = {
  key: DocKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  accent: string;
};

const DOC_DEFS: DocDef[] = [
  { key: "verifyIdImage", label: "Cedula Frente", icon: "card-outline", accent: "#E91E63" },
  { key: "verifyIdImageBk", label: "Cedula Posterior", icon: "copy-outline", accent: "#E91E63" },
  { key: "SOATImage", label: "SOAT", icon: "document-text-outline", accent: "#00E5FF" },
  { key: "cardPropImage", label: "Propiedad Frente", icon: "wallet-outline", accent: "#FACC15" },
  { key: "cardPropImageBK", label: "Propiedad Posterior", icon: "albums-outline", accent: "#F87171" },
  { key: "licenseImage", label: "Licencia Frente", icon: "id-card-outline", accent: "#22D3EE" },
  { key: "licenseImageBack", label: "Licencia Posterior", icon: "reader-outline", accent: "#34D399" },
];

const ImageGalleryComponent = ({ navigation, route }: Props) => {
  const user = useSelector((state: RootState) => state.auth.user) as any;
  const profile = useSelector((state: RootState) => (state.auth as any).profile) as any;
  const dispatch = useDispatch();
  const { data } = route.params || {};

  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocDef | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [candidateUri, setCandidateUri] = useState<string | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(false);

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

  const [savedUris, setSavedUris] = useState<Record<DocKey, string | null>>({
    verifyIdImage: profile?.verify_id_image || user?.verifyIdImage || null,
    verifyIdImageBk: profile?.verify_id_image_bk || user?.verifyIdImageBk || null,
    SOATImage: profile?.soat_image || user?.SOATImage || null,
    cardPropImage: profile?.card_prop_image || user?.cardPropImage || null,
    cardPropImageBK: profile?.card_prop_image_bk || user?.cardPropImageBK || user?.cardPropImageBk || null,
    licenseImage: profile?.license_image || user?.licenseImage || null,
    licenseImageBack: profile?.license_image_back || user?.licenseImageBack || null,
  });


  const glowPulse = useRef(new Animated.Value(0)).current;
  const orbSpin = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const orbLoop = Animated.loop(
      Animated.timing(orbSpin, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    glowLoop.start();
    orbLoop.start();

    return () => {
      glowLoop.stop();
      orbLoop.stop();
    };
  }, [glowPulse, orbSpin]);

  const isCustomer = user?.usertype === "customer";

  const docs = useMemo(() => {
    const defs = isCustomer ? DOC_DEFS.slice(0, 1) : DOC_DEFS;
    return defs.map((doc) => {
      const currentUri = savedUris[doc.key] || null;
      const locked = isCustomer && doc.key === "verifyIdImage" && !!currentUri;
      return {
        ...doc,
        currentUri,
        locked,
      };
    });
  }, [savedUris, isCustomer]);

  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.42],
  });

  const orbRotate = orbSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const openSourcePicker = (doc: DocDef) => {
    setSelectedDoc(doc);
    setSourceModalVisible(true);
  };

  const showImagePreview = (uri: string | null) => {
    if (!uri) return;
    setPreviewUri(uri);
    setPreviewModalVisible(true);
  };

  const getImageFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [5, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSourceModalVisible(false);

      if (isCustomer && selectedDoc) {
        const userId = user?.uid || user?.id;
        if (!userId) {
          showAlert('error', 'Error', 'No se pudo identificar al usuario.');
          return;
        }
        await uploadDocDirectly(userId, selectedDoc.key, uri);
      } else {
        setCandidateUri(uri);
        setCompareModalVisible(true);
      }
    }
  };

  const getImageFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showAlert('warning', 'Permiso denegado', 'Se requiere acceso a la cámara para tomar fotos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [5, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSourceModalVisible(false);

      if (isCustomer && selectedDoc) {
        const userId = user?.uid || user?.id;
        if (!userId) {
          showAlert('error', 'Error', 'No se pudo identificar al usuario.');
          return;
        }
        await uploadDocDirectly(userId, selectedDoc.key, uri);
      } else {
        setCandidateUri(uri);
        setCompareModalVisible(true);
      }
    }
  };

  const confirmCandidate = async () => {
    if (!selectedDoc || !candidateUri) {
      setCompareModalVisible(false);
      return;
    }

    const doc = selectedDoc;
    const uri = candidateUri;
    setCompareModalVisible(false);
    setCandidateUri(null);

    const userId = user?.uid || user?.id;
    if (!userId) {
      showAlert('error', 'Error', 'No se pudo identificar al usuario.');
      return;
    }
    await uploadDocDirectly(userId, doc.key, uri);
  };

  const discardCandidate = () => {
    setCompareModalVisible(false);
    setCandidateUri(null);
  };


  // fetch con timeout: ningún paso puede dejar el botón colgado en "Guardando..."
  const fetchWithTimeout = async (url: string, options: RequestInit, ms = 30000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('La operación tardó demasiado. Verifica tu conexión e intenta de nuevo.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const uploadDoc = async (userId: string, docKey: DocKey, localUri: string) => {
    void userId;

    // 1. Mapear DocKey → columna de la tabla users
    const dbFieldMap: Record<DocKey, string> = {
      verifyIdImage: 'verify_id_image',
      verifyIdImageBk: 'verify_id_image_bk',
      SOATImage: 'soat_image',
      cardPropImage: 'card_prop_image',
      cardPropImageBK: 'card_prop_image_bk',
      licenseImage: 'license_image',
      licenseImageBack: 'license_image_back',
    };

    const dbField = dbFieldMap[docKey];
    if (!dbField) throw new Error(`Unknown doc key: ${docKey}`);

    // 2. Leer el JWT directo de AsyncStorage.
    //    NO usar supabase.auth.getSession(): en RN su lock interno se queda colgado
    //    (por eso el botón se quedaba en "Guardando..." sin avanzar de "obteniendo sesión").
    console.log('[ImageGallery] uploadDoc: leyendo sesión de AsyncStorage...');
    const sessionStr = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionStr) throw new Error('Sesión no encontrada. Inicia sesión nuevamente.');
    const sessionData = JSON.parse(sessionStr);
    const token: string | undefined = sessionData?.access_token || sessionData?.session?.access_token;
    if (!token) throw new Error('Sesión no encontrada. Inicia sesión nuevamente.');

    let authId: string | undefined = sessionData?.user?.id || sessionData?.session?.user?.id;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload?.sub) authId = payload.sub;
    } catch {}
    if (!authId) throw new Error('No se pudo identificar al usuario.');
    console.log('[ImageGallery] uploadDoc: sesión OK, user:', authId);

    const authHeaders = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    };

    // 3. Leer imagen como base64 y decodificar a binario
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) throw new Error('No se pudo leer la imagen seleccionada');

    // 4. Subir el binario al bucket privado user-documents.
    //    Antes se guardaba el base64 completo (varios MB) en la columna de la DB.
    //    Ahora subimos a Storage y guardamos solo la URL (string corto).
    const storagePath = `${authId}/${dbField}.jpg`;
    console.log('[ImageGallery] uploadDoc: subiendo a Storage ->', storagePath);
    const uploadResponse = await fetchWithTimeout(
      `${SUPABASE_URL}/storage/v1/object/user-documents/${storagePath}`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: decode(base64),
      }
    );

    console.log('[ImageGallery] uploadDoc: respuesta Storage', uploadResponse.status);
    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text().catch(() => '');
      throw new Error(`Error al subir imagen (${uploadResponse.status}): ${errText.substring(0, 200)}`);
    }

    // 5. Bucket privado: generar URL firmada de larga duración vía REST.
    //    El path es estable (upsert), así que la misma URL sigue sirviendo la última versión.
    const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
    const signResponse = await fetchWithTimeout(
      `${SUPABASE_URL}/storage/v1/object/sign/user-documents/${storagePath}`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: TEN_YEARS }),
      }
    );
    if (!signResponse.ok) {
      const errText = await signResponse.text().catch(() => '');
      throw new Error(`No se pudo generar el enlace (${signResponse.status}): ${errText.substring(0, 200)}`);
    }
    const signJson = await signResponse.json();
    // signJson.signedURL es relativo: "/object/sign/user-documents/...?token=..."
    const signedPath: string | undefined = signJson?.signedURL || signJson?.signedUrl;
    if (!signedPath) throw new Error('El servidor no devolvió un enlace firmado.');
    const docUrl = `${SUPABASE_URL}/storage/v1${signedPath}`;
    console.log('[ImageGallery] uploadDoc: URL firmada OK, guardando en DB...');

    // 6. Guardar la URL en la columna de users vía REST (PATCH con JWT del usuario)
    const patchResponse = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/users?auth_id=eq.${authId}`,
      {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ [dbField]: docUrl }),
      }
    );
    if (!patchResponse.ok) {
      const errText = await patchResponse.text().catch(() => '');
      throw new Error(`Error al guardar (${patchResponse.status}): ${errText.substring(0, 200)}`);
    }
    const patched = await patchResponse.json();
    if (!Array.isArray(patched) || patched.length === 0) {
      throw new Error('No se actualizó ninguna fila (revisa que tu usuario exista y las políticas RLS de la tabla users).');
    }
    console.log('[ImageGallery] uploadDoc: DB actualizada, filas:', patched.length);

    return docUrl;
  };

  const PROFILE_FIELD_MAP: Record<DocKey, string> = {
    verifyIdImage: 'verify_id_image',
    verifyIdImageBk: 'verify_id_image_bk',
    SOATImage: 'soat_image',
    cardPropImage: 'card_prop_image',
    cardPropImageBK: 'card_prop_image_bk',
    licenseImage: 'license_image',
    licenseImageBack: 'license_image_back',
  };

  const uploadDocDirectly = async (userId: string, docKey: DocKey, localUri: string) => {
    // Muestra la imagen local inmediatamente (antes de terminar el upload)
    setSavedUris((prev) => ({ ...prev, [docKey]: localUri }));

    try {
      setLoadingUpload(true);

      const dataUrl = await uploadDoc(userId, docKey, localUri);

      if (!dataUrl) throw new Error('No se recibió respuesta del servidor');

      // Reemplaza el URI local con el dataUrl guardado en DB
      setSavedUris((prev) => ({ ...prev, [docKey]: dataUrl }));
      dispatch(updateUserProfile({ [PROFILE_FIELD_MAP[docKey]]: dataUrl } as any));

      showAlert('success', 'Listo', 'Documento guardado correctamente.');
    } catch (error: any) {
      console.error('[ImageGallery] uploadDocDirectly error:', error?.message || error);
      // Revierte la preview optimista al valor anterior
      const prevVal = (profile as any)?.[PROFILE_FIELD_MAP[docKey]] ?? null;
      setSavedUris((prev) => ({ ...prev, [docKey]: prevVal }));
      showAlert('error', 'Error', error?.message || 'No se pudo guardar el documento. Intenta nuevamente.');
    } finally {
      setLoadingUpload(false);
    }
  };


  return (
    <View style={styles.container}>
      <View style={styles.bgLayer}>
        <Animated.View
          style={[
            styles.bgGlow,
            styles.bgGlowTop,
            { transform: [{ scale: glowScale }], opacity: glowOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.bgGlow,
            styles.bgGlowBottom,
            { transform: [{ scale: glowScale }], opacity: glowOpacity },
          ]}
        />
        <Animated.View style={[styles.bgOrb, { transform: [{ rotate: orbRotate }] }]} />
        <View style={styles.bgGrid} />
      </View>

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            if (data === "Process") {
              navigation.navigate("Map", { openModal: true });
            } else {
              navigation.goBack();
            }
          }}
        >
          <AntDesign name="arrow-left" size={22} color="#E9F6FF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Documentos</Text>
        <View style={styles.headerIconWrap}>
          <Ionicons name="images-outline" size={18} color="#00E5FF" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isCustomer && !docs[0]?.currentUri && (
          <View style={styles.customerUploadSection}>
            <Ionicons name="id-card-outline" size={48} color="#00E5FF" />
            <Text style={styles.customerUploadTitle}>Sube tu cédula</Text>
            <Text style={styles.customerUploadSubtitle}>
              Necesitamos una copia de tu cédula (frente) para verificar tu identidad.
            </Text>
            <TouchableOpacity
              style={styles.customerUploadBtn}
              onPress={() => openSourcePicker(docs[0])}
              disabled={loadingUpload}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#04202C" />
              <Text style={styles.customerUploadBtnText}>
                {loadingUpload ? "Subiendo..." : "Subir cédula una vez"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!isCustomer && (
          <Text style={styles.subtitle}>
            Revisa la imagen actual y confirma cualquier cambio antes de guardar.
          </Text>
        )}

        {(!isCustomer || docs[0]?.currentUri) && docs.map((doc) => (
          <View key={doc.key} style={styles.docCard}>
            <View style={styles.docTop}>
              <View style={[styles.docIcon, { borderColor: `${doc.accent}66` }]}>
                <Ionicons name={doc.icon} size={20} color={doc.accent} />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docTitle}>{doc.label}</Text>
                <Text style={styles.docStatus}>
                  {doc.locked
                    ? "Solo editable desde el dashboard"
                    : doc.currentUri
                      ? "Imagen guardada"
                      : "Sin imagen"}
                </Text>
              </View>
              {doc.locked ? (
                <View style={[styles.changeBtn, styles.lockedBtn]}>
                  <Ionicons name="lock-closed" size={16} color="#7BA8BC" />
                </View>
              ) : (
                <TouchableOpacity style={styles.changeBtn} onPress={() => openSourcePicker(doc)}>
                  <Ionicons name="camera-outline" size={18} color="#00E5FF" />
                </TouchableOpacity>
              )}
            </View>

            {doc.locked ? (
              <TouchableOpacity
                style={styles.lockedPreviewCard}
                onPress={() => showImagePreview(doc.currentUri)}
                activeOpacity={0.9}
              >
                <Image source={{ uri: doc.currentUri as string }} style={styles.lockedPreviewImage} />
                <View style={styles.lockedBadge}>
                  <Ionicons name="lock-closed" size={12} color="#E9F6FF" />
                  <Text style={styles.lockedBadgeText}>No editable</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.previewCardFull}
                onPress={() => showImagePreview(doc.currentUri)}
                activeOpacity={0.9}
              >
                {doc.currentUri ? (
                  <Image source={{ uri: doc.currentUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="image-outline" size={24} color="#6F96A9" />
                    <Text style={styles.previewEmptyText}>Sin imagen</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        ))}

        {loadingUpload ? (
          <View style={styles.updateBtn}>
            <Text style={styles.updateBtnText}>Guardando...</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent animationType="slide" visible={sourceModalVisible} onRequestClose={() => setSourceModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Selecciona una opción</Text>
            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={getImageFromLibrary}>
              <Ionicons name="images" size={18} color="#062331" />
              <Text style={styles.modalPrimaryText}>Cargar Imagen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSecondaryBtn} onPress={getImageFromCamera}>
              <Ionicons name="camera" size={18} color="#E9F6FF" />
              <Text style={styles.modalSecondaryText}>Tomar Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSourceModalVisible(false)}>
              <MaterialIcons name="cancel" size={18} color="#E91E63" />
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={compareModalVisible} onRequestClose={discardCandidate}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.compareModalCard]}>
            <Text style={styles.modalTitle}>Confirmar cambio</Text>
            <Text style={styles.compareSubtitle}>Verifica la imagen nueva antes de reemplazar la actual.</Text>

            <View style={styles.compareRow}>
              <View style={styles.compareBox}>
                <Text style={styles.compareLabel}>Actual</Text>
                {selectedDoc && savedUris[selectedDoc.key] ? (
                  <Image source={{ uri: savedUris[selectedDoc.key] as string }} style={styles.compareImage} />
                ) : (
                  <View style={styles.previewEmpty}>
                    <Text style={styles.previewEmptyText}>Sin imagen</Text>
                  </View>
                )}
              </View>

              <View style={styles.compareBox}>
                <Text style={styles.compareLabel}>Nueva</Text>
                {candidateUri ? (
                  <Image source={{ uri: candidateUri }} style={styles.compareImage} />
                ) : (
                  <View style={styles.previewEmpty}>
                    <Text style={styles.previewEmptyText}>Sin imagen</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.compareActions}>
              <TouchableOpacity style={styles.keepOldBtn} onPress={discardCandidate}>
                <Text style={styles.keepOldText}>Conservar actual</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmCandidate}>
                <Text style={styles.confirmText}>Confirmar cambio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={previewModalVisible} onRequestClose={() => setPreviewModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.imagePreviewModal}>
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewModalVisible(false)}>
              <Ionicons name="close" size={22} color="#E9F6FF" />
            </TouchableOpacity>
            {previewUri ? <Image source={{ uri: previewUri }} style={styles.fullImage} /> : null}
          </View>
        </View>
      </Modal>

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
    zIndex: 0,
    overflow: "hidden",
  },
  bgGlow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#00E5FF",
  },
  bgGlowTop: {
    width: 280,
    height: 280,
    top: -120,
    right: -110,
  },
  bgGlowBottom: {
    width: 220,
    height: 220,
    left: -90,
    bottom: 120,
    backgroundColor: "#00B8D4",
  },
  bgOrb: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.1)",
    right: -100,
    top: "45%",
  },
  bgGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 20, 30, 0.6)",
  },
  header: {
    zIndex: 2,
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.2)",
    backgroundColor: "rgba(10, 46, 61, 0.68)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#E9F6FF",
    fontSize: 20,
    fontWeight: "800",
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.18)",
    backgroundColor: "rgba(10, 46, 61, 0.68)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    zIndex: 2,
    paddingHorizontal: 18,
    paddingBottom: 30,
    gap: 12,
  },
  customerUploadSection: {
    borderRadius: 18,
    backgroundColor: "rgba(10,46,61,0.62)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.14)",
    padding: 24,
    alignItems: "center",
    gap: 16,
    marginTop: 12,
  },
  customerUploadTitle: {
    color: "#E9F6FF",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  customerUploadSubtitle: {
    color: "#9EC2D4",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  customerUploadBtn: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: "#00E5FF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#00E5FF",
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  customerUploadBtnText: {
    color: "#04202C",
    fontSize: 15,
    fontWeight: "800",
  },
  subtitle: {
    color: "#9EC2D4",
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 18,
  },
  docCard: {
    borderRadius: 18,
    backgroundColor: "rgba(10,46,61,0.62)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.14)",
    padding: 14,
    gap: 12,
  },
  docTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  docIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5,25,37,0.8)",
  },
  docInfo: {
    flex: 1,
  },
  docTitle: {
    color: "#E9F6FF",
    fontSize: 14,
    fontWeight: "700",
  },
  docStatus: {
    color: "#8DB2C4",
    fontSize: 12,
    marginTop: 2,
  },
  changeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.22)",
    backgroundColor: "rgba(0,229,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  lockedBtn: {
    borderColor: "rgba(123,168,188,0.3)",
    backgroundColor: "rgba(123,168,188,0.08)",
  },
  lockedPreviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.18)",
    backgroundColor: "rgba(6, 25, 36, 0.8)",
    overflow: "hidden",
    position: "relative",
  },
  lockedPreviewImage: {
    width: "100%",
    height: 200,
    resizeMode: "cover",
  },
  lockedBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(4, 20, 30, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(123,168,188,0.35)",
  },
  lockedBadgeText: {
    color: "#E9F6FF",
    fontSize: 11,
    fontWeight: "700",
  },
  previewRow: {
    flexDirection: "row",
    gap: 10,
  },
  previewCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(6, 25, 36, 0.8)",
    padding: 8,
    gap: 8,
  },
  previewCardFull: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.18)",
    backgroundColor: "rgba(6, 25, 36, 0.8)",
    overflow: "hidden",
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  previewLabel: {
    color: "#A7C5D4",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "600",
  },
  previewImage: {
    width: "100%",
    height: 130,
    borderRadius: 10,
    resizeMode: "cover",
  },
  previewEmpty: {
    height: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.12)",
    backgroundColor: "rgba(3, 15, 23, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  previewEmptyText: {
    color: "#6F96A9",
    fontSize: 11,
    fontWeight: "600",
  },
  updateBtn: {
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: "#00E5FF",
    paddingVertical: 15,
    alignItems: "center",
    shadowColor: "#00E5FF",
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
  updateBtnDisabled: {
    opacity: 0.7,
  },
  updateBtnText: {
    color: "#052333",
    fontSize: 15,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.24)",
    backgroundColor: "rgba(10, 38, 53, 0.95)",
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    color: "#E9F6FF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  modalPrimaryBtn: {
    borderRadius: 14,
    backgroundColor: "#00E5FF",
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  modalPrimaryText: {
    color: "#052333",
    fontWeight: "800",
    fontSize: 14,
  },
  modalSecondaryBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.28)",
    backgroundColor: "rgba(6,25,36,0.9)",
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  modalSecondaryText: {
    color: "#E9F6FF",
    fontWeight: "700",
    fontSize: 14,
  },
  modalCancelBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,106,123,0.38)",
    backgroundColor: "rgba(255,106,123,0.08)",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  modalCancelText: {
    color: "#E91E63",
    fontWeight: "700",
    fontSize: 14,
  },
  compareModalCard: {
    gap: 10,
  },
  compareSubtitle: {
    textAlign: "center",
    color: "#9BBCCD",
    fontSize: 12,
    marginBottom: 4,
  },
  compareRow: {
    flexDirection: "row",
    gap: 10,
  },
  compareBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(6,25,36,0.9)",
    padding: 8,
    gap: 6,
  },
  compareLabel: {
    color: "#A7C5D4",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  compareImage: {
    width: "100%",
    height: 116,
    borderRadius: 10,
    resizeMode: "cover",
  },
  compareActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  keepOldBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingVertical: 12,
    alignItems: "center",
  },
  keepOldText: {
    color: "#E9F6FF",
    fontSize: 13,
    fontWeight: "700",
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#00E5FF",
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmText: {
    color: "#052333",
    fontSize: 13,
    fontWeight: "800",
  },
  imagePreviewModal: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#051A26",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.24)",
  },
  previewCloseBtn: {
    position: "absolute",
    zIndex: 2,
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    width: "100%",
    height: 380,
    resizeMode: "contain",
    backgroundColor: "#020D14",
  },
});

export default ImageGalleryComponent;
