// En tu archivo de acciones, por ejemplo bookingActions.js
import { sendNotification } from '../other/NotificationFunctions';
import { addActualsToBooking, updateDriverQueue } from '../other/sharedFunctions';
import { FETCH_BOOKINGS, FETCH_BOOKINGS_FAILED, FETCH_BOOKINGS_SUCCESS } from '../store/types';
import { fetchBookingLocations } from './locationactions';

import { ref, get, query, orderByChild, equalTo, getDatabase, update, push } from 'firebase/database';
import supabase from '../../config/SupabaseConfig';

const insertTrackingPoint = async (
  bookingId: string,
  driverId: string | undefined,
  driverLocation: { lat: number; lng: number },
) => {
  const { error } = await supabase.from('booking_tracking_v2' as any).insert({
    booking_id: bookingId,
    driver_id: driverId || null,
    lat: driverLocation.lat,
    lng: driverLocation.lng,
  } as any);
  if (error) console.error('booking_tracking insert error', error.message);
};

export const fetchBookings = () => async (dispatch) => {
  const userInfo = store.getState().auth.profile;
  const bookingQuery = query(ref(getDatabase, 'bookings'), orderByChild('customer'), equalTo(userInfo.uid));

  dispatch({ type: FETCH_BOOKINGS });

  try {
    const snapshot = await get(bookingQuery);
    if (snapshot.exists()) {
      const data = snapshot.val();
      const active = [];
      let tracked = null;
      const bookings = Object.keys(data).map((i) => {
        data[i].id = i;
        data[i].pickupAddress = data[i].pickup.add;
        data[i].dropAddress = data[i].drop.add;
        data[i].discount = data[i].discount || 0;
        data[i].cashPaymentAmount = data[i].cashPaymentAmount || 0;
        data[i].cardPaymentAmount = data[i].cardPaymentAmount || 0;
        return data[i];
      });

      for (const booking of bookings) {
        if (['PAYMENT_PENDING', 'NEW', 'ACCEPTED', 'ARRIVED', 'STARTED', 'REACHED', 'PENDING', 'PAID'].includes(booking.status)) {
          active.push(booking);
        }
        if (['ACCEPTED', 'ARRIVED', 'STARTED'].includes(booking.status) && userInfo.usertype === 'driver') {
          tracked = booking;
          fetchBookingLocations(tracked.id)(dispatch);
        }
      }

      dispatch({
        type: FETCH_BOOKINGS_SUCCESS,
        payload: { bookings: bookings.reverse(), active, tracked },
      });

      if (tracked) {
        dispatch({ type: FETCH_BOOKINGS_SUCCESS, payload: null });
      }
    } else {
      dispatch({ type: FETCH_BOOKINGS_FAILED, payload: 'No bookings found' });
    }
  } catch (error) {
    dispatch({ type: FETCH_BOOKINGS_FAILED, payload: error.message });
  }
};

  export const updateBooking = (booking: any) => async (dispatch: Dispatch<any>) => {
    const {
      auth,
      trackingRef,
      singleBookingRef,
      singleUserRef,
      walletHistoryRef,
      settingsRef,
      userRatingsRef
    } = firebase;
  
    dispatch({
      type: UPDATE_BOOKING,
      payload: booking,
    });
  
    const settingsdata = await get(settingsRef);
    const settings = settingsdata.val();
    
    if (booking.status == 'PAYMENT_PENDING') {
      update(singleBookingRef(booking.id), booking);
    }
    if (booking.status == 'NEW' || booking.status == 'ACCEPTED') {
      update(singleBookingRef(booking.id), updateDriverQueue(booking));
    }
    if (booking.status == 'ARRIVED') {
      let dt = new Date();
      booking.driver_arrive_time = dt.getTime().toString();
      update(singleBookingRef(booking.id), booking);
      if (booking.customer_token) {
        sendNotification(
          booking.customer_token,
          {
            title: 'Notificación de T+Plus',
            msg: 'Conductor cerca de ti',
            screen: 'BookedCab',
            params: { bookingId: booking.id }
          }
        );
      }
    }
  
    if (booking.status == 'STARTED') {
      let dt = new Date();
      let localString = dt.getHours() + ":" + dt.getMinutes() + ":" + dt.getSeconds();
      let timeString = dt.getTime(); 
      booking.trip_start_time = localString;
      booking.startTime = timeString;
      update(singleBookingRef(booking.id), booking);
  
      const driverLocation = store.getState().gpsdata.location;

      insertTrackingPoint(booking.id, booking.driver, driverLocation);
  
      if (booking.customer_token) {
        sendNotification(
          booking.customer_token,
          {
            title: 'Notificación de T+Plus',
            msg: 'El conductor comenzó tu viaje. Su identificación de reserva es ' + booking.reference,
            screen: 'BookedCab',
            params: { bookingId: booking.id }
          }
        );
      }
    }
  
    if (booking.status == 'REACHED') {
      const driverLocation = store.getState().gpsdata.location;

      insertTrackingPoint(booking.id, booking.driver, driverLocation);
  
      let address = await saveAddresses(booking, driverLocation);
  
      let bookingObj = await addActualsToBooking(booking, address, driverLocation);
      update(singleBookingRef(booking.id), bookingObj);
  
      if (booking.customer_token) {
        sendNotification(
          booking.customer_token,
          {
            title: 'Notificación de T+Plus',
            msg: 'Ha llegado a su destino. Por favor, complete el pago.',
            screen: 'BookedCab',
            params: { bookingId: booking.id }
          }
        );
      }
    }
  
    if (booking.status == 'PENDING') {
      update(singleBookingRef(booking.id), booking);
      update(singleUserRef(booking.driver), { queue: false });
    }
    if (booking.status == 'PAID') {
      if (booking.booking_from_web) {
        booking.status = 'COMPLETE';
      }
      update(singleBookingRef(booking.id), booking);
      if (booking.driver == auth.currentUser.uid && (booking.prepaid || booking.payment_mode == 'cash' || booking.payment_mode == 'wallet')) {
        update(singleUserRef(booking.driver), { queue: false });
      }
  
      if (booking.customer_token) {
        sendNotification(
          booking.customer_token,
          {
            title: 'Notificación de T+Plus',
            msg: 'Pago realizado con éxito.',
            screen: 'BookedCab',
            params: { bookingId: booking.id }
          }
        );
      }
  
      if (booking.driver_token) {
        sendNotification(
          booking.driver_token,
          {
            title: 'Notificación de T+Plus',
            msg: 'Pago realizado con éxito.',
            screen: 'BookedCab',
            params: { bookingId: booking.id }
          }
        );
      }
    }
  
    if (booking.status == 'COMPLETE') {
      update(singleBookingRef(booking.id), booking);
      if (booking.rating) {
        if (booking.driver_token) {
          sendNotification(
            booking.driver_token,
            {
              title: 'Notificación de T+Plus',
              msg: 'Has recibido una calificación de X estrellas'.toString().replace("X", booking.rating.toString()),
              screen: 'BookedCab',
              params: { bookingId: booking.id }
            }
          );
        }
        onValue(userRatingsRef(booking.driver), snapshot => {
          let ratings = snapshot.val();
          let rating;
          if (ratings) {
            let sum = 0;
            const arr = Object.values(ratings);
            for (let i = 0; i < arr.length; i++) {
              sum = sum + arr[i].rate;
            }
            sum = sum + booking.rating;
            rating = parseFloat(sum / (arr.length + 1)).toFixed(1);
          } else {
            rating = booking.rating;
          }
          update(singleUserRef(booking.driver), { rating: rating });
          push(userRatingsRef(booking.driver), {
            user: booking.customer,
            rate: booking.rating
          });
        }, { onlyOnce: true });
      }
    }
  };
  
