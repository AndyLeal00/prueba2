import React, { useEffect, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  useColorScheme,

} from "react-native";
import { Fontisto, Ionicons, Octicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import moment from "moment/min/moment-with-locales";
import { Avatar } from "react-native-elements";
import StarRating from "react-native-star-rating-widget";
import { RootState } from "@/common/store";
import supabase from "@/config/SupabaseConfig";
import { colors } from "@/scripts/theme";
import Mapbox, { MapboxStyles } from '@/config/MapboxConfig';
import { roundPrice } from "@/hooks/roundPrice";
const { width, height } = Dimensions.get("window");
const GOOGLE_MAPS_APIKEY_PROD = "AIzaSyDdkvNeB_M3yf_elrPagGAb8kKMARn4oIU";
const MAIN_COLOR = "#000";
const PAGE_SIZE = 5;
import RadioForm from "react-native-simple-radio-button";
import { useDispatch } from "react-redux";
import {
  startBooking,
  endBooking,
  arriveBooking,
  updateLocation,
  reportIncident,
} from "@/common/store/bookingsSlice.ts";
import { cp } from "fs";
const ActiveBookingScreen = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const navigation = useNavigation();
  const colorScheme = useColorScheme(); // Hook para detectar si es modo oscuro o claro
    const [isIncidentModalVisible, setIsIncidentModalVisible] = useState(false);
    
    const dispatch = useDispatch();

  const [activeBookings, setActiveBookings] = useState([]);
  const [completedBookings, setCompletedBookings] = useState([]);
  const [cancelledBookings, setCancelledBookings] = useState([]);
  const [completedBookingsPage, setCompletedBookingsPage] = useState(1);
  const [cancelledBookingsPage, setCancelledBookingsPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [userInfoModalStatus, setUserInfoModalStatus] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedTab, setSelectedTab] = useState("ACCEPTED");
  const [completedLoading, setCompletedLoading] = useState(false);
  const [cancelledLoading, setCancelledLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isModalTime, setIsModalTime] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [currentBooking, setCurrentBooking] = useState(null);
  const incidentOptions = [
    { label: "Falla Mecanica (Parcial)", value: "Falla Mecanica (Parcial)" },

    {
      label: "Accidente de Tránsito (Fotos Requeridas)",
      value: "Accidente de Tránsito con Heridos (Fotos Requeridas)",
    },
    {
      label:
        "Tome el servicio por error y no alcanzo a llegar a cumplir con la reserva.",
      value:
        "Tome el servicio por error y no alcanzo a llegar a cumplir con la reserva.",
    },

    { label: "Falla Mecanica (Total)", value: "Falla Mecanica (Total)" },
    { label: "Falla Electrica", value: "Falla Electrica" },
    { label: "Otros", value: "Otros" },
    // Agrega más opciones según sea necesario
  ];
  const fetchBookingsByStatus = async (
    status,
    page,
    setBookings,
    currentBookings
  ) => {
    if (user) {
      try {
        const statusField =
          user?.usertype === "driver" ? "driver_status" : "customer_status";
        
        const { data, error } = await supabase
          .from('bookings_v2_mobile' as any)
          .select("*")
          .eq(statusField, status)
          .order("created_at", { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
        
        if (error) {
          console.error("Error fetching bookings:", error.message);
          setBookings(currentBookings);
          return;
        }
        
        setBookings([...currentBookings, ...(data || [])]);
      } catch (error) {
        console.error("Error in fetchBookingsByStatus:", error);
        setBookings(currentBookings);
      }
    } else {
      setBookings(currentBookings);
    }
  };

  const fetchBookingsByStatuses = async (statuses, setBookings, currentBookings) => {
    if (user) {
      try {
        const statusField =
          user?.usertype === "driver" ? "driver_status" : "customer_status";

        // Build query for multiple statuses - use in() for multiple values
        const { data, error } = await supabase
          .from('bookings_v2_mobile' as any)
          .select("*")
          .in(statusField, statuses)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching bookings:", error.message);
          setBookings(currentBookings);
          return;
        }

        setBookings([...currentBookings, ...(data || [])]);
      } catch (error) {
        console.error("Error in fetchBookingsByStatuses:", error);
        setBookings(currentBookings);
      }
    } else {
      setBookings(currentBookings);
    }
  };

  useEffect(() => {
    const allowedStatuses = [
      "NEW",
      "ACCEPTED",
      "STARTED",
      "PAID",
      "REACHED",
      "ARRIVED",
    ];
    if (selectedTab === "ACCEPTED") {
      fetchBookingsByStatuses(allowedStatuses, setActiveBookings, []);
    } else if (selectedTab === "COMPLETE") {
      fetchBookingsByStatus(
        "COMPLETE",
        completedBookingsPage,
        setCompletedBookings,
        []
      );
    } else if (selectedTab === "CANCELLED") {
      fetchBookingsByStatus(
        "CANCELLED",
        cancelledBookingsPage,
        setCancelledBookings,
        []
      );
    }
  }, [selectedTab, user]);

  const handleLoadMore = async () => {
    try {
      if (selectedTab === "COMPLETE") {
        setCompletedLoading(true);
        const nextPage = completedBookingsPage + 1;
        fetchBookingsByStatus(
          "COMPLETE",
          nextPage,
          setCompletedBookings,
          completedBookings
        );
        setCompletedBookingsPage(nextPage);
        setCompletedLoading(false);
      } else if (selectedTab === "CANCELLED") {
        setCancelledLoading(true);
        const nextPage = cancelledBookingsPage + 1;
        fetchBookingsByStatus(
          "CANCELLED",
          nextPage,
          setCancelledBookings,
          cancelledBookings
        );
        setCancelledBookingsPage(nextPage);
        setCancelledLoading(false);
      }
    } catch (e) {
      console.error("Error loading more bookings:", e);
    }
  };
  const handleBookingPress = (booking) => {
    const allowedStatuses = [
      "NEW",
      "ACCEPTED",
      "STARTED",
      "PAID",
      "REACHED",
      "ARRIVED",
    ];
    const paymentStatus = ["REACHED"];
    const paymentStatusRating = ["PAID"];

    const bookingDate = new Date(booking.tripdate);
    const currentDate = new Date();
    const timeDifference = (bookingDate - currentDate) / (1000 * 60); // Diferencia en minutos

    if (allowedStatuses.includes(booking.status)) {
      if (timeDifference < 60) {
        navigation.navigate("Booking", { booking });
      } else {
        setIsModalTime(true);
      }
    } else if (booking.status === "COMPLETE") {
      setSelectedBooking(booking);
      setModalVisible(true);
      console.log("Coordenadas de la reserva seleccionada:", booking.coords);
    } else if (paymentStatus.includes(booking.status)) {
      navigation.navigate("Payment", { booking });
    } else if (paymentStatusRating.includes(booking.status)) {
      navigation.navigate("Rating", { booking });
    }
  };

  const filteredBookings = useMemo(() => {
    if (selectedTab === "ACCEPTED") {
      return activeBookings;
    } else if (selectedTab === "COMPLETE") {
      return completedBookings;
    } else if (selectedTab === "CANCELLED") {
      return cancelledBookings;
    }
    return [];
  }, [activeBookings, completedBookings, cancelledBookings, selectedTab]);
  const styles = colorScheme === "dark" ? darkStyles : lightStyles; // Estilos dinámicos
  const handleReporIncident = (booking) => {
    setIsIncidentModalVisible(true);
    setCurrentBooking(booking);
  };
  const handleReportIncident = () => {
    if (!currentBooking.id || !selectedIncident) {
      console.error("Booking ID or incident not available");
      return;
    }
    dispatch(
      reportIncident({
        bookingId: currentBooking.id,
        incident: selectedIncident,
      })
    ).then((response) => {
      if (response.error) {
        console.error("Error reporting incident:", response.error.message);
      } else {
        console.log("Incidencia reportada con éxito:", selectedIncident);
      }
    });
    setIsIncidentModalVisible(false);
  };
  const renderBooking = (booking, index) => (
    <TouchableOpacity
      activeOpacity={0.8}
      key={`${booking.id}_${selectedTab}_${index}`} // Asegurar una clave única
      onPress={() => handleBookingPress(booking)}
      style={[styles.BookingContainer, styles.elevation]}
    >
      <View style={[styles.box, { padding: 15 }]}>
        <View style={{ flexDirection: "row", flex: 1 }}>
          <View style={{ flexDirection: "column", flex: 1 }}>
            <View style={{ flexDirection: "row" }}>
              <View style={{ width: 30, alignItems: "center" }}>
                <Image
                  source={require("./../../assets/images/iconos3d/45.png")}
                  style={{ width: 30, height: 30, bottom: 6 }}
                />
              </View>
              <View style={{ flex: 1, marginBottom: 10 }}>
                <Text
                  style={[
                    styles.textStyle,
                    {
                      marginLeft: 6,
                      textAlign: "left",
                      color: colors.LIGHT_RED,
                    },
                  ]}
                >
                  {booking.tripdate
                    ? moment(booking.tripdate).format("lll")
                    : ""}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row" }}>
              <View style={{ width: 30, alignItems: "center" }}>
                <Ionicons
                  name="location-outline"
                  size={24}
                  color={colors.BALANCE_GREEN}
                />
              </View>
              <View style={{ flex: 1, marginBottom: 10 }}>
                <Text
                  style={[
                    styles.textStyle,
                    { marginLeft: 6, textAlign: "left", color: colorScheme === "dark" ? colors.WHITE : colors.BLACK },
                  ]}
                >
                  {booking.pickup?.add}{" "}
                </Text>
              </View>
            </View>

            {booking && booking.waypoints && booking.waypoints.length > 0 ? (
              <View style={{ flexDirection: "row" }}>
                <View style={{ width: 30, alignItems: "center" }}>
                  <Ionicons
                    name="location-outline"
                    size={24}
                    color={colors.BOX_BG}
                  />

                  <View style={[styles.hbox2, { flex: 1, minHeight: 5 }]} />
                </View>
                <View style={{ flex: 1, marginBottom: 10 }}>
                  <Text
                    style={[
                      styles.textStyle,
                      { marginLeft: 6, textAlign: "left" },
                    ]}
                  >
                    {booking.waypoints.length} {"stops"}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: "row" }}>
              <View style={{ width: 30, alignItems: "center" }}>
                <Ionicons
                  name="location-outline"
                  size={24}
                  color={colors.BUTTON_ORANGE}
                />
              </View>
              <View style={{ flex: 1, marginBottom: 10 }}>
                <Text
                  style={[
                    styles.textStyle,
                    { marginLeft: 6, textAlign: "left" },
                  ]}
                >
                  {booking.drop?.add}
                </Text>
              </View>
            </View>
          </View>
       
        </View>
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 30, alignItems: "center" }}>
            <Ionicons
              name="footsteps-outline"
              size={24}
              color={colors.BUTTON_ORANGE}
            />
          </View>

          <View style={{ flex: 1, marginBottom: 10 }}>
            <Text
              style={[
                styles.textStyle,
                { marginLeft: 6, textAlign: "left"},
              ]}
            >
              {booking.estimateDistance
                ? parseFloat(booking.estimateDistance).toFixed(1)
                : "0.0"}{" "}
              KM
            </Text>
          </View>


        </View>

        <View style={{ flexDirection: "column", flex: 1, minHeight: 60 }}>
          <View style={{ 
            flexDirection: "row", 
            flex: 1, 
            minHeight: 60,
            borderBottomColor: colorScheme === "dark" ? '#fff' : 'transparent', 
            borderBottomWidth: colorScheme === "dark" ? 1 : 0 
          }}>
            <View style={[styles.details, { flexDirection: "row" }]}>
              <Text style={{ fontSize: 24, color: colorScheme === "dark" ? colors.WHITE : colors.BLACK , opacity: 0.8 }}>
                $
              </Text>
              <Text style={styles.textStyleBold}>
                {booking && booking.trip_cost > 0
                  ? roundPrice(parseFloat(booking.trip_cost))
                  : booking && booking.estimate
                    ? roundPrice(parseFloat(booking.estimate))
                    : 0}
              </Text>
            </View>
            <View
              style={[styles.hbox2, { minHeight: 5, width: 1, margin: 2 }]}
            />
            <View style={[styles.details, { flexDirection: "row" }]}>
              <Fontisto
                name="map"
                size={26}
                color={colorScheme === "dark" ? colors.WHITE : MAIN_COLOR}
                style={{ opacity: 0.8 }}
              />
              <View style={{ flexDirection: "row" }}>
                <Text style={styles.textStyleBold}>
                  {booking && booking.distance > 0
                    ? parseFloat(booking.distance).toFixed(2)
                    : 0}
                </Text>
                <Text style={styles.textStyle}> {"km"} </Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: "row", flex: 1, minHeight: 60 }}>
            <View
              style={[
                styles.details,
                { flexDirection: "row", borderBottomWidth: 0 },
              ]}
            >
              <Octicons
                name="clock"
                size={26}
                color={colorScheme === "dark" ? colors.WHITE : MAIN_COLOR}
                style={{ opacity: 0.8 }}
              />
              <View style={{ flexDirection: "row" }}>
                <Text style={styles.textStyleBold}>
                  {isNaN(Number(booking.estimateTime)) ? booking.estimateTime : Math.round(Number(booking.estimateTime))}
                </Text>
                <Text style={styles.textStyle}> {"mins"} </Text>
              </View>
            </View>
            <View
              style={[styles.hbox2, { minHeight: 5, width: 1, margin: 2 }]}
            />
            <View style={[styles.clock, { flexDirection: "row" }]}>
              {booking && booking.trip_start_time && booking.trip_end_time ? (
                <View style={{ flexDirection: "row" }}>
                  <View style={[styles.section, { flexDirection: "row" }]}>
                    <Ionicons
                      name="location-outline"
                      size={28}
                      color={colors.BALANCE_GREEN}
                    />
                    <View>
                      <View style={{ flexDirection: "row" }}>
                        <Text style={styles.textStyleBold}>
                          {booking && booking.trip_start_time
                            ? booking.trip_start_time.substring(
                              0,
                              booking.trip_start_time.indexOf(":")
                            ).length == 2
                              ? booking.trip_start_time.substring(
                                0,
                                booking.trip_start_time.indexOf(":")
                              )
                              : "0" +
                              booking.trip_start_time.substring(
                                0,
                                booking.trip_start_time.indexOf(":")
                              )
                            : ""}
                        </Text>
                        <Text style={styles.textStyleBold}>
                          {booking && booking.trip_start_time
                            ? booking.trip_start_time.substring(
                              booking.trip_start_time.indexOf(":") + 1,
                              booking.trip_start_time.lastIndexOf(":")
                            ).length == 2
                              ? booking.trip_start_time.substring(
                                booking.trip_start_time.indexOf(":"),
                                booking.trip_start_time.lastIndexOf(":")
                              )
                              : ":0" +
                              booking.trip_start_time.substring(
                                booking.trip_start_time.indexOf(":") + 1,
                                booking.trip_start_time.lastIndexOf(":")
                              )
                            : ""}
                        </Text>
                      </View>
                        <Text style={{ textAlign: "left", fontSize: 8, color: colorScheme === "dark" ? "white" : "black" }}>
                        {booking.startTime
                          ? moment(booking.startTime).format("ll")
                          : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.section, { flexDirection: "row" }]}>
                    <Ionicons
                      name="location-outline"
                      size={28}
                      color={colors.BUTTON_ORANGE}
                    />
                    <View>
                      <View style={{ flexDirection: "row" }}>
                        <Text style={styles.textStyleBold}>
                          {booking && booking.trip_end_time
                            ? booking.trip_end_time.substring(
                              0,
                              booking.trip_end_time.indexOf(":")
                            ).length == 2
                              ? booking.trip_end_time.substring(
                                0,
                                booking.trip_end_time.indexOf(":")
                              )
                              : "0" +
                              booking.trip_end_time.substring(
                                0,
                                booking.trip_end_time.indexOf(":")
                              )
                            : ""}
                        </Text>
                        <Text style={styles.textStyleBold}>
                          {booking && booking.trip_end_time
                            ? booking.trip_end_time.substring(
                              booking.trip_end_time.indexOf(":") + 1,
                              booking.trip_end_time.lastIndexOf(":")
                            ).length == 2
                              ? booking.trip_end_time.substring(
                                booking.trip_end_time.indexOf(":"),
                                booking.trip_end_time.lastIndexOf(":")
                              )
                              : ":0" +
                              booking.trip_end_time.substring(
                                booking.trip_end_time.indexOf(":") + 1,
                                booking.trip_end_time.lastIndexOf(":")
                              )
                            : ""}
                        </Text>
                      </View>
                      <Text style={{ textAlign: "left", fontSize: 8, color: colorScheme === "dark" ? "white" : "black" }}>
                      {booking.endTime
                          ? moment(booking.endTime).format("ll")
                          : ""}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : booking && booking.trip_start_time ? (
                <View style={{ flexDirection: "row" }}>
                  <View style={[styles.section, { flexDirection: "row" }]}>
                    <Ionicons
                      name="location-outline"
                      size={28}
                      color={colors.BALANCE_GREEN}
                    />
                    <View>
                      <View style={{ flexDirection: "row" }}>
                        <Text style={styles.textStyleBold}>
                          {booking && booking.trip_start_time
                            ? booking.trip_start_time.substring(
                              0,
                              booking.trip_start_time.indexOf(":")
                            ).length == 2
                              ? booking.trip_start_time.substring(
                                0,
                                booking.trip_start_time.indexOf(":")
                              )
                              : "0" +
                              booking.trip_start_time.substring(
                                0,
                                booking.trip_start_time.indexOf(":")
                              )
                            : ""}
                        </Text>
                        <Text style={styles.textStyleBold}>
                          {booking && booking.trip_start_time
                            ? booking.trip_start_time.substring(
                              booking.trip_start_time.indexOf(":") + 1,
                              booking.trip_start_time.lastIndexOf(":")
                            ).length == 2
                              ? booking.trip_start_time.substring(
                                booking.trip_start_time.indexOf(":"),
                                booking.trip_start_time.lastIndexOf(":")
                              )
                              : ":0" +
                              booking.trip_start_time.substring(
                                booking.trip_start_time.indexOf(":") + 1,
                                booking.trip_start_time.lastIndexOf(":")
                              )
                            : ""}
                        </Text>
                      </View>
                      <Text style={{ textAlign: "left", fontSize: 8, color: colorScheme === "dark" ? "#fff" : "#000" }}>
                        {booking.startTime
                          ? moment(booking.startTime).format("ll")
                          : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.section, { flexDirection: "row" }]}>
                    <Ionicons
                      name="location-outline"
                      size={28}
                      color={colors.BUTTON_ORANGE}
                    />
                    <Image
                      source={require("../../assets/video/clock.gif")}
                      style={{
                        width: 25,
                        height: 25,
                        alignSelf: "center",
                        resizeMode: "center",
                        borderRadius: 20,
                      }}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row" }}>
                  <Text style={styles.textStyleBold}>
                    {booking?.status === "ACCEPTED"
                      ? "ACEPTADO"
                      : booking && booking.status === "REACHED"
                        ? "ALCANZADO"
                        : booking && booking.status === "STARTED"
                          ? "INICIO"
                          : booking && booking.status === "NEW"
                            ? "NUEVO"
                            : booking && booking.status === "ARRIVED"
                              ? "LLEGO" :
                              booking && booking.status === "CANCELLED"
                                ? "CANCELADO"
                                : "SIN ESTADO"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {booking ? (
          <View style={[styles.driverDetails, { flexDirection: "row" }]}>
            <View
              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
            >
              {booking ? (
                !(
                  booking.driver_image == "" ||
                  booking.driver_image == null ||
                  booking.driver_image == "undefined"
                ) && user?.usertype == "customer" ? (
                  <Avatar
                    size="medium"
                    rounded
                    source={{ uri: booking.driver_image }}
                    activeOpacity={0.7}
                  />
                ) : !(
                  booking.customer_image == "" ||
                  booking.customer_image == null ||
                  booking.customer_image == "undefined"
                ) && user?.usertype == "driver" ? (
                  <Avatar
                    size="medium"
                    rounded
                    source={{ uri: booking.customer_image }}
                    activeOpacity={0.7}
                  />
                ) : booking.driver_name != "" ? (
                  <Avatar
                    size="medium"
                    rounded
                    source={require("../../assets/images/Avatar/1.png")}
                    activeOpacity={0.7}
                  />
                ) : null
              ) : null}
              <View style={[styles.userView, { flex: 1, marginHorizontal: 5 }]}>
                {booking &&
                  booking.driver_name != "" &&
                  user?.usertype == "customer" ? (
                  <Text style={[styles.textStyleBold, { textAlign: "left" }]}>
                    {booking.driver_name ? booking.driver_name : "Sin Asignar"}
                  </Text>
                ) : null}

                {booking &&
                  booking.customer_name != "" &&
                  user?.usertype == "driver" ? (
                  <Text style={[styles.textStyleBold, { textAlign: "left" }]}>
                    {booking.customer_name
                      ? booking.customer_name
                      : "Sin Asignar"}
                  </Text>
                ) : null}

                {booking &&
                  booking.rating > 0 &&
                  booking.driver_name &&
                  user?.usertype == "customer" ? (
                  <View>
                    <StarRating
                      maxStars={5}
                      starSize={15}
                      enableHalfStar={true}
                      color={MAIN_COLOR}
                      emptyColor={MAIN_COLOR}
                      rating={
                        booking && booking.rating
                          ? parseFloat(booking.rating)
                          : 0
                      }
                      style={[styles.contStyle, { marginLeft: -8 }]}
                      onChange={() => {
                        ////console.log('hello')
                      }}
                    />
                    
                  </View>
                ) : null}
              
              </View>
            </View>
            {booking.status === "ACCEPTED" && (
                <TouchableOpacity onPress={() => handleReporIncident(booking)}>
                  <Text style={styles.reportText}>Reportar Incidencia</Text>
                </TouchableOpacity>
              )}
          </View>
        ) : null}

        <Modal
          animationType="fade"
          transparent={true}
          visible={userInfoModalStatus}
          onRequestClose={() => {
            setUserInfoModalStatus(false);
          }}
        >
          <View style={styles.centeredView}>
            <View style={styles.modalView}>
              <View style={{ width: "100%" }}>
                {booking && booking.deliveryPersonPhone ? (
                  <View
                    style={[
                      styles.textContainerStyle,
                      { alignItems: "flex-start" },
                    ]}
                  >
                    <Text style={styles.textStyleBold}>
                      {"senderPersonPhone"}
                    </Text>
                    <View style={{ flexDirection: "row", marginVertical: 10 }}>
                      <Ionicons name="call" size={24} color={colors.BLACK} />
                      <Text
                        style={styles.textContent1}
                        onPress={() => onPressCall(booking.deliveryPersonPhone)}
                      >
                        {" "}
                        {booking.deliveryPersonPhone}{" "}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                loading={false}
                onPress={() => setUserInfoModalStatus(false)}
                style={styles.modalBtn}
              >
                <Text style={styles.textStyleBold}>{"ok"}</Text>
              </TouchableOpacity>
            
            </View>
          </View>
        </Modal>
      </View>
    </TouchableOpacity>
  );
  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          onPress={() => setSelectedTab("ACCEPTED")}
          style={[styles.tab, selectedTab === "ACCEPTED" && styles.activeTab]}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "ACCEPTED" && styles.activeTabText,
            ]}
          >
            ACTIVAS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSelectedTab("COMPLETE")}
          style={[styles.tab, selectedTab === "COMPLETE" && styles.activeTab]}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "COMPLETE" && styles.activeTabText,
            ]}
          >
            COMPLETAS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSelectedTab("CANCELLED")}
          style={[styles.tab, selectedTab === "CANCELLED" && styles.activeTab]}
        >
          <Text
            style={[
              styles.tabText,
              selectedTab === "CANCELLED" && styles.activeTabText,
            ]}
          >
            CANCELADAS
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer}>
        {filteredBookings.length > 0 ? (
          filteredBookings.map((booking, index) =>
            renderBooking(booking, index)
          )
        ) : (
          <Text style={styles.message}>No hay reservas disponibles.</Text>
        )}
        {(selectedTab === "COMPLETE" || selectedTab === "CANCELLED") &&
          filteredBookings.length >= PAGE_SIZE && (
            <TouchableOpacity
              onPress={handleLoadMore}
              style={styles.loadMoreButton}
              disabled={completedLoading || cancelledLoading}
            >
              <Text style={styles.loadMoreText}>
                {completedLoading || cancelledLoading
                  ? "Cargando..."
                  : "Cargar más"}
              </Text>
            </TouchableOpacity>
          )}
      </ScrollView>
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            {selectedBooking && (
              <>
                <Text style={styles.modalTitle}>Detalles de la Reserva</Text>
                <Mapbox.MapView
                  style={styles.map}
                  styleURL={colorScheme === "dark" ? MapboxStyles.DARK : MapboxStyles.STREET}
                  logoEnabled={false}
                  attributionEnabled={false}
                >
                  <Mapbox.Camera
                    zoomLevel={14}
                    centerCoordinate={[
                      selectedBooking?.coords[0]?.longitude || 0,
                      selectedBooking?.coords[0]?.latitude || 0
                    ]}
                    animationDuration={1000}
                  />
                  
                  <Mapbox.PointAnnotation
                    id="start-marker"
                    coordinate={[
                      selectedBooking.coords[0].longitude,
                      selectedBooking.coords[0].latitude
                    ]}
                  >
                    <View>
                      <Ionicons
                        name="location-outline"
                        size={32}
                        color={colors.BALANCE_GREEN}
                      />
                    </View>
                  </Mapbox.PointAnnotation>

                  <Mapbox.PointAnnotation
                    id="end-marker"
                    coordinate={[
                      selectedBooking.coords[selectedBooking.coords.length - 1].longitude,
                      selectedBooking.coords[selectedBooking.coords.length - 1].latitude
                    ]}
                  >
                    <View>
                      <Ionicons
                        name="location-outline"
                        size={32}
                        color={colors.BUTTON_ORANGE}
                      />
                    </View>
                  </Mapbox.PointAnnotation>
                </Mapbox.MapView>

                <View style={styles.detailsContainer}>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Nombre del cliente: </Text>
                    {selectedBooking.customer_name}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Ionicons
                      name="location-outline"
                      size={24}
                      color={colors.BALANCE_GREEN} // Color for the pickup icon
                    />
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>
                        Dirección de recogida:{" "}
                      </Text>
                      {selectedBooking.pickupAddress}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Ionicons
                      name="location-outline"
                      size={24}
                      color={colors.BUTTON_ORANGE} // Color for the destination icon
                    />
                    <Text style={styles.detailText}>
                      <Text style={styles.detailLabel}>
                        Dirección de destino:{" "}
                      </Text>
                      {selectedBooking.drop.add}
                    </Text>
                  </View>

                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Costo total: </Text>
                    {selectedBooking.trip_cost}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>Método de pago: </Text>
                    {selectedBooking.payment_mode}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={styles.detailLabel}>
                      Fecha de la reserva:{" "}
                    </Text>
                    {new Date(selectedBooking.tripdate).toLocaleString()}
                  </Text>

                </View>
                <Pressable
                  style={styles.buttonClose}
                  onPress={() => setModalVisible(!modalVisible)}
                >
                  <Text style={styles.textStyle}>Cerrar</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={isModalTime}
        onRequestClose={() => {
          setIsModalTime(false);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Podrás abrir esta reserva en una hora antes de la fecha y hora de inicio de la reserva</Text>
            <Image
              source={require('@/assets/video/relojReservas.gif')}
              style={{ width: 100, height: 100, marginTop: 20 }}
            />
            <Pressable
              style={styles.buttonClose}
              onPress={() => setIsModalTime(false)}
            >
              <Text style={styles.textStyle}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
          animationType="slide"
          transparent={true}
          visible={isIncidentModalVisible}
          onRequestClose={() => setIsIncidentModalVisible(false)}
        >
          <View style={styles.modalCenteredView}>
            <View style={styles.modalView}>
              <Text style={styles.modalText}>Selecciona una incidencia:</Text>
              <RadioForm
                radio_props={incidentOptions}
                initial={null}
                onPress={(value) => setSelectedIncident(value)}
                buttonColor={"#00f4f5"}
                selectedButtonColor={colors.BUTTON_ORANGE}
                labelStyle={{ fontSize: 16, color: colorScheme === 'dark' ? '#FFF' : '#000' }}
                radioStyle={{ marginBottom: 15 }}
              />
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    { backgroundColor: "#00f4f5", marginHorizontal: 10 },
                  ]}
                  onPress={handleReportIncident}
                >
                  <Text style={styles.modalConfirmButtonText}>Reportar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalCancelButton,
                    { backgroundColor: "#333", marginHorizontal: 10 },
                  ]}
                  onPress={() => setIsIncidentModalVisible(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
    </View>
  );
};
const lightStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  tabsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#FFF",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  tab: {
    paddingVertical: 10,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#00f4f5",
  },
  tabText: {
    fontSize: 16,
    color: "#00f4f5",
  },

  activeTabText: {
    fontWeight: "bold",
  },
  scrollContainer: {
    padding: 10,
  },
  bookingContainer: {
    backgroundColor: "#FFF",
    padding: 15,
    margin: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  reportText: {
    fontSize: 14,
    color: "#00f4f5", // Color rojo para resaltar
    textAlign: "right",
    marginTop: 10,
  },
  header: {
    flexDirection: "column",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  location: {
    fontSize: 16,
    fontWeight: "bold",
  },
  time: {
    fontSize: 14,
    color: "gray",
  },
  driverInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  driverImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 10,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00f4f5",
  },
  finalCost: {
    fontSize: 16,
    fontWeight: "bold",
    color: "black",
  },
  arrivalTime: {
    fontSize: 16,
    fontWeight: "bold",
    color: "black",
  },
  loadMoreButton: {
    padding: 15,
    backgroundColor: "#00f4f5",
    marginHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    marginVertical: 10,
  },
  loadMoreText: {
    color: "#FFF",
    fontWeight: "bold",
  },
  message: {
    fontSize: 18,
    color: "gray",
    textAlign: "center",
    marginTop: 20,
  },

  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },

  textStyle: {
    color: '#000',
    fontWeight: "bold",
    textAlign: "center",
  },
  modalText: {
    marginBottom: 15,
    textAlign: "center",
  },

  load: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255)",
    height: "100%",
  },

  BookingContainer: {
    margin: 10,
    borderRadius: 10,
    shadowColor: "black",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.23,
    shadowRadius: 1,
  },
  box: {
    backgroundColor: colors.WHITE,
    borderRadius: 10,
  },
  elevation: {
    elevation: 5,
  },
  dateStyle: {
    color: colors.HEADER,
    fontSize: 18,
  },
  textView3: {
    flex: 1,
    backgroundColor: MAIN_COLOR,
  },
  segmentcontrol: {
    color: colors.WHITE,
    fontSize: 18,

    marginTop: 0,
    alignSelf: "center",
    height: 50,
  },

  hbox2: {
    width: 1,
    backgroundColor: MAIN_COLOR,
  },

  textStyleBold: {
    fontSize: 16,
    
  },

  details: {
    flex: 1,
    justifyContent: "space-around",
    alignItems: "center",
    borderBottomWidth: 0.6,
    borderBottomColor: MAIN_COLOR,
  },
  clock: {
    flex: 1,
    justifyContent: "space-around",
    alignItems: "center",
    minHeight: 60,
  },
  section: {
    flex: 1,
    justifyContent: "space-evenly",
    alignItems: "center",
  },
  driverDetails: {
    flex: 1,
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 10,
  },
  modalBtn: {
    flexDirection: "row",
    alignSelf: "center",
    borderWidth: 1,
    minWidth: 80,
    padding: 5,
    justifyContent: "center",
    borderRadius: 10,
  },
  listView: {
    flex: 1,
    backgroundColor: colors.WHITE,
    width: "100%",
    borderTopRightRadius: 10,
    borderTopLeftRadius: 10,
  },
  emptyListContainer: {
    width: width,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyBox: {
    backgroundColor: MAIN_COLOR,
    borderRadius: 10,
  },
  emptyText: {
    color: colors.WHITE,
    padding: 15,
    fontSize: 18,
  },
  textContent1: {},

  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: "90%",
    maxHeight: "90%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  map: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
  },
  detailsContainer: {
    width: "100%",
  },
  detailText: {
    fontSize: 14,
    marginBottom: 10,
  },
  detailLabel: {
    fontWeight: "bold",
  },
  

  driverContact: {
    fontSize: 14,
    color: "gray",
  },
  buttonClose: {
    marginTop: 20,
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    padding: 10,
    elevation: 2,
  },
  modalCenteredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    width: "120%",
  },
  modalConfirmButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalCancelButton: {
    backgroundColor: "#E91E63",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },

});
const darkStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#474747",
  },
  tabsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#474747",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  tab: {
    paddingVertical: 10,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#00f4f5",
  },
  tabText: {
    fontSize: 16,
    color: "#00f4f5",
  },

  activeTabText: {
    fontWeight: "bold",
  },
  scrollContainer: {
    padding: 10,
  },
  bookingContainer: {
    backgroundColor: "#FFF",
    padding: 15,
    margin: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: "column",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  location: {
    fontSize: 16,
    fontWeight: "bold",
  },
  time: {
    fontSize: 14,
    color: "gray",
  },
  driverInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  driverImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 10,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00f4f5",
  },
  finalCost: {
    fontSize: 16,
    fontWeight: "bold",
    color: "black",
  },
  arrivalTime: {
    fontSize: 16,
    fontWeight: "bold",
    color: "black",
  },
  loadMoreButton: {
    padding: 15,
    backgroundColor: "#00f4f5",
    marginHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    marginVertical: 10,
  },
  loadMoreText: {
    color: "#FFF",
    fontWeight: "bold",
  },
  message: {
    fontSize: 18,
    color: "gray",
    textAlign: "center",
    marginTop: 20,
  },

  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },

  textStyle: {
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
  },
  modalText: {
    marginBottom: 15,
    textAlign: "center",
    color:'#fff'
  },

  load: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255)",
    height: "100%",
  },

  BookingContainer: {
    margin: 10,
    borderRadius: 10,
    shadowColor: "black",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.23,
    shadowRadius: 1,
  },
  box: {
    backgroundColor: '#2E2E2E',
    borderRadius: 10,
  },
  elevation: {
    elevation: 5,
  },
  dateStyle: {
    color: colors.HEADER,
    fontSize: 18,
  },
  textView3: {
    flex: 1,
    backgroundColor: MAIN_COLOR,
  },
  segmentcontrol: {
    color: colors.WHITE,
    fontSize: 18,

    marginTop: 0,
    alignSelf: "center",
    height: 50,
  },

  hbox2: {
    width: 10,
    backgroundColor: '#fff',
  },

  textStyleBold: {
    fontSize: 16,
    color: "#fff",
  },

  details: {
    flex: 1,
    justifyContent: "space-around",
    alignItems: "center",
    borderBottomWidth: 0.6,
    borderBottomColor: MAIN_COLOR,
  },
  clock: {
    flex: 1,
    justifyContent: "space-around",
    alignItems: "center",
    minHeight: 60,
  },
  section: {
    flex: 1,
    justifyContent: "space-evenly",
    alignItems: "center",
  },
  driverDetails: {
    flex: 1,
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 10,
  },
  modalBtn: {
    flexDirection: "row",
    alignSelf: "center",
    borderWidth: 1,
    minWidth: 80,
    padding: 5,
    justifyContent: "center",
    borderRadius: 10,
  },
  listView: {
    flex: 1,
    backgroundColor: colors.WHITE,
    width: "100%",
    borderTopRightRadius: 10,
    borderTopLeftRadius: 10,
  },
  emptyListContainer: {
    width: width,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyBox: {
    backgroundColor: MAIN_COLOR,
    borderRadius: 10,
  },
  emptyText: {
    color: colors.WHITE,
    padding: 15,
    fontSize: 18,
  },
  textContent1: {},

  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalView: {
    margin: 20,
    backgroundColor: "#474747",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: "90%",
    maxHeight: "90%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
    color:'#fff'
  },
  map: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
  },
  detailsContainer: {
    width: "100%",
  },
  detailText: {
    fontSize: 14,
    marginBottom: 10,
    color:'#fff'
  },
  detailLabel: {
    fontWeight: "bold",
    color:'#fff'
  },


  driverContact: {
    fontSize: 14,
    color: "gray",
  },
  buttonClose: {
    marginTop: 20,
    backgroundColor: "#00f4f5",
    borderRadius: 10,
    padding: 10,
    elevation: 2,
  },
  reportText: {
    fontSize: 14,
    color: "#00f4f5", // Color rojo para resaltar
    textAlign: "right",
    marginTop: 10,
  },
  modalCenteredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    width: "120%",
  },
  modalConfirmButton: {
    backgroundColor: "#00f4f5",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalCancelButton: {
    backgroundColor: "#E91E63",
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    elevation: 2,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});




export default ActiveBookingScreen;

