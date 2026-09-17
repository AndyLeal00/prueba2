import supabase from '@/config/SupabaseConfig';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Servicio para manejar suscripciones en tiempo real de Supabase para bookings
 */

export class BookingRealtimeService {
  private static channels: Map<string, RealtimeChannel> = new Map();

  /**
   * Suscribe a nuevas reservas en una ciudad específica
   * @param city - Ciudad del conductor
   * @param onNewBooking - Callback cuando hay una nueva reserva
   * @param driverId - ID del conductor (opcional)
   */
  static subscribeToNewBookings(
    city: string,
    onNewBooking: (booking: any) => void,
    driverId?: string
  ): RealtimeChannel {
    const channelName = `new-bookings-${city}${driverId ? `-${driverId}` : ''}`;
    
    console.log(`📡 [BookingRealtime] Suscribiendo a nuevas reservas en ${city}...`);

    // Si ya existe un canal, cancelarlo primero
    const existingChannel = this.channels.get(channelName);
    if (existingChannel) {
      console.log(`🔄 [BookingRealtime] Canal existente encontrado, cancelando...`);
      supabase.removeChannel(existingChannel);
      this.channels.delete(channelName);
    }

    // Crear nuevo canal
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: `customer_city=eq.${city}`,
        },
        (payload) => {
          console.log('🔔 [BookingRealtime] Nueva reserva detectada:', payload);
          
          const newBooking = payload.new;
          
          // Verificar que sea una reserva NEW
          if (newBooking.status === 'NEW') {
            console.log('✅ [BookingRealtime] Notificando nueva reserva:', newBooking.id);
            onNewBooking(newBooking);
          }
        }
      )
      .subscribe((status) => {
        console.log(`📊 [BookingRealtime] Estado de suscripción: ${status}`);
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Suscribe a cambios de una reserva específica
   * @param bookingId - ID de la reserva
   * @param onChange - Callback cuando la reserva cambia
   */
  static subscribeToBookingUpdates(
    bookingId: string,
    onChange: (booking: any) => void
  ): RealtimeChannel {
    const channelName = `booking-${bookingId}`;
    
    console.log(`📡 [BookingRealtime] Suscribiendo a actualizaciones de reserva ${bookingId}...`);

    const existingChannel = this.channels.get(channelName);
    if (existingChannel) {
      supabase.removeChannel(existingChannel);
      this.channels.delete(channelName);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        (payload) => {
          console.log('🔄 [BookingRealtime] Reserva actualizada:', payload.new);
          onChange(payload.new);
        }
      )
      .subscribe((status) => {
        console.log(`📊 [BookingRealtime] Estado: ${status}`);
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Suscribe al tracking de ubicación de un conductor
   * @param bookingId - ID de la reserva
   * @param onLocationUpdate - Callback cuando hay actualización de ubicación
   */
  static subscribeToLocationTracking(
    bookingId: string,
    onLocationUpdate: (location: any) => void
  ): RealtimeChannel {
    const channelName = `tracking-${bookingId}`;
    
    console.log(`📍 [BookingRealtime] Suscribiendo al tracking de ${bookingId}...`);

    const existingChannel = this.channels.get(channelName);
    if (existingChannel) {
      supabase.removeChannel(existingChannel);
      this.channels.delete(channelName);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_tracking',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          console.log('📍 [BookingRealtime] Nueva ubicación:', payload.new);
          onLocationUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        console.log(`📊 [BookingRealtime] Estado tracking: ${status}`);
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Cancela una suscripción específica
   * @param channelName - Nombre del canal a cancelar
   */
  static unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      console.log(`🔌 [BookingRealtime] Cancelando suscripción: ${channelName}`);
      supabase.removeChannel(channel);
      this.channels.delete(channelName);
    }
  }

  /**
   * Cancela todas las suscripciones activas
   */
  static unsubscribeAll(): void {
    console.log(`🔌 [BookingRealtime] Cancelando todas las suscripciones...`);
    this.channels.forEach((channel, name) => {
      console.log(`  - Cancelando: ${name}`);
      supabase.removeChannel(channel);
    });
    this.channels.clear();
  }

  /**
   * Obtiene reservas activas de un usuario
   * @param userId - ID del usuario
   * @param userType - Tipo de usuario ('customer' o 'driver')
   */
  static async getActiveBookings(userId: string, userType: 'customer' | 'driver') {
    try {
      console.log(`🔍 [BookingRealtime] Buscando reservas activas para ${userType}: ${userId}`);
      
      const column = userType === 'customer' ? 'customer' : 'driver';
      
      const { data, error } = await supabase
        .from('bookings_v2_mobile' as any)
        .select('*')
        .eq(column, userId)
        .in('status', ['NEW', 'ACCEPTED', 'STARTED', 'ARRIVED'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ [BookingRealtime] Error al obtener reservas:', error);
        throw error;
      }

      console.log(`✅ [BookingRealtime] Reservas activas encontradas: ${data?.length || 0}`);
      return data || [];
    } catch (error) {
      console.error('❌ [BookingRealtime] Error:', error);
      return [];
    }
  }

  /**
   * Actualiza el estado de una reserva
   * @param bookingId - ID de la reserva
   * @param updates - Campos a actualizar
   */
  static async updateBooking(bookingId: string, updates: Record<string, any>) {
    try {
      console.log(`📝 [BookingRealtime] Actualizando reserva ${bookingId}...`, updates);
      
      const { data, error } = await supabase
        .from('bookings_v2_mobile' as any)
        .update(updates)
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        console.error('❌ [BookingRealtime] Error al actualizar:', error);
        throw error;
      }

      console.log('✅ [BookingRealtime] Reserva actualizada:', data);
      return { success: true, data };
    } catch (error: any) {
      console.error('❌ [BookingRealtime] Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Inserta ubicación de tracking
   * @param bookingId - ID de la reserva
   * @param driverId - ID del conductor
   * @param location - Objeto con lat, lng, speed, heading
   */
  static async insertTracking(
    bookingId: string,
    driverId: string,
    location: { lat: number; lng: number; speed?: number; heading?: number }
  ) {
    try {
      const { data, error } = await supabase
        .from('booking_tracking_v2' as any)
        .insert([{
          booking_id: bookingId,
          driver_id: driverId,
          lat: location.lat,
          lng: location.lng,
          speed: location.speed || null,
          heading: location.heading || null,
        }])
        .select()
        .single();

      if (error) throw error;
      
      return { success: true, data };
    } catch (error: any) {
      console.error('❌ [BookingRealtime] Error insertando tracking:', error);
      return { success: false, error: error.message };
    }
  }
}

export default BookingRealtimeService;
