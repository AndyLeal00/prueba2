import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import supabase from "@/config/SupabaseConfig";
import { FareCalculator } from "@/common/actions/FareCalculator";
import { DEFAULT_UMBRAL_INTERMUNICIPAL_KM } from "@/constants/fare";

const roundPrice = (price) => {
  const remainder = price % 100;
  if (remainder > 0 && remainder <= 50) {
    return price - remainder + 50;
  } else if (remainder > 50) {
    return price - remainder + 100;
  }
  return price;
};

const CarDetails = ({ visible, onSelectVehicle, distance, duration, tolls, isScheduled, isAirport = false }) => {
  const [taxiOptions, setTaxiOptions] = useState([]);
  const [selectedTaxi, setSelectedTaxi] = useState("Large Taxi");
  
  useEffect(() => {
    if (visible) {
      fetchTaxiOptionsFromFirebase();
    }
  }, [visible]);

  const fetchTaxiOptionsFromFirebase = async () => {
    try {
      const { data: carTypes, error } = await supabase
        .from('car_types')
        .select('*')
        .eq('is_active', true);

      if (!error && carTypes?.length) {
        const options = carTypes.map((ct: any) => {
  const vehicle = {
    value: ct.id,
    name: ct.name,
    capacity: ct.capacity || 0,
    service: ct.description || '',
    carImage: ct.image || '',
    base_fare: parseFloat(ct.base_price) || 0,
    base_fare_inter: parseFloat(ct.base_price_inter) || 0,
    rate_per_unit_distance: parseFloat(ct.price_per_km) || 0,
    rate_per_unit_distance_inter: parseFloat(ct.price_per_km_inter) || 0,
    rate_per_hour: parseFloat(ct.rate_per_hour) || 0,
    rate_per_hour_inter: parseFloat(ct.rate_per_hour_inter) || 0,
    valor_hora: parseFloat(ct.valor_hora) || 0,
    min_fare: parseFloat(ct.min_fare) || 0,
    min_fare_inter: parseFloat(ct.min_fare_inter) || 0,
    delta_aeropuerto: parseFloat(ct.delta_aeropuerto) || 0,
    delta_aeropuerto_prog: parseFloat(ct.delta_aeropuerto_prog) || 0,
    convenience_fees: parseFloat(ct.convenience_fee) || 0,
    convenience_fee_type: ct.convenience_fee_type || 'flat',
    umbral_intermunicipal_km: parseFloat(ct.umbral_intermunicipal_km) || 29,
  };

  const distKm  = parseFloat(distance) / 1000;
  const durMin  = parseFloat(duration) / 60;
  const isIntermunicipal = distKm > (vehicle.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);

  const { totalCost, clientTotal } = FareCalculator(
    distKm,
    durMin * 60,
    vehicle,
    null,
    2,
    { isScheduled, isIntermunicipal, isAirport }
  );

  return {
    ...vehicle,
    estimatedPrice: totalCost,
    estimatedPriceMax: clientTotal,
  };
});


        setTaxiOptions(options);
        if (options.length > 0) setSelectedTaxi(options[0].value);
      }
    } catch (error) {
      console.error("Error obteniendo datos:", error);
    }
  };

  const getPrice = (bookingData, tolls, isScheduled) => {
    const { roundedDistance, durationMinutes, carType } = bookingData;

    if (!carType) {
      console.error("carType is undefined");
      return null;
    }

    const tollsCost = tolls.reduce((acc, toll) => acc + toll.PriceToll, 0);
    const isIntermunicipal = roundedDistance > (carType.umbral_intermunicipal_km || DEFAULT_UMBRAL_INTERMUNICIPAL_KM);

    let { totalCost, grandTotal, clientTotal, convenience_fees } = FareCalculator(
      roundedDistance,
      durationMinutes * 60,
      carType,
      {},
      2,
      { isScheduled, isIntermunicipal, tollsTotal: tollsCost, isAirport }
    );

    if (isNaN(totalCost) || isNaN(grandTotal) || isNaN(convenience_fees)) {
      console.error("Calculation resulted in NaN values:", {
        totalCost,
        grandTotal,
        convenience_fees,
      });
      return null;
    }

    return {
      totalCost,
      estimateFare: grandTotal,
      clientFare: clientTotal,
      estimateTime: durationMinutes,
      convenienceFees: convenience_fees,
      driverShare: totalCost,
      tollsCost,
    };
  };

  const handleTaxiOptionPress = (vehicle) => {
    onSelectVehicle(vehicle); // Pass back the selected vehicle
    setSelectedTaxi(vehicle.value);
  };

  const renderTaxiOptions = () => {
    
    return taxiOptions.map((option) => (
      <TouchableOpacity
        key={option.value}
        style={[
          styles.taxiOption,
          selectedTaxi === option.value && styles.selectedTaxiOption,
        ]}
        onPress={() => handleTaxiOptionPress(option)}
      >
        <Image
          source={
            option.carImage
              ? { uri: option.carImage }
              : require("./../assets/images/microBlackCar.png")
          }
          style={styles.taxiIcon}
        />
        <View style={styles.optionDetails}>
          <Text style={styles.taxiType}>{option.name}</Text>
          <Text style={[styles.taxiInfo, { color: "#E91E63" }]}>
            Servicio {option.capacity}
          </Text>
          <Text style={styles.taxiPrice}>
            Valor estimado: ${Number(option.estimatedPrice || 0).toLocaleString('es-CO')} - $
            {Number(option.estimatedPriceMax || option.estimatedPrice || 0).toLocaleString('es-CO')}
          </Text>
        </View>
      </TouchableOpacity>
    ));
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {renderTaxiOptions()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  container: {
    maxHeight: "50%",
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  selectedTaxiOption: {
    borderColor: "#00f4f5",
    borderWidth: 2,
    shadowColor: "#00f4f5",
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  taxiIcon: {
    height: 88,
    width: 88,
    resizeMode: "contain",
    marginRight: 10,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    padding: 5,
  },
  taxiOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginBottom: 10,
    height: 100,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  taxiPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  taxiInfo: {
    fontSize: 14,
    color: "#777",
    fontWeight: "bold",
    marginVertical: 5,
  },
  taxiType: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  optionDetails: {
    flex: 1,
    justifyContent: "center",
  },
});

export default CarDetails;

