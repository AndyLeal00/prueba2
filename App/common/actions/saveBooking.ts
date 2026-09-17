import supabase from '@/config/SupabaseConfig';

/**
 * Guarda una nueva reserva en Supabase
 * @param bookingData - Datos de la reserva a crear
 * @returns Objeto con success y uid/error
 */
export const saveBooking = async (bookingData: any) => {
  try {
    console.log('📝 [saveBooking] Creando nueva reserva en Supabase...');
    console.log('📋 [saveBooking] Datos de reserva:', bookingData);

    // Preparar datos para Supabase (mapear campos de Firebase a Supabase)
    const supabaseBooking = {
      // Cliente
      customer: bookingData.customer,
      customer_name: bookingData.customer_name,
      customer_email: bookingData.customer_email || null,
      customer_token: bookingData.customer_token || null,
      customer_contact: bookingData.customer_contact,
      customer_city: bookingData.customer_city,
      customer_status: bookingData.customer_status || `${bookingData.customer}_NEW`,
      
      // Conductor (inicialmente null para reservas nuevas)
      driver: bookingData.driver || null,
      driver_name: bookingData.driver_name || null,
      driver_contact: bookingData.driver_contact || null,
      driver_token: bookingData.driver_token || null,
      driver_status: bookingData.driver_status || null,
      driver_image: bookingData.driver_image || null,
      
      // Ubicaciones
      pickup_address: bookingData.pickupAddress,
      pickup_lat: bookingData.pickup.lat,
      pickup_lng: bookingData.pickup.lng,
      drop_address: bookingData.dropAddress,
      drop_lat: bookingData.drop.lat,
      drop_lng: bookingData.drop.lng,
      
      // Vehículo
      car_type: bookingData.carType,
      car_model: bookingData.car_model || null,
      car_image: bookingData.car_image || null,
      plate_number: bookingData.plate_number || null,
      vehicle_number: bookingData.vehicleNumber || null,
      
      // Distancia y duración
      distance: bookingData.distance || 0,
      duration: bookingData.estimateTime || 0,
      trip_type: bookingData.tripType || 'Solo Ida',
      trip_urban: bookingData.tripUrban || 'Urbano',
      
      // Costos
      estimate: parseFloat(bookingData.estimate) || 0,
      trip_cost: parseFloat(bookingData.trip_cost) || 0,
      convenience_fees: parseFloat(bookingData.convenience_fees) || 0,
      discount: parseFloat(bookingData.discount) || 0,
      min_fare_snapshot: parseFloat(bookingData.min_fare_snapshot) || 0,
      driver_share: bookingData.driver_share || null,
      
      // Pago
      payment_mode: bookingData.payment_mode || 'cash',
      payment_gateway: bookingData.payment_gateway || null,
      
      // Estado
      status: bookingData.status || 'NEW',
      trip_start_time: bookingData.trip_start_time || null,
      trip_end_time: bookingData.trip_end_time || null,
      
      // Seguridad
      otp: bookingData.otp?.toString() || null,
      
      // Promociones
      promo_applied: bookingData.promo_applied || false,
      promo_code: bookingData.promo_code || null,
      promo_details: bookingData.promo_details || null,
      
      // Otros
      observations: bookingData.observations || null,
      requested_drivers: bookingData.requestedDrivers || {},
      driver_estimates: bookingData.driverEstimates || {},
      waypoints: bookingData.waypoints || [],
      coords: bookingData.coords || null,
      
      // Referencia (se genera automáticamente si no se proporciona)
      reference: bookingData.reference || null,

      // Vencimiento de la solicitud: 5 minutos desde ahora
      request_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    console.log('🔄 [saveBooking] Datos transformados para Supabase:', supabaseBooking);

    // Insertar en Supabase
    const { data, error } = await (supabase as any)
      .from('bookings_v2_mobile' as any)
      .insert([supabaseBooking])
      .select()
      .single();

    if (error) {
      console.error('❌ [saveBooking] Error al insertar reserva:', error);
      throw error;
    }

    if (!data) {
      console.error('❌ [saveBooking] No se recibió data de Supabase');
      throw new Error('No se pudo crear la reserva');
    }

    console.log('✅ [saveBooking] Reserva creada exitosamente:', data.id);
    console.log('📌 [saveBooking] Referencia:', data.reference);

    // Retornar en formato compatible con el código existente
    return { 
      success: true, 
      uid: data.id,
      reference: data.reference,
      booking: data
    };

  } catch (error: any) {
    console.error('❌ [saveBooking] Error general:', error);
    return { 
      success: false, 
      error: error.message || 'Error desconocido al guardar la reserva'
    };
  }
};
