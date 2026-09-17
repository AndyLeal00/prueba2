import { bookingV2LegacyPost } from '@/config/SupabaseConfig';
import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import supabase from "../../config/SupabaseConfig";
import axios from "axios";
import * as Location from "expo-location";
// Firebase removido - toda la lógica de bookings migrada a Supabase

const insertTrackingPoint = async (
  bookingId: string,
  driverId: string | undefined,
  driverLocation: { lat: number; lng: number },
  status?: string,
) => {
  console.log('[tracking] insert', { bookingId, driverId, status, driverLocation });
  const { error } = await supabase.from('booking_tracking_v2' as any).insert({
    booking_id: bookingId,
    driver_id: driverId || null,
    lat: driverLocation.lat,
    lng: driverLocation.lng,
  } as any);
  if (error) {
    console.error('[tracking] insert FAILED', { status, code: error.code, message: error.message, details: (error as any).details });
  } else {
    console.log('[tracking] insert ok', { bookingId, status });
  }
};
//import { Audio } from "expo-av";
import { AppDispatch, RootState } from "./store";
import { addActualsToBooking } from "../other/sharedFunctions";

// ─── Helpers Supabase ───────────────────────────────────────────────────────

/** Convierte una fila de Supabase bookings al formato que usa Redux (compatible con legacy). */
export const mapSupabaseBooking = (row: any) => ({
  id: row.id,
  status: row.status,
  customer: row.customer,
  customer_name: row.customer_name,
  customer_contact: row.customer_contact,
  customer_city: row.customer_city,
  customer_token: row.customer_token,
  customer_status: row.customer_status,
  driver: row.driver,
  driver_name: row.driver_name,
  driver_contact: row.driver_contact,
  driver_token: row.driver_token,
  driver_status: row.driver_status,
  driver_image: row.driver_image,
  driver_arrived_time: row.driver_arrived_time,
  pickup: { lat: row.pickup_lat, lng: row.pickup_lng, add: row.pickup_address },
  drop: { lat: row.drop_lat, lng: row.drop_lng, add: row.drop_address },
  pickupAddress: row.pickup_address,
  dropAddress: row.drop_address,
  carType: row.car_type,
  car_image: row.car_image,
  vehicle_number: row.vehicle_number,
  vehicleNumber: row.vehicle_number,
  vehicleModel: row.car_model,
  vehicleColor: row.vehicle_color,
  vehicleMake: row.vehicle_make,
  plate_number: row.plate_number,
  estimate: row.estimate,
  trip_cost: row.trip_cost,
  convenience_fees: row.convenience_fees,
  discount: row.discount,
  driver_share: row.driver_share,
  payment_mode: row.payment_mode,
  reference: row.reference,
  distance: row.distance,
  estimateTime: row.duration,
  tripType: row.trip_type,
  tripUrban: row.trip_urban,
  otp: row.otp,
  coords: row.coords,
  startTime: row.trip_start_time,
  endTime: row.trip_end_time,
  total_trip_time: row.total_trip_time,
  observations: row.observations,
  requestedDrivers: row.requested_drivers || {},
  driverEstimates: row.driver_estimates || {},
  booking_date: row.booking_date,
  created_at: row.created_at,
});

/** Actualiza un booking en Supabase a partir del objeto Redux. */
const updateBookingInSupabase = async (booking: any) => {
  const payload: any = {
    status: booking.status,
    driver_status: booking.driver_status ?? null,
    customer_status: booking.customer_status ?? null,
  };
  if (booking.driver !== undefined)            payload.driver = booking.driver;
  if (booking.trip_cost !== undefined)         payload.trip_cost = booking.trip_cost;
  if (booking.driver_share !== undefined)      payload.driver_share = booking.driver_share;
  if (booking.convenience_fees !== undefined)  payload.convenience_fees = booking.convenience_fees;
  if (booking.trip_start_time)                 payload.trip_start_time = booking.trip_start_time;
  if (booking.trip_end_time)                   payload.trip_end_time = booking.trip_end_time;
  if (booking.total_trip_time !== undefined)   payload.total_trip_time = booking.total_trip_time;
  if (booking.drop?.lat)                       payload.drop_lat = booking.drop.lat;
  if (booking.drop?.lng)                       payload.drop_lng = booking.drop.lng;
  if (booking.drop?.add)                       payload.drop_address = booking.drop.add;
  if (booking.reason)                          payload.reason = booking.reason;
  if (booking.coords)                          payload.coords = booking.coords;
  if (booking.distance !== undefined)          payload.distance = booking.distance;
  if (booking.driver_arrived_time)             payload.driver_arrived_time = booking.driver_arrived_time;

  const { error } = await supabase.from('bookings_v2_mobile' as any).update(payload).eq('id', booking.id);
  if (error) throw new Error(error.message);
  return booking;
};

interface Booking {
  id: string;
  uid_customer: string;
  status: string;
  [key: string]: any;
}

interface BookingsState {
  bookings: Booking[];
  recentDrivers: any[];
  newBooking: Booking | null;
  modalOpen: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: BookingsState = {
  bookings: [],
  recentDrivers: [],
  newBooking: null,
  modalOpen: false,
  loading: false,
  error: null,
};


const bookingsSlice = createSlice({
  name: "bookings",
  initialState,
  reducers: {
    fetchBookingsStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchBookingsSuccess(state, action: PayloadAction<Booking[]>) {
      state.loading = false;
      const newBookings = action.payload.filter(
        (newBooking) =>
          !state.bookings.some(
            (existingBooking) => existingBooking.id === newBooking.id
          )
      );
      state.bookings = [...state.bookings, ...newBookings];
    },
    fetchBookingsFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    updateBookingStart(state) {
      state.loading = true;
      state.error = null;
    },
    updateBookingSuccess(state, action: PayloadAction<Booking>) {
      state.loading = false;
      const index = state.bookings.findIndex(
        (booking) => booking.id === action.payload.id
      );
      if (index !== -1) {
        state.bookings[index] = action.payload;
      }
    },
    updateBookingFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    setNewBooking(state, action: PayloadAction<Booking | null>) {
      state.newBooking = action.payload;
      state.modalOpen = !!action.payload;
    },
    closeModal(state) {
      state.modalOpen = false;
    },
    removeBooking(state, action: PayloadAction<string>) {
      state.bookings = state.bookings.filter(
        (booking) => booking.id !== action.payload
      );
    },
  },
  extraReducers: (builder) => {
    // Aquí manejamos la acción fetchRecentDrivers
    builder
      .addCase(fetchRecentDrivers.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchRecentDrivers.fulfilled, (state, action) => {
        state.recentDrivers = action.payload; // Guardamos los conductores en el estado
        state.loading = false;
        state.error = null;
      })
      .addCase(fetchRecentDrivers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  fetchBookingsStart,
  fetchBookingsSuccess,
  fetchBookingsFailure,
  updateBookingStart,
  updateBookingSuccess,
  updateBookingFailure,
  setNewBooking,
  closeModal,
  removeBooking,
} = bookingsSlice.actions;


export const updateBookingAsync =
  (booking: Booking) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(updateBookingStart());

    try {
      const state = getState();

      await updateBookingInSupabase(booking);
      dispatch(updateBookingSuccess(booking));

      if (booking.status === "STARTED") {
        const dt = new Date();
        booking.trip_start_time = `${dt.getHours()}:${dt.getMinutes()}:${dt.getSeconds()}`;
        booking.startTime = dt.getTime();
        await updateBookingInSupabase(booking);
      }

      if (booking.status === "REACHED") {
        await updateBookingInSupabase(booking);
      }

      if (booking.status === "PAID") {
        await updateBookingInSupabase(booking);
      }

      if (booking.status === "COMPLETE") {
        await updateBookingInSupabase(booking);

        if (booking.rating) {
          // Guardar rating del conductor en Supabase
          await supabase.from('bookings_v2_mobile' as any).update({ rating: booking.rating } as any).eq('id', booking.id);
          // Actualizar rating promedio del conductor en users
          const { data: pastBookings } = await supabase
            .from('bookings_v2_mobile' as any)
            .select('rating')
            .eq('driver', booking.driver)
            .not('rating', 'is', null);
          if (pastBookings?.length) {
            const avg = (pastBookings.reduce((s: number, b: any) => s + (b.rating || 0), 0) / pastBookings.length).toFixed(1);
            await supabase.from('users').update({ rating: avg } as any).eq('id', booking.driver);
          }
        }
      }
    } catch (error) {
      console.error("Error updating booking:", error);
      dispatch(
        updateBookingFailure(
          error instanceof Error ? error.message : "Unknown error"
        )
      );
    }
  };

  export const listenForNewBookings =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const handleNewBooking = async (row: any) => {
      const state = getState();
      const driverActiveStatus = state.auth.user?.driverActiveStatus;
      const driverCity = state.auth.user?.city;

      if (!driverActiveStatus) return;

      const booking = mapSupabaseBooking(row);
      if (
        booking.customer_city &&
        driverCity &&
        booking.customer_city.toLowerCase() !== driverCity.toLowerCase()
      ) return;

      dispatch(fetchBookingsSuccess([booking]));
      dispatch(setNewBooking(booking));

      const token = state.auth.user?.pushToken;
      if (token) {
        try {
          await bookingV2LegacyPost(
            'https://us-central1-treasupdate.cloudfunctions.net/sendNotification',
            { token, title: 'Nueva Reserva', body: 'Tienes una nueva reserva' }
          );
        } catch {}
      }
    };

    // Carga inicial: reservas NEW existentes
    supabase
      .from('bookings_v2_mobile' as any)
      .select('*')
      .eq('status', 'NEW')
      .then(({ data }) => {
        if (!data?.length) {
          dispatch(fetchBookingsSuccess([]));
          dispatch(setNewBooking(null));
          return;
        }
        const state = getState();
        const driverCity = state.auth.user?.city;
        const filtered = data
          .map(mapSupabaseBooking)
          .filter((b: any) =>
            !driverCity || !b.customer_city ||
            b.customer_city.toLowerCase() === driverCity.toLowerCase()
          );
        if (filtered.length) {
          dispatch(fetchBookingsSuccess(filtered));
          dispatch(setNewBooking(filtered[0]));
        }
      });

    // Limpia cualquier canal previo con el mismo nombre para evitar
    // "cannot add `postgres_changes` callbacks ... after `subscribe()`"
    // cuando el efecto se re-ejecuta (HMR, doble montaje, etc.).
    try {
      const existing = (supabase.getChannels?.() ?? []).filter(
        (c: any) => c.topic === 'realtime:new-bookings-realtime'
      );
      existing.forEach((c: any) => supabase.removeChannel(c));
    } catch {}

    // Escucha en tiempo real con Supabase Realtime
    const channel = supabase
      .channel('new-bookings-realtime')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'bookings', filter: 'status=eq.NEW' },
        (payload: any) => handleNewBooking(payload.new)
      )
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: 'status=eq.NEW' },
        (payload: any) => handleNewBooking(payload.new)
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR') {
          dispatch(fetchBookingsFailure('Error en canal Supabase Realtime'));
        }
      });

    // Retorna función para desuscribirse
    return () => { supabase.removeChannel(channel); };
  };


  
export const acceptBooking = createAsyncThunk(
  "bookings/acceptBooking",
  async (
    { booking, driverProfile }: { booking: any; driverProfile: any },
    { rejectWithValue }
  ) => {
    try {
      // Asegúrate de que cada campo tenga un valor predeterminado de cadena vacía si es undefined
      const updatedBooking = {
        ...booking,
        driver: driverProfile.uid || driverProfile.id || "",
        driver_image: driverProfile.profile_image || "",
        car_image: driverProfile.car_image || "",
        driver_name: `${driverProfile.firstName || ""} ${
          driverProfile.lastName || ""
        }`,
        driver_contact: driverProfile.mobile || "",
        driver_token: driverProfile.pushToken || "",
        vehicle_number: driverProfile.vehicleNumber || "",
        vehicleModel: driverProfile.vehicleModel || "",
        vehicleMake: driverProfile.vehicleMake || "",
        vehicleColor: driverProfile.vehicleColor || "",
        driverRating: driverProfile.rating || "0",
        status: "ACCEPTED",
        driver_status: `${driverProfile.uid || driverProfile.id || ""}_ACCEPTED`, // Concatenación del driver con el estado
        customer_status: `${booking.customer || ""}_ACCEPTED`,
        drver_city: driverProfile.city || ''
      };

      // Sincroniza con Supabase los datos del conductor y vehículo
      // Usar null (no '') en campos vacíos para que COALESCE del trigger funcione
      const rawPhone = driverProfile.mobile || driverProfile.phone || driverProfile.phoneNumber || '';
      const mobileRaw = rawPhone.replace(/^\+57/, '');
      await supabase
        .from('bookings_v2_mobile' as any)
        .update({
          driver: driverProfile.uid || driverProfile.id || '',
          status: 'ACCEPTED',
          driver_name: `${driverProfile.firstName || ''} ${driverProfile.lastName || ''}`.trim() || null,
          driver_contact: mobileRaw || null,
          driver_image: driverProfile.profile_image || null,
          car_image: driverProfile.car_image || null,
          vehicle_number: driverProfile.vehicleNumber || null,
          plate_number: driverProfile.vehicleNumber || null,
          vehicle_make: driverProfile.vehicleMake || null,
          vehicle_model: driverProfile.vehicleModel || null,
          vehicle_color: driverProfile.vehicleColor || null,
          car_model: driverProfile.vehicleModel || null,
          car_type: driverProfile.carType || null,
        } as any)
        .eq('id', booking.id);

      // Verificar que la actualización se realizó en Supabase
      const { data: verifyData } = await supabase
        .from('bookings_v2_mobile' as any)
        .select('driver')
        .eq('id', booking.id)
        .single();
      if (verifyData && verifyData.driver !== (driverProfile.uid || driverProfile.id)) {
        throw new Error('La actualización del conductor en la reserva no se completó correctamente.');
      }

      // Captura la ubicación del conductor desde el perfil del conductor
      const driverLocation = driverProfile.location || { lat: 0, lng: 0 };

      await insertTrackingPoint(booking.id, driverProfile?.id, driverLocation, 'ACCEPTED');

      return updatedBooking;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateLocation = createAsyncThunk(
  "bookings/updateLocation",
  async (
    { booking, driverProfile }: { booking: any; driverProfile: any },
    { rejectWithValue }
  ) => {
    try {
      const validStatuses = ["ACCEPTED", "ARRIVED", "STARTED"];
      if (!validStatuses.includes(booking.status)) {
        return booking;
      }

      // Read live GPS directly — Redux user.location is unreliable (the
      // UPDATE_USER_LOCATION action dispatched from _layout.tsx is not handled
      // by the auth slice, so driverProfile.location is usually undefined).
      let driverLocation: { lat: number; lng: number } | null = null;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          driverLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch (e: any) {
        console.warn('updateLocation: getCurrentPositionAsync failed', e?.message || e);
      }

      // Fallback to whatever Redux has, in case GPS read fails
      if (!driverLocation) {
        const fallback = driverProfile?.location;
        if (fallback && typeof fallback.lat === 'number' && typeof fallback.lng === 'number') {
          driverLocation = { lat: fallback.lat, lng: fallback.lng };
        }
      }

      if (!driverLocation) {
        console.warn('updateLocation: no location available (GPS denied and Redux empty)');
        return booking;
      }

      await insertTrackingPoint(booking.id, driverProfile?.id, driverLocation, booking.status);
      return booking;
    } catch (error: any) {
      console.error("Error in updateLocation:", error?.message || error);
      return rejectWithValue(error?.message || 'updateLocation failed');
    }
  }
);

const updateBookingStatus = async (booking: Booking) => {
  return updateBookingInSupabase(booking);
};

// ✅ Función removida - ahora usar insertTrackingPoint para todas las actualizaciones
// Firebase ha sido completamente migrado a Supabase

const sendNotification = async (notificationData: any) => {
  try {
    await bookingV2LegacyPost(
      "https://us-central1-treasupdate.cloudfunctions.net/sendNotification",
      notificationData
    );
  } catch (error) {
    console.error("Error enviando la notificación:", error);
  }
};

export const cancelBooking = createAsyncThunk(
  "bookings/cancelBooking",
  async (
    {
      booking,
      reason,
      cancelledBy,
    }: { booking: Booking; reason: string; cancelledBy: string },
    { rejectWithValue }
  ) => {
    try {
      const currentTime = new Date();

      // Verificar que el id de la reserva esté presente
      if (!booking.id) {
        throw new Error("La reserva no tiene un ID válido.");
      }

      const updatedBooking = {
        ...booking,
        status: "CANCELLED",
        reason,
        cancelledBy,
        cancellation_time: currentTime.toLocaleTimeString(),
        cancelledAt: currentTime.getTime(),
        driver_status: `${booking.driver || ""}_CANCELLED`,
        customer_status: `${booking.customer || ""}_CANCELLED`,
      };

      await updateBookingInSupabase(updatedBooking);
      return updatedBooking;
    } catch (error: any) {
      return rejectWithValue(error.message || "Error al cancelar la reserva.");
    }
  }
);

// Thunk para iniciar la reserva
export const startBooking = createAsyncThunk(
  "bookings/startBooking",
  async (
    { booking, driverProfile }: { booking: Booking; driverProfile: any },

    { rejectWithValue }
  ) => {
    try {
      const currentTime = new Date();
      //console.log("Driver Profile:", driverProfile);

      const updatedBooking = {
        ...booking,
        status: "STARTED",
        trip_start_time: currentTime.toLocaleTimeString(),
        startTime: currentTime.getTime(),
        driver_status: `${booking.driver || ""}_STARTED`, // Concatenación del driver con el estado
        customer_status: `${booking.customer || ""}_STARTED`,
      };

      const bookingResult = await updateBookingStatus(updatedBooking);
      // Tracking is now done via updateLocation thunk (every 15 seconds)
      await sendNotification(updatedBooking);

      return bookingResult;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const completeBooking = createAsyncThunk(
  "bookings/completeBooking",
  async (booking: Booking, { rejectWithValue }) => {
    try {
      const updatedBooking = {
        ...booking,
        status: "PAID",
      };

      const bookingResult = await updateBookingStatus(updatedBooking);

      return bookingResult;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const completePaymentBooking = createAsyncThunk(
  "bookings/completePaymentBooking",
  async (
    { booking, driverProfile }: { booking: Booking; driverProfile: any },
    { rejectWithValue }
  ) => {
    console.log(
      "Iniciando completePaymentBooking con estado de reserva:",
      booking
    );
    try {
      if (booking.status === "COMPLETE") {
        const updatedBooking = {
          ...booking,
          driver_status: `${booking.driver || ""}_COMPLETE`,
          customer_status: `${booking.customer || ""}_COMPLETE`,
        };
        await updateBookingInSupabase(updatedBooking);
        return updatedBooking;
      }

      if (booking.status === "REACHED") {
        const driverLocation = driverProfile.location || { lat: 0, lng: 0 };
        await insertTrackingPoint(booking.id, driverProfile?.id, driverLocation, 'COMPLETE');
        booking.status = "PAID";
        return await updateBookingStatus(booking);
      }

      if (booking.status === "PAID") {
        booking.status = "COMPLETE";
        booking.driver_status = `${booking.driver || ""}_COMPLETE`;
        booking.customer_status = `${booking.customer || ""}_COMPLETE`;
        await updateBookingInSupabase(booking);
        return booking;
      }

      throw new Error("Booking status is not REACHED or PAID");
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);



export const endBooking = createAsyncThunk(
  "bookings/endBooking",
  async (
    { booking, driverProfile }: { booking: Booking; driverProfile: any },
    { rejectWithValue }
  ) => {
    try {
      // Read live GPS directly — Redux user.location is unreliable (the
      // UPDATE_USER_LOCATION action dispatched from _layout.tsx is not handled
      // by the auth slice, so driverProfile.location is usually undefined).
      // Sin este fallback, endBooking lanzaba "Driver location data is missing"
      // y finalizarReserva caía al catch SIN navegar a la pantalla Payment,
      // por lo que el conductor nunca veía la confirmación de pago en efectivo.
      let driverLocation: { lat: number; lng: number } | null = null;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          driverLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch (e: any) {
        console.warn('endBooking: getCurrentPositionAsync failed', e?.message || e);
      }

      // Fallback a lo que tenga Redux, por si falla la lectura de GPS en vivo
      if (!driverLocation) {
        const fallback = driverProfile?.location;
        if (fallback && typeof fallback.lat === 'number' && typeof fallback.lng === 'number') {
          driverLocation = { lat: fallback.lat, lng: fallback.lng };
        }
      }

      if (!driverLocation || !driverLocation.lat || !driverLocation.lng) {
        throw new Error("Driver location data is missing");
      }

      // Llama a la función para obtener la dirección desde la latitud y longitud
     /* const address = await getAddressFromCoordinates(
        driverLocation.lat,
        driverLocation.lng
      );*/
      const address = booking.dropAddress;
      console.log("Address found:", address); // Verifica que obtienes la dirección

      if (booking.status === "STARTED") {
        await insertTrackingPoint(booking.id, driverProfile?.id, driverLocation, 'REACHED');

        const end_time = new Date();
        const diff =
          (end_time.getTime() - parseFloat(booking.startTime)) / 1000;
        const totalTimeTaken = Math.abs(Math.round(diff));
       
        let updatedBooking = {
          ...booking,
          status: "REACHED",
          trip_end_time: `${end_time.getHours()}:${end_time.getMinutes()}:${end_time.getSeconds()}`,
          endTime: end_time.getTime(),
          total_trip_time: totalTimeTaken,
          driver_status: `${booking.driver || ""}_REACHED`,
          customer_status: `${booking.customer || ""}_REACHED`,
          drop: {
            lat: driverLocation.lat,
            lng: driverLocation.lng,
            add: address, // Guarda la dirección obtenida
          },
        };

        // Llama a addActualsToBooking para realizar los cálculos y actualizar la reserva
        updatedBooking = await addActualsToBooking(
          updatedBooking,
          booking.dropAddress,
          {
            lat: booking.drop.lat,
            lng: booking.drop.lng,
          }
        ); 

        // Guardar dirección reciente en Supabase (tabla favorite_places como historial)
        try {
          await supabase.from('favorite_places' as any).upsert({
            user_id: booking.customer,
            name: booking.drop?.add || 'Destino reciente',
            description: booking.drop?.add || '',
            latitude: booking.drop?.lat || 0,
            longitude: booking.drop?.lng || 0,
            is_favorite: false,
          } as any);
        } catch (e) { /* no crítico */ }

        if (booking.customer_token) {
          await sendNotification({
            token: booking.customer_token,
            title: "T+plus",
            body: "PAGO PENDIENTE",
            params: { bookingId: booking.id },
          });
        }

        return updatedBooking;
      } else {
        throw new Error("El viaje no está en estado 'STARTED'.");
      }
    } catch (error: any) {
      console.error("Error in endBooking:", error.message || error);
      return rejectWithValue(error.message || "Error al finalizar la reserva");
    }
  }
);

export const arriveBooking = createAsyncThunk(
  "bookings/arriveBooking",
  async (booking: Booking, { rejectWithValue }) => {
    try {
      if (booking.status === "ACCEPTED") {
        // Verificar que `booking.drop` y sus campos lat/lng existan
        if (!booking.drop || !booking.drop.lat || !booking.drop.lng) {
          throw new Error("Información de ubicación incompleta en la reserva");
        }

        const arrived_time = new Date().toISOString(); // Convertir a formato ISO 8601

        const updatedBooking = {
          ...booking,
          status: "ARRIVED",
          driver_arrived_time: arrived_time, // Añadir el campo `driver_arrived_time`
          driver_status: `${booking.driver || ""}_ARRIVED`, // Concatenación del driver con el estado
          customer_status: `${booking.customer || ""}_ARRIVED`,
        };

        // Verificar si existe `booking.uid` o `booking.id` y lanzar un error si ninguno existe
        const bookingId = booking.uid || booking.id;
        if (!bookingId) {
          throw new Error("El ID de la reserva es indefinido");
        }

        await updateBookingInSupabase(updatedBooking);

        // Enviar notificación al cliente si el token está disponible
        if (booking.customer_token) {
          await sendNotification({
            token: booking.customer_token,
            title: "T+plus",
            body: "Tu conductor ha llegado",
            params: { bookingId: bookingId },
          });
        }

        return updatedBooking;
      } else {
        throw new Error("El viaje no está en estado 'ACCEPTED'.");
      }
    } catch (error: any) {
      return rejectWithValue(error.message || "Error al finalizar la reserva");
    }
  }
);

export const fetchRecentDrivers = createAsyncThunk(
  "bookings/fetchRecentDrivers",
  async (_, { rejectWithValue, getState }) => {
    try {
      const state = getState();
      const currentUser = state.auth.user;
      if (!currentUser || !currentUser.uid) {
        throw new Error("Usuario no autenticado o sin UID");
      }

      const { data: bookings, error } = await supabase
        .from('bookings_v2_mobile' as any)
        .select('driver, driver_name')
        .eq('customer', currentUser.uid || currentUser.id)
        .eq('status', 'COMPLETE')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error || !bookings?.length) throw new Error('No bookings found');

      const drivers = bookings
        .filter((b: any) => b.driver)
        .map((b: any) => ({ driver: b.driver, driver_name: b.driver_name }));

      //console.log("Filtered recent drivers:", drivers); // <-- Asegúrate de que esto esté funcionando
      return drivers; // Esto se devuelve al estado
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const shareDriverLocation = createAsyncThunk(
  "bookings/shareDriverLocation",
  async ({ bookingId }, { getState }) => {
    // Obtener reserva desde Supabase
    const { data: bookingData, error: bookingErr } = await supabase
      .from('bookings_v2_mobile' as any)
      .select('driver')
      .eq('id', bookingId)
      .single();
    if (bookingErr || !bookingData) throw new Error('Reserva no encontrada.');

    const driverId = bookingData.driver;

    // Obtener último punto de tracking del conductor
    const { data: trackData } = await supabase
      .from('booking_tracking_v2' as any)
      .select('lat, lng')
      .eq('driver_id', driverId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    const driverLocation = trackData
      ? { lat: (trackData as any).lat, lng: (trackData as any).lng }
      : { lat: 0, lng: 0 };

    // Llamar a la función de la API para compartir la ubicación
    const response = await fetch("https://us-central1-treasupdate.cloudfunctions.net/shareDriverLocation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: driverId,
        location: driverLocation,
      }),
    });

    if (!response.ok) {
      throw new Error("Error al compartir la ubicación del conductor.");
    }

    return { message: "Ubicación del conductor compartida con éxito." };
  }
);

export const reportIncident = createAsyncThunk(
  "bookings/reportIncident",
  async ({ bookingId, incident }, { rejectWithValue }) => {
    try {
      console.log("Iniciando el reporte de incidente...");
      console.log("ID de la reserva:", bookingId);
      console.log("Incidente:", incident);

      const { data: bookingData, error: fetchErr } = await supabase
        .from('bookings_v2_mobile' as any)
        .select('customer')
        .eq('id', bookingId)
        .single();
      if (fetchErr || !bookingData) throw new Error('Reserva no encontrada.');

      const { error: updateErr } = await supabase
        .from('bookings_v2_mobile' as any)
        .update({
          observations: incident,
          driver: null,
          driver_name: null,
          driver_contact: null,
          driver_token: null,
          driver_image: null,
          car_image: null,
          vehicle_number: null,
          status: 'NEW',
          driver_status: null,
          customer_status: `${bookingData.customer || ''}_NEW`,
        } as any)
        .eq('id', bookingId);
      if (updateErr) throw new Error(updateErr.message);

      console.log('Reserva actualizada con éxito');
      return { message: 'Incidente reportado con éxito.' };
    } catch (error) {
      console.error("Error al actualizar la reserva:", error);
      return rejectWithValue(error.message);
    }
  }
);

export default bookingsSlice.reducer;
