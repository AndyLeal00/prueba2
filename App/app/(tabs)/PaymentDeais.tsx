import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Dimensions,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
  Animated
} from "react-native";
import { Header } from "react-native-elements";
import { colors } from "@/scripts/theme";
var { width, height } = Dimensions.get("window");
import PromoComp from "@/components/PromoComp";
import { useSelector, useDispatch } from "react-redux";
import {

  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import {
  completePaymentBooking,
} from "@/common/store/bookingsSlice";

import { settings } from "@/scripts/settings";
import { fetchPromos, editPromo } from "@/common/actions/promoactions";
import { Directions } from "react-native-gesture-handler";
import { RootState } from "@/common/store";
import supabase from "@/config/SupabaseConfig";
import { useColorScheme } from 'react-native'; 
import CustomAlert, { AlertButton } from '@/components/CustomAlert';
const hasNotch =
  Platform.OS === "ios" &&
  !Platform.isPad &&
  !Platform.isTVOS &&
  (height === 780 ||
    width === 780 ||
    height === 812 ||
    width === 812 ||
    height === 844 ||
    width === 844 ||
    height === 852 ||
    width === 852 ||
    height === 896 ||
    width === 896 ||
    height === 926 ||
    width === 926 ||
    height === 932 ||
    width === 932);

export default function PaymentScreen(props) {
  const updateBooking = completePaymentBooking;
  const dispatch = useDispatch();
  const route = useRoute();
  const navigation = useNavigation();

  const auth = useSelector((state) => state.auth);
  const colorScheme = useColorScheme(); // Hook para detectar si es modo oscuro o claro
  const [booking, setBooking] = useState(route.params?.booking || null);
  const [promodalVisible, setPromodalVisible] = useState(false);
  const user = useSelector((state: RootState) => state.auth.user);
  const [isLoading, setIsLoading] = useState();
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos dinámicos
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0)); // Animación de fade
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

  useEffect(() => {
    dispatch(fetchPromos());
  }, [dispatch]);

  useEffect(() => {
    if (!booking?.id) return;

    // Carga inicial del booking desde Supabase
    supabase
      .from('bookings')
      .select('*')
      .eq('id', booking.id)
      .single()
      .then(({ data }) => { if (data) setBooking(data); });

    // Escucha cambios en tiempo real con Supabase Realtime
    const channel = supabase
      .channel(`booking-payment-${booking.id}`)
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'reserva', filter: `id=eq.${booking.id}` },
        (payload: any) => { if (payload.new) setBooking(payload.new); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [booking?.id]);

  const [payDetails, setPayDetails] = useState({
    amount:
      booking.trip_cost < booking.estimate
        ? booking.estimate
        : booking.trip_cost,
    discount: booking.discount ? booking.discount : 0,
    usedWalletMoney: booking.payment_mode === "wallet" ? booking.trip_cost : 0,
    promo_applied: booking.promo_applied ? booking.promo_applied : false,
    promo_details: booking.promo_details ? booking.promo_details : null,
    payableAmount: booking.payableAmount
      ? booking.payableAmount
      : booking.trip_cost < booking.estimate
        ? booking.estimate
        : booking.trip_cost,
  });

  const promoModal = () => {
    return (
      <Modal
        animationType="none"
        visible={promodalVisible}
        onRequestClose={() => {
          setPromodalVisible(false);
        }}
      >
        <Header
          backgroundColor={"#333"}
          centerComponent={
            <Text style={styles.headerTitleStyle}>{"Tu Promo"}</Text>
          }
          containerStyle={[
            styles.headerStyle,
            { height: hasNotch ? 85 : null, backgroundColor: "#333" },
          ]}
          innerContainerStyles={{ marginLeft: 10, marginRight: 10 }}
        />
        <PromoComp
          onPressButton={(item, index) => {
            selectCoupon(item, index);
          }}
        ></PromoComp>
        <TouchableOpacity
          onPress={() => {
            setPromodalVisible(false);
          }}
          style={styles.vew3}
        >
          <Text style={[styles.emailStyle, { color: colors.WHITE }]}>
            {"cancel"}
          </Text>
        </TouchableOpacity>
      </Modal>
    );
  };

  const openPromoModal = () => {
    setPromodalVisible(!promodalVisible);
    let data = { ...payDetails };
    data.payableAmount = data.amount;
    data.discount = 0;
    data.promo_applied = false;
    data.promo_details = null;
    data.usedWalletMoney = 0;
    setPayDetails(data);
  };

  const removePromo = () => {
    let data = { ...payDetails };
    data.promo_details.user_avail = parseInt(data.promo_details.user_avail) - 1;
    delete data.promo_details.usersUsed[auth.user.uid];
    dispatch(editPromo(data.promo_details));
    data.payableAmount = data.amount;
    data.discount = 0;
    data.promo_applied = false;
    data.promo_details = null;
    data.usedWalletMoney = 0;
    setPayDetails(data);
  };

  const doPayment = (payment_mode) => {
    // Verificación del tipo de usuario antes de proceder con el pago
    setSuccessModalVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Cerrar el modal después de 2 segundos
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setSuccessModalVisible(false));
    }, 2000);
    if (user.usertype === "customer") {
      props.navigation.navigate("Rating", { booking });
      return;
    }

    let curBooking = { ...booking };

    // Aquí añadimos la lógica para comparar trip_cost con estimated_cost
    if (curBooking.trip_cost < curBooking.estimate) {
      curBooking.trip_cost = curBooking.estimate;
    }

    // Manejo del estado de la reserva según el modo de pago
    if (payment_mode === "cash" || payment_mode === "wallet" || payment_mode === "corp") {
      // Aquí ajustamos el estado de la reserva según el flujo lógico
      if (booking.status === "REACHED") {
        curBooking.status = "PAID"; // Cambiar a 'PAID' porque vamos a completar el pago
      } else if (booking.status === "PENDING") {
        curBooking.status = "PAID";
      } else if (booking.status === "NEW") {
        curBooking.status = "ACCEPTED";
      } else {
        // Manejar el caso en que el estado de la reserva no es válido para el pago
        console.error("Booking status is not valid for payment");
        showAlert('error', 'Error', 'La reserva no está en un estado válido para el pago.');
        return;
      }

      // Actualiza los detalles de pago según el modo de pago
      curBooking.payment_mode = payment_mode;
      curBooking.customer_paid =
        curBooking.status === "NEW"
          ? 0
          : (
            parseFloat(payDetails.amount) - parseFloat(payDetails.discount)
          ).toFixed(settings.decimal);
      curBooking.discount = parseFloat(payDetails.discount).toFixed(
        settings.decimal
      );
      curBooking.usedWalletMoney =
        payment_mode === "wallet" ? curBooking.customer_paid : 0;
      curBooking.cardPaymentAmount = 0;
      curBooking.cashPaymentAmount =
        payment_mode === "cash" ? curBooking.customer_paid : 0;
      curBooking.payableAmount = parseFloat(payDetails.payableAmount).toFixed(
        settings.decimal
      );
      curBooking.promo_applied = payDetails.promo_applied;
      curBooking.promo_details = payDetails.promo_details;

      setIsLoading(true);

      // Despachar la acción solo si el estado es válido
      dispatch(completePaymentBooking({ booking: curBooking }))
        .unwrap()
        .then(() => {
          setIsLoading(false);
          if (user.usertype === "customer") {
            if (curBooking.status === "PAID") {
              // La ruta se llama "Rating" en Navigation.tsx; "DriverRating" es
              // el nombre del componente y no resuelve, asi que el cliente se
              // quedaba varado en esta pantalla despues de pagar. La pantalla
              // ademas lee route.params.booking, no bookingId. Se pasa
              // curBooking y no booking porque es el que acaba de persistirse
              // con los montos del pago.
              props.navigation.navigate("Rating", { booking: curBooking });
            } else {
              props.navigation.navigate("HomeScreen");
            }
          } else {
                 // Enviar notificación
                 fetch('https://us-central1-treasupdate.cloudfunctions.net/sendMassNotification', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    tokens: [curBooking.customer_token],
                    title: `¡Gracias por confiar en nosotros!`,
                    body: `Tu servicio ha finalizado exitosamente. Esperamos que hayas disfrutado de una experiencia excepcional. ¡Te invitamos a volver pronto!`,
                  }),
                  
                })
                  .then(response => response.json())
                  .then(data => {
                    console.log('Notificación enviada:', data);
                  })
                  .catch(error => {
                    console.error('Error al enviar la notificación:', error);
                  });
            props.navigation.navigate("HomeScreen");
          }
        })
        .catch((error) => {
          setIsLoading(false);
          console.error("Error completing payment:", error);
          showAlert('error', 'Error', 'No se pudo completar el pago. Inténtalo de nuevo.');
        });
    } else {
      // Manejo del pago con tarjeta
      if (user.usertype === "customer") {
        const paymentPacket = {
          payment_mode,
          customer_paid: (
            parseFloat(payDetails.amount) - parseFloat(payDetails.discount)
          ).toFixed(settings.decimal),
          discount: parseFloat(payDetails.discount).toFixed(settings.decimal),
          usedWalletMoney: parseFloat(payDetails.usedWalletMoney).toFixed(
            settings.decimal
          ),
          cardPaymentAmount: parseFloat(payDetails.payableAmount).toFixed(
            settings.decimal
          ),
          cashPaymentAmount: 0,
          payableAmount: parseFloat(payDetails.payableAmount).toFixed(
            settings.decimal
          ),
          promo_applied: payDetails.promo_applied,
          promo_details: payDetails.promo_details,
        };

        curBooking.paymentPacket = paymentPacket;

        setIsLoading(true);
        if (curBooking.preRequestedDrivers) {
          curBooking.requestedDrivers = curBooking.preRequestedDrivers;
          curBooking.preRequestedDrivers = {};
        }

        dispatch(completePaymentBooking({ booking: curBooking }))
          .unwrap()
          .then(() => {
            setIsLoading(false);
            props.navigation.navigate("paymentMethod", {
              payData: payData,
              user: user,
              settings: settings,
              booking: curBooking,
            });
          })
          .catch((error) => {
            setIsLoading(false);
            console.error("Error completing payment:", error);
            showAlert('error', 'Error', 'No se pudo completar el pago con tarjeta. Inténtalo de nuevo.');
          });
      } else {
        // Manejo para otros casos
        if (booking.status === "REACHED") {
          if (booking.prepaid) {
            curBooking.status = "PAID";
          } else {
            curBooking.status = "PENDING";
          }
          dispatch(completePaymentBooking(curBooking));
          props.navigation.navigate("Rating", { booking });
        }
      }
    }
  };
  // Para el conductor: antes de completar un pago en efectivo debe confirmar
  // que efectivamente recibió el dinero. Si no lo recibió, se le redirige a la
  // pantalla de Quejas y Reclamos para reportar el incidente.
  const handleCashButton = () => {
    // Determinamos "conductor" por descarte (no-cliente), igual que el resto de
    // la pantalla (ver "Tarifa Total"). Usar `usertype === "driver"` era frágil:
    // al restaurar sesión, loadSession deja `user` como el objeto crudo de
    // Supabase Auth SIN `usertype`, y el modo de pago cash saltaba la
    // confirmación pagando directo. Soportamos también `user_type` por si el
    // objeto trae ese nombre de campo.
    const roleField = (user as any)?.usertype ?? (user as any)?.user_type;
    const isCustomer = roleField === "customer";
    if (user && !isCustomer && booking.payment_mode === "cash") {
      showAlert(
        'confirm',
        'Confirmar pago en efectivo',
        '¿Confirmas que recibiste el pago en efectivo del cliente?',
        [
          {
            text: 'No recibí el pago',
            style: 'destructive',
            onPress: () => {
              setAlertVisible(false);
              props.navigation.navigate('Complain', { booking });
            },
          },
          {
            text: 'Sí, recibí el pago',
            style: 'default',
            onPress: () => {
              setAlertVisible(false);
              doPayment('cash');
            },
          },
        ]
      );
      return;
    }
    doPayment(booking.payment_mode);
  };

  const selectCoupon = (item, index) => {
    var toDay = new Date().getTime();
    var expDate = item.promo_validity;
    item.usersUsed = item.usersUsed ? item.usersUsed : {};
    if (payDetails.amount < item.min_order) {
      showAlert('info', 'Info', 'promo_eligiblity');
    } else if (item.user_avail && item.user_avail >= item.promo_usage_limit) {
      showAlert('info', 'Info', 'promo_exp_limit');
    } else if (item.usersUsed[auth.user.uid]) {
      showAlert('info', 'Info', 'promo_used');
    } else if (toDay > expDate) {
      showAlert('info', 'Info', 'promo_exp');
    } else {
      let discounttype = item.promo_discount_type;
      if (discounttype == "PERCENTAGE") {
        let discount = parseFloat(
          (payDetails.amount * item.promo_discount_value) / 100
        ).toFixed(settings.decimal);
        if (discount > item.max_promo_discount_value) {
          let discount = item.max_promo_discount_value;
          let data = { ...payDetails };
          data.discount = discount;
          data.promo_applied = true;
          item.user_avail = item.user_avail ? parseInt(item.user_avail) + 1 : 1;
          item.usersUsed[auth.user.uid] = true;
          dispatch(editPromo(item));
          data.promo_details = item;
          data.payableAmount = parseFloat(
            data.payableAmount - discount
          ).toFixed(settings.decimal);
          setPayDetails(data);
          setPromodalVisible(false);
        } else {
          let data = { ...payDetails };
          data.discount = discount;
          data.promo_applied = true;
          item.user_avail = item.user_avail ? parseInt(item.user_avail) + 1 : 1;
          item.usersUsed[auth.user.uid] = true;
          dispatch(editPromo(item));
          (data.promo_details = item),
            (data.payableAmount = parseFloat(
              data.payableAmount - discount
            ).toFixed(settings.decimal));
          setPayDetails(data);
          setPromodalVisible(false);
        }
      } else {
        let discount = item.max_promo_discount_value;
        let data = { ...payDetails };
        data.discount = discount;
        data.promo_applied = true;
        item.user_avail = item.user_avail ? parseInt(item.user_avail) + 1 : 1;
        item.usersUsed[auth.user.uid] = true;
        dispatch(editPromo(item));
        (data.promo_details = item),
          (data.payableAmount = parseFloat(
            data.payableAmount - discount
          ).toFixed(settings.decimal));
        setPayDetails(data);
        setPromodalVisible(false);
      }
    }
  };


  const roundPrice = (price) => {
    const remainder = price % 100;
    if (remainder > 0 && remainder <= 49) {
      return price - remainder + 50;
    } else if (remainder >= 50) {
      return price - remainder + 100;
    }
    return price;
  };

  const roundedAmount = roundPrice(parseFloat(payDetails.amount));

  return (
    <View style={styles.mainView}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollStyle}
      >
        <View style={{ flex: 1, flexDirection: "column" }}>
          <View style={styles.headerSection}>
            <Text
              style={{
                color: colors.BLACK,
                textAlign: "left",
                lineHeight: 45,
                fontSize: 22,
              }}
            >
              {"Resumen del servicio"}
            </Text>
            {user &&
              user.usertype == "customer" &&
              (booking.status == "REACHED" || booking.status == "NEW") ? (
              payDetails.promo_applied ? (
                <TouchableOpacity
                  onPress={() => {
                    removePromo();
                  }}
                >
                  <Text
                    style={{
                      color: "red",
                      textAlign: "left",
                      lineHeight: 45,
                      fontSize: 14,
                    }}
                  >
                    {"Remover Promo"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    openPromoModal();
                  }}
                  style={[styles.vew3]}
                >
                  <Text
                    style={{
                      color: colors.WHITE,
                      textAlign: "left",
                      lineHeight: 45,
                      fontSize: 14,
                    }}
                  >
                    {"Aplicar Promo"}
                  </Text>
                </TouchableOpacity>
              )
            ) : null}
          </View>
          {user ? (
            <View style={styles.direcctions}>
              <View style={[styles.location, { flexDirection: "row" }]}>
                {booking && booking.trip_start_time ? (
                  <View>
                    <Text style={[styles.timeStyle, { textAlign: "left" }]}>
                      {booking.trip_start_time}
                    </Text>
                  </View>
                ) : null}
                {booking && booking.pickup ? (
                  <View
                    style={[
                      styles.address,
                      { flexDirection: "row", marginLeft: 6 },
                    ]}
                  >
                    <View style={styles.greenDot} />
                    <Text
                      style={[
                        styles.adressStyle,
                        { marginLeft: 6, textAlign: "left" },
                      ]}
                    >
                      {booking.pickup.add}
                    </Text>
                  </View>
                ) : null}
              </View>
              {booking && booking.waypoints && booking.waypoints.length > 0
                ? booking.waypoints.map((point, index) => {
                  return (
                    <View
                      key={"key" + index}
                      style={[
                        styles.location,
                        { flexDirection: "row" },
                        { justifyContent: "center", alignItems: "center" },
                      ]}
                    >
                      <View>
                        <MaterialIcons
                          name="multiple-stop"
                          size={32}
                          color={colors.SECONDARY}
                        />
                      </View>
                      <View
                        style={[
                          styles.address,
                          { flexDirection: "row", marginLeft: 6 },
                        ]}
                      >
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.adressStyle,
                            { marginLeft: 6, textAlign: "left" },
                          ]}
                        >
                          {point.add}
                        </Text>
                      </View>
                    </View>
                  );
                })
                : null}
              <View style={[styles.location, { flexDirection: "row" }]}>
                {booking && booking.trip_end_time ? (
                  <View>
                    <Text style={[styles.timeStyle, { textAlign: "left" }]}>
                      {booking.trip_end_time}
                    </Text>
                  </View>
                ) : null}
                {booking && booking.drop ? (
                  <View
                    style={[
                      styles.address,
                      { flexDirection: "row", marginLeft: 6 },
                    ]}
                  >
                    <View style={styles.redDot} />
                    <Text
                      style={[
                        styles.adressStyle,
                        { marginLeft: 6, textAlign: "left" },
                      ]}
                    >
                      {booking.drop.add}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {user ? (
            <View
              style={[
                styles.direcctions,
                {
                  flex: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: 25,
                  paddingRight: 25,
                },
              ]}
            >
              <Text
                style={{
                  color: colorScheme === "dark" ? colors.WHITE : colors.BLACK,
                  textAlign: "left",
                  lineHeight: 45,
                  fontSize: 16,
                }}
              >
                {"Distancia"}
              </Text>
              <Text
                style={{
                  color: colorScheme === "dark" ? colors.WHITE : colors.BLACK,
                  textAlign: "left",
                  lineHeight: 45,
                  fontSize: 16,
                }}
              >
                {(booking && booking.distance ? booking.distance : "0") + " "}
              </Text>
            </View>
          ) : null}
          {user ? (
            <View
              style={[
                styles.direcctions,
                {
                  flex: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: 25,
                  paddingRight: 25,
                },
              ]}
            >
              <Text
                style={{
                  color: colorScheme === "dark" ? colors.WHITE : colors.BLACK,
                  textAlign: "left",
                  lineHeight: 45,
                  fontSize: 16,
                }}
              >
                {"Tiempo total"}
              </Text>
              <Text
                style={{
                  color: colorScheme === "dark" ? colors.WHITE : colors.BLACK,
                  textAlign: "left",
                  lineHeight: 45,
                  fontSize: 16,
                }}
              >
                {(booking && booking.total_trip_time
                  ? parseFloat(booking.total_trip_time / 60).toFixed(1)
                  : "0") +
                  " " +
                  "mins"}
              </Text>
            </View>
          ) : null}

          {user && user.usertype == "driver" ? (
            <View
              style={{
                borderStyle: "dotted",
                borderWidth: 0.5,
                borderRadius: 1,
                marginBottom: 20,
              }}
            ></View>
          ) : null}

          {user ? (
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                paddingLeft: 25,
                paddingRight: 25,
              }}
            >
              <Text
                style={{
                  color: colorScheme === "dark" ? colors.WHITE : colors.BLACK,
                  textAlign: "left",
                  lineHeight: 45,
                  fontSize: 16,
                }}
              >
                {user.usertype == "customer" ? "Tu tarifa" : "Tarifa Total"}
              </Text>
              {settings.swipe_symbol === false ? (
                <Text
                  style={{
                    color: colorScheme === "dark" ? colors.WHITE : colors.BLACK,
                    textAlign: "left",
                    lineHeight: 45,
                    fontSize: 16,
                  }}
                >
                  {settings.symbol}{" "}
                  {roundedAmount}
                </Text>
              ) : (
                <Text
                  style={{
                    color: colors.BLACK,
                    textAlign: "left",
                    lineHeight: 45,
                    fontSize: 16,
                  }}
                >
                  {roundedAmount}{" "}
                  {settings.symbol}
                </Text>
              )}
            </View>
          ) : null}
          {user ? (
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                paddingLeft: 25,
                paddingRight: 25,
              }}
            >
              <Text
                style={{
                  color: colorScheme === "dark" ? colors.WHITE : colors.BLACK,
                  textAlign: "left",
                  lineHeight: 45,
                  fontSize: 16,
                }}
              >
                {"Valor de la promoción"}
              </Text>
              {settings.swipe_symbol === false ? (
                <Text
                  style={{
                    color: colors.DULL_RED,
                    textAlign: "left",
                    lineHeight: 45,
                    fontSize: 16,
                  }}
                >
                  {"-"} {settings.symbol}{" "}
                  {payDetails
                    ? payDetails.discount
                      ? parseFloat(payDetails.discount).toFixed(
                        settings.decimal
                      )
                      : "0.00"
                    : "0.00"}{" "}
                </Text>
              ) : (
                <Text
                  style={{
                    color: colors.DULL_RED,
                    textAlign: "left",
                    lineHeight: 45,
                    fontSize: 16,
                  }}
                >
                  {"-"}{" "}
                  {payDetails
                    ? payDetails.discount
                      ? parseFloat(payDetails.discount).toFixed(
                        settings.decimal
                      )
                      : "0.00"
                    : "0.00"}{" "}
                  {settings.symbol} {"-"}
                </Text>
              )}
            </View>
          ) : null}

          {user ? (
            <View
              style={{
                borderStyle: "dotted",
                borderWidth: 0.5,
                borderRadius: 1,
              }}
            ></View>
          ) : null}
          {user ? (
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                paddingLeft: 25,
                paddingRight: 25,
              }}
            >
              <Text
                style={{
                  color: colors.START_TRIP,
                  textAlign: "left",
                  lineHeight: 45,
                  fontSize: 24,
                }}
              >
                {"Monto a Pagar"}
              </Text>
              {settings.swipe_symbol === false ? (
                <Text
                  style={{
                    color: colors.START_TRIP,
                    textAlign: "left",
                    lineHeight: 45,
                    fontSize: 24,
                  }}
                >
                  {settings.symbol}{" "}
                  {roundedAmount}
                </Text>
              ) : (
                <Text
                  style={{
                    color: colors.START_TRIP,
                    textAlign: "left",
                    lineHeight: 45,
                    fontSize: 24,
                  }}
                >
                  {payDetails.payableAmount
                    ? parseFloat(payDetails.payableAmount).toFixed(
                      settings.decimal
                    )
                    : 0.0}{" "}
                  {settings.symbol}
                </Text>
              )}
            </View>
          ) : null}
        </View>

        <View style={[styles.buttonContainer, { flexDirection: "row" }]}>
        
          {booking.payment_mode == "wallet" ? (
            <TouchableOpacity
              style={styles.buttonWrapper}
              onPress={() => {
                doPayment("wallet");
              }}
            >
              <View style={styles.cardPayBtnInnner}>
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={[styles.buttonTitle, { fontSize: 16 }]}>
                    {"complete_payment"}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ) : null}
          {(booking.payment_mode === "cash" || booking.payment_mode === "corp") && (
            <TouchableOpacity
              style={styles.buttonWrapper}
              onPress={() => {
                handleCashButton(); // Confirma recepción del efectivo (conductor) o procesa el pago
              }}
            >
              <View style={styles.cardPayBtnInnner}>
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.buttonTitle}>
                    {booking.payment_mode === "cash" ? (
                      "Dinero en efectivo en el Automóvil"
                    ) : booking.payment_mode === "corp" ? (
                      <>
                        <MaterialIcons
                          name="corporate-fare"
                          size={29}
                          color="white"
                        />{" "}
                        Pago Empresarial{" "}
                      </>
                    ) : (
                      "Complete Payment"
                    )}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}



          {booking.payment_mode == "card" ? (
            <TouchableOpacity
              style={styles.buttonWrapper}
              onPress={() => {
                doPayment("card");
              }}
            >
              <View style={styles.cardPayBtnInnner}>
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.buttonTitle}>
                    {user && user.usertype == "customer"
                      ? "payWithCard"
                      : "complete_payment"}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
      {promoModal()}
      <Modal
        transparent={true}
        visible={successModalVisible}
        animationType="fade"
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.successModalContainer}>
          <Animated.View
            style={[styles.successModalView, { opacity: fadeAnim }]}
          >
            <Ionicons name="checkmark-circle" size={48} color="#fff" />
            <Text style={styles.successModalText}>¡Pago Exitoso!</Text>
          </Animated.View>
        </View>
      </Modal>
      <CustomAlert visible={alertVisible} type={alertType} title={alertTitle} message={alertMessage} buttons={alertButtons} onDismiss={() => setAlertVisible(false)} />
    </View>
  );
}

const lightStyles = StyleSheet.create({
  mainView: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  headerStyle: {
    borderBottomWidth: 0,
  },
  headerTitleStyle: {
    color: colors.WHITE,
    fontSize: 20,
    marginTop: 15,
  },
  scrollStyle: {
    flex: 1,
    height: height,
    backgroundColor: colors.WHITE,
  },
  container: {
    flex: 1,
    marginTop: 5,
    backgroundColor: "white",
  },
  buttonContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },

  buttonWrapper: {
    marginLeft: 8,
    marginRight: 8,
    marginTop: 20,
    marginBottom: 10,
    height: 55,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.BUTTON_BACKGROUND,
    borderRadius: 8,
    flex: 1,
  },
  buttonWrapper2: {
    marginLeft: 8,
    marginRight: 8,
    marginBottom: 10,
    marginTop: 20,
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.LIGHT_RED,
    borderRadius: 8,
    minWidth: "45%",
    paddingHorizontal: 3,
  },
  cardPayBtn: {
    marginHorizontal: 6,
    height: 55,
    borderRadius: 8,
    marginTop: 10,
  },
  cardPayBtnInnner: {
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    width: "100%",
  },
  buttonTitle: {
    color: colors.WHITE,
    fontSize: 18,
  },
  newname: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  emailInputContainer: {
    borderTopRightRadius: 10,
    borderTopLeftRadius: 10,
    paddingLeft: 10,
    backgroundColor: colors.WHITE,
    paddingRight: 10,
    paddingTop: 10,
    width: width - 80,
  },
  errorMessageStyle: {
    fontSize: 15,
    fontWeight: "bold",
  },
  inputTextStyle: {
    color: colors.BLACK,
    fontSize: 16,
  },
  pinbuttonStyle: {
    elevation: 0,
    bottom: 15,
    width: "80%",
    alignSelf: "center",
    borderRadius: 20,
    borderColor: "transparent",
    backgroundColor: colors.BUTTON_RIGHT,
  },
  pinbuttonContainer: { flex: 1, justifyContent: "center" },
  inputContainer: { flex: 3, justifyContent: "center", marginTop: 40 },
  pinheaderContainer: {
    height: 250,
    backgroundColor: colors.WHITE,
    width: "80%",
    justifyContent: "space-evenly",
  },
  pinheaderStyle: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: colors.HEADER,
    justifyContent: "center",
  },
  forgotPassText: {
    textAlign: "center",
    color: colors.WHITE,
    fontSize: 20,
    width: "100%",
  },
  pinContainer: { flexDirection: "row", justifyContent: "space-between" },
  forgotStyle: { flex: 3, justifyContent: "center", alignItems: "center" },
  crossIconContainer: { flex: 1, left: "40%" },
  forgot: { flex: 1 },
  pinbuttonTitle: {
    fontSize: 18,
    width: "100%",
    textAlign: "center",
  },
  newname2: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  emailInputContainer2: {
    borderTopRightRadius: 10,
    borderTopLeftRadius: 10,
    paddingLeft: 10,
    backgroundColor: colors.WHITE,
    paddingRight: 10,
    paddingTop: 10,
    width: width - 80,
  },

  inputTextStyle2: {
    color: colors.BLACK,
    fontSize: 14,
  },
  buttonStyle2: {
    elevation: 0,
    bottom: 15,
    width: "80%",
    alignSelf: "center",
    borderRadius: 20,
    borderColor: "transparent",
    backgroundColor: colors.BUTTON_RIGHT,
  },
  buttonContainer2: { flex: 1, justifyContent: "center", marginTop: 5 },
  inputContainer2: { flex: 4, paddingBottom: 25 },
  headerContainer2: {
    height: 380,
    backgroundColor: colors.WHITE,
    width: "80%",
    justifyContent: "center",
  },
  headerStyle2: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: colors.HEADER,
    justifyContent: "center",
  },
  forgotPassText2: {
    textAlign: "center",
    color: colors.WHITE,
    fontSize: 16,
    width: "100%",
  },
  forgotContainer2: { flexDirection: "row", justifyContent: "space-between" },
  forgotStyle2: { flex: 3, justifyContent: "center" },
  crossIconContainer2: { flex: 1, left: "40%" },
  forgot2: { flex: 1 },
  buttonTitle2: {
    fontSize: 16,
    width: "100%",
    textAlign: "center",
  },

  containercvv: {
    flex: 1,
    width: "100%",
    height: "80%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingTop: 120,
  },
  modalContainercvv: {
    height: 200,
    backgroundColor: colors.WHITE,
    width: "80%",
    borderRadius: 10,
    elevation: 15,
  },
  crossIconContainercvv: {
    flex: 1,
    left: "40%",
  },
  blankViewStylecvv: {
    flex: 1,
    flexDirection: "row",
    alignSelf: "flex-end",
    marginTop: 15,
    marginRight: 15,
  },
  blankViewStyleOTP: {
    flex: 1,
    flexDirection: "row",
    alignSelf: "flex-end",
  },
  modalHeaderStylecvv: {
    textAlign: "center",
    fontSize: 20,
    paddingTop: 10,
  },
  modalContainerViewStylecvv: {
    flex: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  itemsViewStylecvv: {
    flexDirection: "column",
  },
  textStylecvv: {
    fontSize: 20,
  },
  location: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 6,
  },
  timeStyle: {
    fontSize: 16,
    marginTop: 1,
  },
  greenDot: {
    backgroundColor: colors.GREEN_DOT,
    width: 10,
    height: 10,
    borderRadius: 50,
    alignSelf: "flex-start",
    marginTop: 5,
  },
  redDot: {
    backgroundColor: colors.RED,
    width: 10,
    height: 10,
    borderRadius: 50,
    alignSelf: "flex-start",
    marginTop: 5,
  },
  address: {
    flexDirection: "row",
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    width: 0,
    marginLeft: 6,
  },
  adressStyle: {
    marginLeft: 6,
    fontSize: 15,
    lineHeight: 20,
  },
  emailStyle: {
    fontSize: 17,
    color: colors.BLACK,
    textAlign: "center",
  },
  vew3: {
    flexDirection: "row",
    height: 40,
    width: 140,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: colors.LIGHT_RED,
    borderRadius: 10,
    marginVertical: 15,
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    width: "90%",
    left: 25,
  },
  direcctions: {
    flex: 1,
    paddingLeft: 25,
    paddingRight: 25,
    elevation: 5,
    margin: 10,
    backgroundColor: "#F7F7F7",
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  },
  breakdownHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  successModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  successModalView: {
    width: 250,
    padding: 20,
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    alignItems: "center",
    elevation: 10,
  },
  successModalText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
});
const darkStyles = StyleSheet.create({
  mainView: {
    flex: 1,
    backgroundColor: '#474747',
  },
  headerStyle: {
    borderBottomWidth: 0,
  },
  headerTitleStyle: {
    color: colors.WHITE,
    fontSize: 20,
    marginTop: 15,
  },
  scrollStyle: {
    flex: 1,
    height: height,
    backgroundColor: '#474747',
  },
  container: {
    flex: 1,
    marginTop: 5,
    backgroundColor: "white",
  },
  buttonContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },

  buttonWrapper: {
    marginLeft: 8,
    marginRight: 8,
    marginTop: 20,
    marginBottom: 10,
    height: 55,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.BUTTON_BACKGROUND,
    borderRadius: 8,
    flex: 1,
  },
  buttonWrapper2: {
    marginLeft: 8,
    marginRight: 8,
    marginBottom: 10,
    marginTop: 20,
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.LIGHT_RED,
    borderRadius: 8,
    minWidth: "45%",
    paddingHorizontal: 3,
  },
  cardPayBtn: {
    marginHorizontal: 6,
    height: 55,
    borderRadius: 8,
    marginTop: 10,
  },
  cardPayBtnInnner: {
    height: 55,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    width: "100%",
  },
  buttonTitle: {
    color: colors.WHITE,
    fontSize: 18,
  },
  newname: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  emailInputContainer: {
    borderTopRightRadius: 10,
    borderTopLeftRadius: 10,
    paddingLeft: 10,
    backgroundColor: colors.WHITE,
    paddingRight: 10,
    paddingTop: 10,
    width: width - 80,
  },
  errorMessageStyle: {
    fontSize: 15,
    fontWeight: "bold",
  },
  inputTextStyle: {
    color: colors.BLACK,
    fontSize: 16,
  },
  pinbuttonStyle: {
    elevation: 0,
    bottom: 15,
    width: "80%",
    alignSelf: "center",
    borderRadius: 20,
    borderColor: "transparent",
    backgroundColor: colors.BUTTON_RIGHT,
  },
  pinbuttonContainer: { flex: 1, justifyContent: "center" },
  inputContainer: { flex: 3, justifyContent: "center", marginTop: 40 },
  pinheaderContainer: {
    height: 250,
    backgroundColor: colors.WHITE,
    width: "80%",
    justifyContent: "space-evenly",
  },
  pinheaderStyle: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: colors.HEADER,
    justifyContent: "center",
  },
  forgotPassText: {
    textAlign: "center",
    color: colors.WHITE,
    fontSize: 20,
    width: "100%",
  },
  pinContainer: { flexDirection: "row", justifyContent: "space-between" },
  forgotStyle: { flex: 3, justifyContent: "center", alignItems: "center" },
  crossIconContainer: { flex: 1, left: "40%" },
  forgot: { flex: 1 },
  pinbuttonTitle: {
    fontSize: 18,
    width: "100%",
    textAlign: "center",
  },
  newname2: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  emailInputContainer2: {
    borderTopRightRadius: 10,
    borderTopLeftRadius: 10,
    paddingLeft: 10,
    backgroundColor: colors.WHITE,
    paddingRight: 10,
    paddingTop: 10,
    width: width - 80,
  },

  inputTextStyle2: {
    color: colors.BLACK,
    fontSize: 14,
  },
  buttonStyle2: {
    elevation: 0,
    bottom: 15,
    width: "80%",
    alignSelf: "center",
    borderRadius: 20,
    borderColor: "transparent",
    backgroundColor: colors.BUTTON_RIGHT,
  },
  buttonContainer2: { flex: 1, justifyContent: "center", marginTop: 5 },
  inputContainer2: { flex: 4, paddingBottom: 25 },
  headerContainer2: {
    height: 380,
    backgroundColor: colors.WHITE,
    width: "80%",
    justifyContent: "center",
  },
  headerStyle2: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: colors.HEADER,
    justifyContent: "center",
  },
  forgotPassText2: {
    textAlign: "center",
    color: colors.WHITE,
    fontSize: 16,
    width: "100%",
  },
  forgotContainer2: { flexDirection: "row", justifyContent: "space-between" },
  forgotStyle2: { flex: 3, justifyContent: "center" },
  crossIconContainer2: { flex: 1, left: "40%" },
  forgot2: { flex: 1 },
  buttonTitle2: {
    fontSize: 16,
    width: "100%",
    textAlign: "center",
  },

  containercvv: {
    flex: 1,
    width: "100%",
    height: "80%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingTop: 120,
  },
  modalContainercvv: {
    height: 200,
    backgroundColor: colors.WHITE,
    width: "80%",
    borderRadius: 10,
    elevation: 15,
  },
  crossIconContainercvv: {
    flex: 1,
    left: "40%",
  },
  blankViewStylecvv: {
    flex: 1,
    flexDirection: "row",
    alignSelf: "flex-end",
    marginTop: 15,
    marginRight: 15,
  },
  blankViewStyleOTP: {
    flex: 1,
    flexDirection: "row",
    alignSelf: "flex-end",
  },
  modalHeaderStylecvv: {
    textAlign: "center",
    fontSize: 20,
    paddingTop: 10,
  },
  modalContainerViewStylecvv: {
    flex: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  itemsViewStylecvv: {
    flexDirection: "column",
  },
  textStylecvv: {
    fontSize: 20,
  },
  location: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 6,
  },
  timeStyle: {
    fontSize: 16,
    marginTop: 1,
    color: colors.WHITE,
  },
  greenDot: {
    backgroundColor: colors.GREEN_DOT,
    width: 10,
    height: 10,
    borderRadius: 50,
    alignSelf: "flex-start",
    marginTop: 5,
  },
  redDot: {
    backgroundColor: colors.RED,
    width: 10,
    height: 10,
    borderRadius: 50,
    alignSelf: "flex-start",
    marginTop: 5,
  },
  address: {
    flexDirection: "row",
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    width: 0,
    marginLeft: 6,
  },
  adressStyle: {
    marginLeft: 6,
    fontSize: 15,
    lineHeight: 20,
    color: colors.WHITE,
  },
  emailStyle: {
    fontSize: 17,
    color: colors.BLACK,
    textAlign: "center",
  },
  vew3: {
    flexDirection: "row",
    height: 40,
    width: 140,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: colors.LIGHT_RED,
    borderRadius: 10,
    marginVertical: 15,
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    width: "90%",
    left: 25,
  },
  direcctions: {
    flex: 1,
    paddingLeft: 25,
    paddingRight: 25,
    elevation: 5,
    margin: 10,
    backgroundColor: "#000",
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  },
  breakdownHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  successModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  successModalView: {
    width: 250,
    padding: 20,
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    alignItems: "center",
    elevation: 10,
  },
  successModalText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
});
