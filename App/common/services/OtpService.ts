import supabase from '@/config/SupabaseConfig';
const v2 = () => (supabase as any).schema('booking_v2');
export const OtpService = {
  // Legacy creation callers may still supply this field; the server issues the code.
  generateOtp(): string { return ''; },
  async saveOtp(): Promise<boolean> { throw new Error('El código lo emite el servidor'); },
  async validateOtp(bookingId: string, inputOtp: string): Promise<boolean> {
    const { data, error } = await v2().rpc('verify_pickup_code', { p_booking_id: bookingId, p_code: inputOtp.trim() });
    if (error) throw new Error(error.message);
    return data === true;
  },
  async getOtp(bookingId: string): Promise<any> {
    const { data, error } = await (supabase as any).from('bookings_v2_mobile').select('otp,otp_verified').eq('id',bookingId).single();
    if (error) throw new Error(error.message);
    return data;
  },
  async markOtpAsVerified(bookingId: string): Promise<boolean> {
    // Compatibility only: cannot turn an unverified code into a verified one.
    const state = await this.getOtp(bookingId);
    if (!state?.otp_verified) throw new Error('Verifica el código con el servidor primero');
    return true;
  },
};
