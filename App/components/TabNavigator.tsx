import React, { useMemo } from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import HomeScreen from "@/app/(tabs)/index";
import ProfileScreen from "@/app/(tabs)/ProfileScreen";
import WalletScreen from "@/app/(tabs)/WalletDetails";
import SearchScreen from "@/app/(tabs)/SearchScreen";
import CustomerMap from "@/app/(tabs)/CustomerMap";
import TripPreviewScreen from "@/app/(tabs)/TripPreviewScreen";
import CustomerHomeScreen from "@/app/(tabs)/CustomerHomeScreen";
import ReservationsScreen from "@/app/(tabs)/ReservationsScreen";
import DriverActivityScreen from "@/app/(tabs)/DriverActivityScreen";
import CarsScreen from "@/app/Vehicle/carScreen";
import { useSelector } from "react-redux";
import { RootState } from "@/common/store";
import { Platform, StyleSheet, View, ActivityIndicator } from "react-native";
import CustomerBottomNav from "@/components/CustomerBottomNav";
import DriverBottomNav from "@/components/DriverBottomNav";
import ActiveTripFloatingBanner from "@/components/ActiveTripFloatingBanner";

const CustomerTabs = createMaterialTopTabNavigator();
const DriverTabs = createMaterialTopTabNavigator();
const Stack = createNativeStackNavigator();

const CustomerHomeStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === "android" ? "none" : "default",
      }}
      initialRouteName="CustomerHome"
    >
      <Stack.Screen name="CustomerHome" component={CustomerHomeScreen} />
      <Stack.Screen name="CustomerMap" component={CustomerMap} />
      <Stack.Screen name="TripPreviewScreen" component={TripPreviewScreen} />
    </Stack.Navigator>
  );
};

/**
 * Customer root: swipeable tabs + one persistent bottom bar.
 * Order: Home ↔ Historial ↔ Lugares ↔ Profile
 * "Viajar" opens CreateReservation (action, not a tab page).
 */
const CustomerTabNavigator: React.FC = () => {
  // TabNavigator se monta como screen "HomeScreen" del stack raíz →
  // este navigation puede abrir ReservationTrip / CustomerActiveTrip.
  const stackNavigation = useNavigation<any>();

  return (
    <View style={styles.customerRoot}>
      <CustomerTabs.Navigator
        initialRouteName="Home"
        tabBarPosition="bottom"
        tabBar={(props) => (
          <View style={styles.floatingTabBar} pointerEvents="box-none">
            <ActiveTripFloatingBanner stackNavigation={stackNavigation} />
            <CustomerBottomNav {...props} />
          </View>
        )}
        screenOptions={{
          swipeEnabled: true,
          lazy: true,
        }}
      >
        <CustomerTabs.Screen name="Home" component={CustomerHomeStack} options={{ title: "Inicio" }} />
        <CustomerTabs.Screen name="Historial" component={ReservationsScreen} options={{ title: "Historial" }} />
        <CustomerTabs.Screen name="Lugares" component={SearchScreen} options={{ title: "Lugares" }} />
        <CustomerTabs.Screen name="Profile" component={ProfileScreen} options={{ title: "Perfil" }} />
      </CustomerTabs.Navigator>
    </View>
  );
};

/**
 * Driver root: swipeable tabs + one persistent bottom bar.
 * Order: Vehículo ↔ Billetera ↔ GO ↔ Historial ↔ Perfil
 */
const DriverTabNavigator: React.FC = () => {
  const stackNavigation = useNavigation<any>();

  return (
    <View style={styles.driverRoot}>
      <DriverTabs.Navigator
        initialRouteName="Map"
        tabBarPosition="bottom"
        tabBar={(props) => (
          <View style={styles.floatingTabBar} pointerEvents="box-none">
            <ActiveTripFloatingBanner stackNavigation={stackNavigation} />
            <DriverBottomNav {...props} />
          </View>
        )}
        screenOptions={{
          swipeEnabled: true,
          lazy: true,
        }}
      >
        <DriverTabs.Screen name="Cars" component={CarsScreen} options={{ title: "Vehículo" }} />
        <DriverTabs.Screen name="Wallet" component={WalletScreen} options={{ title: "Billetera" }} />
        <DriverTabs.Screen name="Map" component={HomeScreen} options={{ title: "GO", lazy: false }} />
        <DriverTabs.Screen name="Historial" component={DriverActivityScreen} options={{ title: "Historial" }} />
        <DriverTabs.Screen name="Profile" component={ProfileScreen} options={{ title: "Perfil" }} />
      </DriverTabs.Navigator>
    </View>
  );
};

const TabNavigator: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const profile = useSelector((state: RootState) => state.auth.profile);
  const currentUserTypeRaw =
    profile?.user_type ||
    (user as any)?.usertype ||
    (user as any)?.user_type ||
    (user as any)?.userType ||
    (user as any)?.user_metadata?.usertype ||
    (user as any)?.user_metadata?.user_type ||
    (user as any)?.user_metadata?.userType ||
    null;

  const currentUserType = useMemo(() => {
    const normalized = String(currentUserTypeRaw || "").trim().toLowerCase();
    if (normalized === "driver" || normalized === "customer" || normalized === "company") {
      return normalized;
    }
    return null;
  }, [currentUserTypeRaw]);

  if (!currentUserType) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#00f4f5" />
      </View>
    );
  }

  if (currentUserType === "customer") {
    return <CustomerTabNavigator />;
  }

  return <DriverTabNavigator />;
};

const styles = StyleSheet.create({
  customerRoot: {
    flex: 1,
    backgroundColor: "#051A26",
  },
  driverRoot: {
    flex: 1,
    backgroundColor: "#051A26",
  },
  floatingTabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#041B2D",
  },
});

export default TabNavigator;
