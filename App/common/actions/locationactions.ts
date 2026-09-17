import {
    FETCH_BOOKING_LOCATION,
    FETCH_BOOKING_LOCATION_SUCCESS,
    FETCH_BOOKING_LOCATION_FAILED,
    STOP_LOCATION_FETCH,
    STORE_ADRESSES
} from "../store/types";
import { firebase } from '@/config/configureFirebase';
import { set } from "firebase/database";
import supabase from "@/config/SupabaseConfig";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Dispatch } from "redux";

interface Location {
    lat: number;
    lng: number;
    [key: string]: any;
}

interface BookingLocationAction {
    type: string;
    payload: any;
}

const trackingChannels = new Map<string, RealtimeChannel>();

// Save tracking location to Supabase booking_tracking
export const saveTracking = async (bookingId: string, location: Location) => {
    const { error } = await supabase.from('booking_tracking_v2' as any).insert({
        booking_id: bookingId,
        driver_id: location.driver_id || null,
        lat: location.lat,
        lng: location.lng,
    } as any);
    if (error) console.error('saveTracking error', error.message);
};

// Subscribe to live driver tracking for a booking via Supabase realtime
export const fetchBookingLocations = (bookingId: string) => async (dispatch: Dispatch<BookingLocationAction>) => {
    dispatch({
        type: FETCH_BOOKING_LOCATION,
        payload: bookingId,
    });

    // Seed with the most recent point so subscribers don't wait for the next insert
    const { data: latest } = await supabase
        .from('booking_tracking_v2' as any)
        .select('lat, lng, timestamp')
        .eq('booking_id', bookingId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latest) {
        dispatch({
            type: FETCH_BOOKING_LOCATION_SUCCESS,
            payload: latest,
        });
    }

    // Avoid duplicate channels for the same booking
    if (trackingChannels.has(bookingId)) return;

    const channel = supabase
        .channel(`booking_tracking-${bookingId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'booking_tracking',
                filter: `booking_id=eq.${bookingId}`,
            },
            (payload: any) => {
                if (payload.new?.lat != null && payload.new?.lng != null) {
                    dispatch({
                        type: FETCH_BOOKING_LOCATION_SUCCESS,
                        payload: payload.new,
                    });
                } else {
                    dispatch({
                        type: FETCH_BOOKING_LOCATION_FAILED,
                        payload: 'Error de búsqueda de ubicación',
                    });
                }
            },
        )
        .subscribe();

    trackingChannels.set(bookingId, channel);
};

// Stop the realtime tracking subscription for a booking
export const stopLocationFetch = (bookingId: string) => (dispatch: Dispatch<BookingLocationAction>) => {
    dispatch({
        type: STOP_LOCATION_FETCH,
        payload: bookingId,
    });
    const channel = trackingChannels.get(bookingId);
    if (channel) {
        supabase.removeChannel(channel);
        trackingChannels.delete(bookingId);
    }
};

// Save user location (still on Firebase — separate from tracking, out of Phase 1 scope)
export const saveUserLocation = (location: Location) => {
    const { auth, userLocationRef } = firebase;
    const uid = auth.currentUser?.uid;
    if (uid) {
        set(userLocationRef(uid), location);
    } else {
        console.error("User is not authenticated");
    }
};

// Store addresses
export const storeAddresses = (data: any) => (dispatch: Dispatch<BookingLocationAction>) => {
    dispatch({
        type: STORE_ADRESSES,
        payload: data,
    });
};
