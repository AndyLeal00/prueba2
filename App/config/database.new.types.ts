export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      calificacion: {
        Row: {
          comentario: string | null
          creado_en: string
          id: string
          id_calificador: string | null
          id_persona: string
          id_reserva: string | null
          puntaje: number
        }
        Insert: {
          comentario?: string | null
          creado_en?: string
          id?: string
          id_calificador?: string | null
          id_persona: string
          id_reserva?: string | null
          puntaje: number
        }
        Update: {
          comentario?: string | null
          creado_en?: string
          id?: string
          id_calificador?: string | null
          id_persona?: string
          id_reserva?: string | null
          puntaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "calificacion_id_calificador_fkey"
            columns: ["id_calificador"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calificacion_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_vehiculo: {
        Row: {
          activo: boolean
          actualizado_en: string
          autorizado: boolean
          capacidad: number
          convenience_fee: number
          convenience_fee_tipo: Database["public"]["Enums"]["tipo_descuento"]
          creado_en: string
          delta_aeropuerto: number
          delta_aeropuerto_prog: number
          descripcion: string | null
          id: number
          imagen_url: string | null
          nombre: string
          tarifa_base: number
          tarifa_base_inter: number
          tarifa_minima: number
          tarifa_minima_inter: number
          umbral_intermunicipal_km: number
          valor_hora: number
          valor_hora_inter: number
          valor_km: number
          valor_km_inter: number
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          autorizado?: boolean
          capacidad?: number
          convenience_fee?: number
          convenience_fee_tipo?: Database["public"]["Enums"]["tipo_descuento"]
          creado_en?: string
          delta_aeropuerto?: number
          delta_aeropuerto_prog?: number
          descripcion?: string | null
          id?: number
          imagen_url?: string | null
          nombre: string
          tarifa_base?: number
          tarifa_base_inter?: number
          tarifa_minima?: number
          tarifa_minima_inter?: number
          umbral_intermunicipal_km?: number
          valor_hora?: number
          valor_hora_inter?: number
          valor_km?: number
          valor_km_inter?: number
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          autorizado?: boolean
          capacidad?: number
          convenience_fee?: number
          convenience_fee_tipo?: Database["public"]["Enums"]["tipo_descuento"]
          creado_en?: string
          delta_aeropuerto?: number
          delta_aeropuerto_prog?: number
          descripcion?: string | null
          id?: number
          imagen_url?: string | null
          nombre?: string
          tarifa_base?: number
          tarifa_base_inter?: number
          tarifa_minima?: number
          tarifa_minima_inter?: number
          umbral_intermunicipal_km?: number
          valor_hora?: number
          valor_hora_inter?: number
          valor_km?: number
          valor_km_inter?: number
        }
        Relationships: []
      }
      ciudad: {
        Row: {
          id: number
          nombre: string
        }
        Insert: {
          id?: number
          nombre: string
        }
        Update: {
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      codigo_referido: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          id: string
          id_persona: string
          total_referidos: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          id?: string
          id_persona: string
          total_referidos?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          id?: string
          id_persona?: string
          total_referidos?: number
        }
        Relationships: [
          {
            foreignKeyName: "codigo_referido_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: true
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_empresa: {
        Row: {
          actualizado_en: string
          ciclo_facturacion: string
          creado_en: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          id_empresa: string
          limite_credito: number
          numero_contrato: string
        }
        Insert: {
          actualizado_en?: string
          ciclo_facturacion?: string
          creado_en?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio: string
          id?: string
          id_empresa: string
          limite_credito?: number
          numero_contrato: string
        }
        Update: {
          actualizado_en?: string
          ciclo_facturacion?: string
          creado_en?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          id_empresa?: string
          limite_credito?: number
          numero_contrato?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_empresa_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "perfil_empresa"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      dispositivo_push: {
        Row: {
          actualizado_en: string
          id: string
          id_persona: string
          modelo: string | null
          plataforma: Database["public"]["Enums"]["plataforma_push"] | null
          push_token: string
        }
        Insert: {
          actualizado_en?: string
          id?: string
          id_persona: string
          modelo?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma_push"] | null
          push_token: string
        }
        Update: {
          actualizado_en?: string
          id?: string
          id_persona?: string
          modelo?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma_push"] | null
          push_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispositivo_push_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_persona: {
        Row: {
          creado_en: string
          id: string
          id_persona: string
          lado: Database["public"]["Enums"]["lado_documento"]
          storage_path: string
          tipo: string
          whatsapp_media_id: string | null
        }
        Insert: {
          creado_en?: string
          id?: string
          id_persona: string
          lado: Database["public"]["Enums"]["lado_documento"]
          storage_path: string
          tipo?: string
          whatsapp_media_id?: string | null
        }
        Update: {
          creado_en?: string
          id?: string
          id_persona?: string
          lado?: Database["public"]["Enums"]["lado_documento"]
          storage_path?: string
          tipo?: string
          whatsapp_media_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documento_persona_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_vehiculo: {
        Row: {
          creado_en: string
          fecha_vencimiento: string | null
          id: string
          id_vehiculo: string
          lado: Database["public"]["Enums"]["lado_documento"] | null
          storage_path: string
          tipo: Database["public"]["Enums"]["tipo_documento_vehiculo"]
        }
        Insert: {
          creado_en?: string
          fecha_vencimiento?: string | null
          id?: string
          id_vehiculo: string
          lado?: Database["public"]["Enums"]["lado_documento"] | null
          storage_path: string
          tipo: Database["public"]["Enums"]["tipo_documento_vehiculo"]
        }
        Update: {
          creado_en?: string
          fecha_vencimiento?: string | null
          id?: string
          id_vehiculo?: string
          lado?: Database["public"]["Enums"]["lado_documento"] | null
          storage_path?: string
          tipo?: Database["public"]["Enums"]["tipo_documento_vehiculo"]
        }
        Relationships: [
          {
            foreignKeyName: "documento_vehiculo_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculo"
            referencedColumns: ["id"]
          },
        ]
      }
      error_registro: {
        Row: {
          auth_id: string | null
          creado_en: string
          email: string | null
          id: number
          mensaje: string | null
          payload: Json | null
          sqlstate: string | null
        }
        Insert: {
          auth_id?: string | null
          creado_en?: string
          email?: string | null
          id?: number
          mensaje?: string | null
          payload?: Json | null
          sqlstate?: string | null
        }
        Update: {
          auth_id?: string | null
          creado_en?: string
          email?: string | null
          id?: number
          mensaje?: string | null
          payload?: Json | null
          sqlstate?: string | null
        }
        Relationships: []
      }
      estado_usuario_bot: {
        Row: {
          actualizado_en: string
          creado_en: string
          datos: Json
          estado: string
          id_persona: string | null
          ultima_actividad: string
          wa_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          datos?: Json
          estado?: string
          id_persona?: string | null
          ultima_actividad?: string
          wa_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          datos?: Json
          estado?: string
          id_persona?: string | null
          ultima_actividad?: string
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estado_usuario_bot_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_notificacion: {
        Row: {
          cuerpo: string | null
          enviado_en: string
          estado: string
          expo_receipt_id: string | null
          id: number
          id_persona: string
          id_reserva: string | null
          mensaje_error: string | null
          tipo_evento: string
          titulo: string | null
        }
        Insert: {
          cuerpo?: string | null
          enviado_en?: string
          estado?: string
          expo_receipt_id?: string | null
          id?: number
          id_persona: string
          id_reserva?: string | null
          mensaje_error?: string | null
          tipo_evento: string
          titulo?: string | null
        }
        Update: {
          cuerpo?: string | null
          enviado_en?: string
          estado?: string
          expo_receipt_id?: string | null
          id?: number
          id_persona?: string
          id_reserva?: string | null
          mensaje_error?: string | null
          tipo_evento?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evento_notificacion_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_notificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_notificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_notificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      interaccion_bot: {
        Row: {
          contenido: string | null
          creado_en: string
          direccion: Database["public"]["Enums"]["direccion_mensaje"]
          estado_fsm: string | null
          evento: string | null
          id: number
          id_jornada: number | null
          recibido_en: string
          tipo_mensaje: string | null
          wa_id: string
        }
        Insert: {
          contenido?: string | null
          creado_en?: string
          direccion: Database["public"]["Enums"]["direccion_mensaje"]
          estado_fsm?: string | null
          evento?: string | null
          id?: number
          id_jornada?: number | null
          recibido_en?: string
          tipo_mensaje?: string | null
          wa_id: string
        }
        Update: {
          contenido?: string | null
          creado_en?: string
          direccion?: Database["public"]["Enums"]["direccion_mensaje"]
          estado_fsm?: string | null
          evento?: string | null
          id?: number
          id_jornada?: number | null
          recibido_en?: string
          tipo_mensaje?: string | null
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaccion_bot_id_jornada_fkey"
            columns: ["id_jornada"]
            isOneToOne: false
            referencedRelation: "jornada_bot"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_bot: {
        Row: {
          completada_en: string | null
          destino: string | null
          estado: string | null
          id: number
          id_persona: string | null
          id_reserva: string | null
          iniciada_en: string
          origen: string | null
          wa_id: string
        }
        Insert: {
          completada_en?: string | null
          destino?: string | null
          estado?: string | null
          id?: number
          id_persona?: string | null
          id_reserva?: string | null
          iniciada_en?: string
          origen?: string | null
          wa_id: string
        }
        Update: {
          completada_en?: string | null
          destino?: string | null
          estado?: string | null
          id?: number
          id_persona?: string | null
          id_reserva?: string | null
          iniciada_en?: string
          origen?: string | null
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornada_bot_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_bot_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_bot_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_bot_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      lugar_guardado: {
        Row: {
          actualizado_en: string
          creado_en: string
          descripcion: string | null
          direccion: string | null
          es_favorito: boolean
          es_predeterminado: boolean
          id: string
          id_persona: string
          lat: number
          lng: number
          nombre: string
          tipo: string
          veces_usado: number
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          descripcion?: string | null
          direccion?: string | null
          es_favorito?: boolean
          es_predeterminado?: boolean
          id?: string
          id_persona: string
          lat: number
          lng: number
          nombre: string
          tipo?: string
          veces_usado?: number
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          descripcion?: string | null
          direccion?: string | null
          es_favorito?: boolean
          es_predeterminado?: boolean
          id?: string
          id_persona?: string
          lat?: number
          lng?: number
          nombre?: string
          tipo?: string
          veces_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "lugar_guardado_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      marca_vehiculo: {
        Row: {
          activo: boolean
          creado_en: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      membresia: {
        Row: {
          actualizado_en: string
          costo: number
          creado_en: string
          estado: Database["public"]["Enums"]["estado_membresia"]
          fecha_fin: string
          fecha_inicio: string
          id: string
          id_conductor: string
          periodo_dias: number
        }
        Insert: {
          actualizado_en?: string
          costo?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_membresia"]
          fecha_fin: string
          fecha_inicio?: string
          id?: string
          id_conductor: string
          periodo_dias?: number
        }
        Update: {
          actualizado_en?: string
          costo?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_membresia"]
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          id_conductor?: string
          periodo_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "membresia_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      mensaje_chat: {
        Row: {
          creado_en: string
          id: string
          id_remitente: string | null
          id_reserva: string
          mensaje: string
          remitente_nombre: string | null
          rol_remitente: Database["public"]["Enums"]["rol_persona"]
        }
        Insert: {
          creado_en?: string
          id?: string
          id_remitente?: string | null
          id_reserva: string
          mensaje: string
          remitente_nombre?: string | null
          rol_remitente: Database["public"]["Enums"]["rol_persona"]
        }
        Update: {
          creado_en?: string
          id?: string
          id_remitente?: string | null
          id_reserva?: string
          mensaje?: string
          remitente_nombre?: string | null
          rol_remitente?: Database["public"]["Enums"]["rol_persona"]
        }
        Relationships: [
          {
            foreignKeyName: "mensaje_chat_id_remitente_fkey"
            columns: ["id_remitente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensaje_chat_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensaje_chat_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensaje_chat_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      movimiento_wallet: {
        Row: {
          creado_en: string
          descripcion: string
          id: string
          id_persona: string
          id_reserva: string | null
          monto: number
          saldo_resultante: number
          tipo: Database["public"]["Enums"]["tipo_movimiento_wallet"]
        }
        Insert: {
          creado_en?: string
          descripcion: string
          id?: string
          id_persona: string
          id_reserva?: string | null
          monto: number
          saldo_resultante: number
          tipo: Database["public"]["Enums"]["tipo_movimiento_wallet"]
        }
        Update: {
          creado_en?: string
          descripcion?: string
          id?: string
          id_persona?: string
          id_reserva?: string | null
          monto?: number
          saldo_resultante?: number
          tipo?: Database["public"]["Enums"]["tipo_movimiento_wallet"]
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_wallet_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_wallet_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_wallet_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_wallet_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacion: {
        Row: {
          creado_en: string
          datos: Json | null
          id: string
          id_persona: string | null
          id_reserva: string | null
          leido: boolean
          mensaje: string
          tipo: string | null
          titulo: string
        }
        Insert: {
          creado_en?: string
          datos?: Json | null
          id?: string
          id_persona?: string | null
          id_reserva?: string | null
          leido?: boolean
          mensaje: string
          tipo?: string | null
          titulo: string
        }
        Update: {
          creado_en?: string
          datos?: Json | null
          id?: string
          id_persona?: string | null
          id_reserva?: string | null
          leido?: boolean
          mensaje?: string
          tipo?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacion_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacion_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacion_llamada: {
        Row: {
          actualizado_en: string
          canal: string
          creado_en: string
          estado: string
          id: string
          id_cliente: string
          id_conductor: string
        }
        Insert: {
          actualizado_en?: string
          canal: string
          creado_en?: string
          estado?: string
          id?: string
          id_cliente: string
          id_conductor: string
        }
        Update: {
          actualizado_en?: string
          canal?: string
          creado_en?: string
          estado?: string
          id?: string
          id_cliente?: string
          id_conductor?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacion_llamada_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacion_llamada_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      peaje: {
        Row: {
          activo: boolean
          creado_en: string
          id: string
          id_ciudad: number | null
          lat: number | null
          lng: number | null
          nombre: string
          precio: number
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          id?: string
          id_ciudad?: number | null
          lat?: number | null
          lng?: number | null
          nombre: string
          precio: number
        }
        Update: {
          activo?: boolean
          creado_en?: string
          id?: string
          id_ciudad?: number | null
          lat?: number | null
          lng?: number | null
          nombre?: string
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "peaje_id_ciudad_fkey"
            columns: ["id_ciudad"]
            isOneToOne: false
            referencedRelation: "ciudad"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_cliente: {
        Row: {
          calificacion_promedio: number | null
          creado_en: string
          id_persona: string
          total_viajes: number
        }
        Insert: {
          calificacion_promedio?: number | null
          creado_en?: string
          id_persona: string
          total_viajes?: number
        }
        Update: {
          calificacion_promedio?: number | null
          creado_en?: string
          id_persona?: string
          total_viajes?: number
        }
        Relationships: [
          {
            foreignKeyName: "perfil_cliente_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: true
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_conductor: {
        Row: {
          activo: boolean
          actualizado_en: string
          aprobado: boolean
          calificacion_promedio: number | null
          codigo_recomendacion: string | null
          creado_en: string
          en_servicio: boolean
          id_persona: string
          numero_cuenta_bancaria: string | null
          numero_licencia: string | null
          ocupado: boolean
          pago_seguridad_social: boolean
          tipo_servicio: string | null
          total_ganancias: number
          total_viajes: number
          whatsapp: boolean
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          aprobado?: boolean
          calificacion_promedio?: number | null
          codigo_recomendacion?: string | null
          creado_en?: string
          en_servicio?: boolean
          id_persona: string
          numero_cuenta_bancaria?: string | null
          numero_licencia?: string | null
          ocupado?: boolean
          pago_seguridad_social?: boolean
          tipo_servicio?: string | null
          total_ganancias?: number
          total_viajes?: number
          whatsapp?: boolean
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          aprobado?: boolean
          calificacion_promedio?: number | null
          codigo_recomendacion?: string | null
          creado_en?: string
          en_servicio?: boolean
          id_persona?: string
          numero_cuenta_bancaria?: string | null
          numero_licencia?: string | null
          ocupado?: boolean
          pago_seguridad_social?: boolean
          tipo_servicio?: string | null
          total_ganancias?: number
          total_viajes?: number
          whatsapp?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "perfil_conductor_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: true
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_empresa: {
        Row: {
          creado_en: string
          id_persona: string
          razon_social: string
        }
        Insert: {
          creado_en?: string
          id_persona: string
          razon_social: string
        }
        Update: {
          creado_en?: string
          id_persona?: string
          razon_social?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_empresa_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: true
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      persona: {
        Row: {
          actualizado_en: string
          apellido: string | null
          auth_id: string | null
          bloqueado: boolean
          codigo_referido_usado: string | null
          creado_en: string
          email: string | null
          id: string
          id_ciudad_actual: number | null
          id_ciudad_origen: number | null
          id_tipo_documento: number | null
          imagen_perfil: string | null
          nombre: string | null
          numero_documento: string | null
          telefono: string
          ubicacion_actualizada_en: string | null
          ultima_lat: number | null
          ultima_lng: number | null
          verificado: boolean
          version_app: string | null
        }
        Insert: {
          actualizado_en?: string
          apellido?: string | null
          auth_id?: string | null
          bloqueado?: boolean
          codigo_referido_usado?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          id_ciudad_actual?: number | null
          id_ciudad_origen?: number | null
          id_tipo_documento?: number | null
          imagen_perfil?: string | null
          nombre?: string | null
          numero_documento?: string | null
          telefono: string
          ubicacion_actualizada_en?: string | null
          ultima_lat?: number | null
          ultima_lng?: number | null
          verificado?: boolean
          version_app?: string | null
        }
        Update: {
          actualizado_en?: string
          apellido?: string | null
          auth_id?: string | null
          bloqueado?: boolean
          codigo_referido_usado?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          id_ciudad_actual?: number | null
          id_ciudad_origen?: number | null
          id_tipo_documento?: number | null
          imagen_perfil?: string | null
          nombre?: string | null
          numero_documento?: string | null
          telefono?: string
          ubicacion_actualizada_en?: string | null
          ultima_lat?: number | null
          ultima_lng?: number | null
          verificado?: boolean
          version_app?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_id_ciudad_actual_fkey"
            columns: ["id_ciudad_actual"]
            isOneToOne: false
            referencedRelation: "ciudad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_id_ciudad_origen_fkey"
            columns: ["id_ciudad_origen"]
            isOneToOne: false
            referencedRelation: "ciudad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_id_tipo_documento_fkey"
            columns: ["id_tipo_documento"]
            isOneToOne: false
            referencedRelation: "tipo_documento"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_beneficiario: {
        Row: {
          activo: boolean
          actualizado_en: string
          creado_en: string
          es_menor: boolean
          id: string
          id_persona: string | null
          id_titular: string
          nombre: string
          parentesco: Database["public"]["Enums"]["parentesco"]
          telefono: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          es_menor?: boolean
          id?: string
          id_persona?: string | null
          id_titular: string
          nombre: string
          parentesco?: Database["public"]["Enums"]["parentesco"]
          telefono: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          es_menor?: boolean
          id?: string
          id_persona?: string | null
          id_titular?: string
          nombre?: string
          parentesco?: Database["public"]["Enums"]["parentesco"]
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_beneficiario_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_beneficiario_id_titular_fkey"
            columns: ["id_titular"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_rol: {
        Row: {
          asignado_en: string
          id_persona: string
          rol: Database["public"]["Enums"]["rol_persona"]
        }
        Insert: {
          asignado_en?: string
          id_persona: string
          rol: Database["public"]["Enums"]["rol_persona"]
        }
        Update: {
          asignado_en?: string
          id_persona?: string
          rol?: Database["public"]["Enums"]["rol_persona"]
        }
        Relationships: [
          {
            foreignKeyName: "persona_rol_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      pregunta_entrenamiento: {
        Row: {
          actualizado_en: string
          creado_en: string
          estado: string | null
          id: number
          motivo: string | null
          pregunta: string
          raw_path: string | null
          respuesta_asesor: string | null
          respuesta_sugerida: string | null
          tema: string | null
          wa_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          estado?: string | null
          id?: number
          motivo?: string | null
          pregunta: string
          raw_path?: string | null
          respuesta_asesor?: string | null
          respuesta_sugerida?: string | null
          tema?: string | null
          wa_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          estado?: string | null
          id?: number
          motivo?: string | null
          pregunta?: string
          raw_path?: string | null
          respuesta_asesor?: string | null
          respuesta_sugerida?: string | null
          tema?: string | null
          wa_id?: string
        }
        Relationships: []
      }
      promocion: {
        Row: {
          activo: boolean
          creado_en: string
          descripcion: string | null
          descuento_maximo: number | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          limite_uso: number | null
          monto_minimo: number
          tipo_descuento: Database["public"]["Enums"]["tipo_descuento"]
          titulo: string
          valor_descuento: number
          veces_usado: number
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          descripcion?: string | null
          descuento_maximo?: number | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          limite_uso?: number | null
          monto_minimo?: number
          tipo_descuento?: Database["public"]["Enums"]["tipo_descuento"]
          titulo: string
          valor_descuento: number
          veces_usado?: number
        }
        Update: {
          activo?: boolean
          creado_en?: string
          descripcion?: string | null
          descuento_maximo?: number | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          limite_uso?: number | null
          monto_minimo?: number
          tipo_descuento?: Database["public"]["Enums"]["tipo_descuento"]
          titulo?: string
          valor_descuento?: number
          veces_usado?: number
        }
        Relationships: []
      }
      queja: {
        Row: {
          actualizado_en: string
          asunto: string
          creado_en: string
          cuerpo: string
          estado: Database["public"]["Enums"]["estado_queja"]
          evidencias: Json
          id: string
          id_reportado: string | null
          id_reportante: string
          id_reserva: string | null
          id_resuelto_por: string | null
          prioridad: Database["public"]["Enums"]["prioridad_queja"]
          respuesta_admin: string | null
          resuelto_en: string | null
          tipo: Database["public"]["Enums"]["tipo_queja"]
        }
        Insert: {
          actualizado_en?: string
          asunto: string
          creado_en?: string
          cuerpo: string
          estado?: Database["public"]["Enums"]["estado_queja"]
          evidencias?: Json
          id?: string
          id_reportado?: string | null
          id_reportante: string
          id_reserva?: string | null
          id_resuelto_por?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_queja"]
          respuesta_admin?: string | null
          resuelto_en?: string | null
          tipo?: Database["public"]["Enums"]["tipo_queja"]
        }
        Update: {
          actualizado_en?: string
          asunto?: string
          creado_en?: string
          cuerpo?: string
          estado?: Database["public"]["Enums"]["estado_queja"]
          evidencias?: Json
          id?: string
          id_reportado?: string | null
          id_reportante?: string
          id_reserva?: string | null
          id_resuelto_por?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_queja"]
          respuesta_admin?: string | null
          resuelto_en?: string | null
          tipo?: Database["public"]["Enums"]["tipo_queja"]
        }
        Relationships: [
          {
            foreignKeyName: "queja_id_reportado_fkey"
            columns: ["id_reportado"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queja_id_reportante_fkey"
            columns: ["id_reportante"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queja_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queja_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queja_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queja_id_resuelto_por_fkey"
            columns: ["id_resuelto_por"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      referido: {
        Row: {
          codigo: string
          estado: Database["public"]["Enums"]["estado_referido"]
          id: string
          id_codigo_referido: string | null
          id_conductor_referido: string | null
          id_referente: string | null
          recompensa_reclamada: boolean
          referido_en: string
        }
        Insert: {
          codigo: string
          estado?: Database["public"]["Enums"]["estado_referido"]
          id?: string
          id_codigo_referido?: string | null
          id_conductor_referido?: string | null
          id_referente?: string | null
          recompensa_reclamada?: boolean
          referido_en?: string
        }
        Update: {
          codigo?: string
          estado?: Database["public"]["Enums"]["estado_referido"]
          id?: string
          id_codigo_referido?: string | null
          id_conductor_referido?: string | null
          id_referente?: string | null
          recompensa_reclamada?: boolean
          referido_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "referido_id_codigo_referido_fkey"
            columns: ["id_codigo_referido"]
            isOneToOne: false
            referencedRelation: "codigo_referido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referido_id_conductor_referido_fkey"
            columns: ["id_conductor_referido"]
            isOneToOne: true
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "referido_id_referente_fkey"
            columns: ["id_referente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva: {
        Row: {
          actualizado_en: string
          bajada_direccion: string | null
          bajada_lat: number | null
          bajada_lng: number | null
          cancelado_en: string | null
          cancelado_por: Database["public"]["Enums"]["rol_persona"] | null
          conductor_llego_en: string | null
          convenience_fees: number
          costo_total: number | null
          costo_viaje: number | null
          creado_en: string
          descuento: number
          destino_direccion: string | null
          destino_lat: number | null
          destino_lng: number | null
          distancia_km: number | null
          duracion_seg: number | null
          estado: Database["public"]["Enums"]["estado_reserva"]
          ganancia_conductor: number | null
          id: string
          id_beneficiario: string | null
          id_categoria: number | null
          id_cliente: string | null
          id_conductor: string | null
          id_pasajero: string | null
          id_promocion: string | null
          id_vehiculo: string | null
          incidente: Json | null
          modo_pago: Database["public"]["Enums"]["modo_pago"]
          motivo_cancelacion: string | null
          observaciones: string | null
          origen_direccion: string | null
          origen_lat: number | null
          origen_lng: number | null
          otp: string | null
          otp_generado_en: string | null
          otp_verificado: boolean
          otp_verificado_en: string | null
          pasajero_nombre: string | null
          pasajero_telefono: string | null
          precio: number
          precio_estimado: number | null
          prepago: boolean
          referencia: string | null
          solicitado_en: string
          tarifa_minima_snapshot: number | null
          tipo_reserva: Database["public"]["Enums"]["tipo_reserva"]
          viaje_fin_en: string | null
          viaje_inicio_en: string | null
          waypoints: Json
        }
        Insert: {
          actualizado_en?: string
          bajada_direccion?: string | null
          bajada_lat?: number | null
          bajada_lng?: number | null
          cancelado_en?: string | null
          cancelado_por?: Database["public"]["Enums"]["rol_persona"] | null
          conductor_llego_en?: string | null
          convenience_fees?: number
          costo_total?: number | null
          costo_viaje?: number | null
          creado_en?: string
          descuento?: number
          destino_direccion?: string | null
          destino_lat?: number | null
          destino_lng?: number | null
          distancia_km?: number | null
          duracion_seg?: number | null
          estado?: Database["public"]["Enums"]["estado_reserva"]
          ganancia_conductor?: number | null
          id?: string
          id_beneficiario?: string | null
          id_categoria?: number | null
          id_cliente?: string | null
          id_conductor?: string | null
          id_pasajero?: string | null
          id_promocion?: string | null
          id_vehiculo?: string | null
          incidente?: Json | null
          modo_pago?: Database["public"]["Enums"]["modo_pago"]
          motivo_cancelacion?: string | null
          observaciones?: string | null
          origen_direccion?: string | null
          origen_lat?: number | null
          origen_lng?: number | null
          otp?: string | null
          otp_generado_en?: string | null
          otp_verificado?: boolean
          otp_verificado_en?: string | null
          pasajero_nombre?: string | null
          pasajero_telefono?: string | null
          precio: number
          precio_estimado?: number | null
          prepago?: boolean
          referencia?: string | null
          solicitado_en?: string
          tarifa_minima_snapshot?: number | null
          tipo_reserva?: Database["public"]["Enums"]["tipo_reserva"]
          viaje_fin_en?: string | null
          viaje_inicio_en?: string | null
          waypoints?: Json
        }
        Update: {
          actualizado_en?: string
          bajada_direccion?: string | null
          bajada_lat?: number | null
          bajada_lng?: number | null
          cancelado_en?: string | null
          cancelado_por?: Database["public"]["Enums"]["rol_persona"] | null
          conductor_llego_en?: string | null
          convenience_fees?: number
          costo_total?: number | null
          costo_viaje?: number | null
          creado_en?: string
          descuento?: number
          destino_direccion?: string | null
          destino_lat?: number | null
          destino_lng?: number | null
          distancia_km?: number | null
          duracion_seg?: number | null
          estado?: Database["public"]["Enums"]["estado_reserva"]
          ganancia_conductor?: number | null
          id?: string
          id_beneficiario?: string | null
          id_categoria?: number | null
          id_cliente?: string | null
          id_conductor?: string | null
          id_pasajero?: string | null
          id_promocion?: string | null
          id_vehiculo?: string | null
          incidente?: Json | null
          modo_pago?: Database["public"]["Enums"]["modo_pago"]
          motivo_cancelacion?: string | null
          observaciones?: string | null
          origen_direccion?: string | null
          origen_lat?: number | null
          origen_lng?: number | null
          otp?: string | null
          otp_generado_en?: string | null
          otp_verificado?: boolean
          otp_verificado_en?: string | null
          pasajero_nombre?: string | null
          pasajero_telefono?: string | null
          precio?: number
          precio_estimado?: number | null
          prepago?: boolean
          referencia?: string | null
          solicitado_en?: string
          tarifa_minima_snapshot?: number | null
          tipo_reserva?: Database["public"]["Enums"]["tipo_reserva"]
          viaje_fin_en?: string | null
          viaje_inicio_en?: string | null
          waypoints?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reserva_id_beneficiario_fkey"
            columns: ["id_beneficiario"]
            isOneToOne: false
            referencedRelation: "persona_beneficiario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "categoria_vehiculo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "reserva_id_pasajero_fkey"
            columns: ["id_pasajero"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_promocion_fkey"
            columns: ["id_promocion"]
            isOneToOne: false
            referencedRelation: "promocion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculo"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_oferta_conductor: {
        Row: {
          enviado_en: string
          estimado: number | null
          expira_en: string | null
          id_conductor: string
          id_reserva: string
        }
        Insert: {
          enviado_en?: string
          estimado?: number | null
          expira_en?: string | null
          id_conductor: string
          id_reserva: string
        }
        Update: {
          enviado_en?: string
          estimado?: number | null
          expira_en?: string | null
          id_conductor?: string
          id_reserva?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_oferta_conductor_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "reserva_oferta_conductor_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_oferta_conductor_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_oferta_conductor_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_snapshot: {
        Row: {
          capturado_en: string
          creado_en: string
          datos_crudos: Json | null
          distancia_km: number | null
          duracion_seg: number | null
          etapa: Database["public"]["Enums"]["etapa_servicio"]
          id: string
          id_cliente: string | null
          id_conductor: string | null
          id_reserva: string
          lat: number | null
          lng: number | null
          precio_calculado: number | null
        }
        Insert: {
          capturado_en?: string
          creado_en?: string
          datos_crudos?: Json | null
          distancia_km?: number | null
          duracion_seg?: number | null
          etapa: Database["public"]["Enums"]["etapa_servicio"]
          id?: string
          id_cliente?: string | null
          id_conductor?: string | null
          id_reserva: string
          lat?: number | null
          lng?: number | null
          precio_calculado?: number | null
        }
        Update: {
          capturado_en?: string
          creado_en?: string
          datos_crudos?: Json | null
          distancia_km?: number | null
          duracion_seg?: number | null
          etapa?: Database["public"]["Enums"]["etapa_servicio"]
          id?: string
          id_cliente?: string | null
          id_conductor?: string | null
          id_reserva?: string
          lat?: number | null
          lng?: number | null
          precio_calculado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reserva_snapshot_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_snapshot_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "reserva_snapshot_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_snapshot_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_snapshot_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_tracking: {
        Row: {
          id: number
          id_conductor: string | null
          id_reserva: string
          lat: number
          lng: number
          precision_m: number | null
          registrado_en: string
          rumbo: number | null
          velocidad: number | null
        }
        Insert: {
          id?: number
          id_conductor?: string | null
          id_reserva: string
          lat: number
          lng: number
          precision_m?: number | null
          registrado_en?: string
          rumbo?: number | null
          velocidad?: number | null
        }
        Update: {
          id?: number
          id_conductor?: string | null
          id_reserva?: string
          lat?: number
          lng?: number
          precision_m?: number | null
          registrado_en?: string
          rumbo?: number | null
          velocidad?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reserva_tracking_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "reserva_tracking_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_tracking_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_activa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_tracking_id_reserva_fkey"
            columns: ["id_reserva"]
            isOneToOne: false
            referencedRelation: "v_reserva_detalle"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_documento: {
        Row: {
          acronimo: string | null
          id: number
          nombre: string
        }
        Insert: {
          acronimo?: string | null
          id?: number
          nombre: string
        }
        Update: {
          acronimo?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      vehiculo: {
        Row: {
          activo: boolean
          actualizado_en: string
          anio: number | null
          capacidad: number
          caracteristicas: Json | null
          color: string | null
          creado_en: string
          foto_1: string | null
          foto_2: string | null
          id: string
          id_categoria: number | null
          id_conductor: string
          id_marca: string | null
          linea: string | null
          placa: string
          tipo_combustible: string | null
          tipo_servicio: string | null
          transmision: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          anio?: number | null
          capacidad?: number
          caracteristicas?: Json | null
          color?: string | null
          creado_en?: string
          foto_1?: string | null
          foto_2?: string | null
          id?: string
          id_categoria?: number | null
          id_conductor: string
          id_marca?: string | null
          linea?: string | null
          placa: string
          tipo_combustible?: string | null
          tipo_servicio?: string | null
          transmision?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          anio?: number | null
          capacidad?: number
          caracteristicas?: Json | null
          color?: string | null
          creado_en?: string
          foto_1?: string | null
          foto_2?: string | null
          id?: string
          id_categoria?: number | null
          id_conductor?: string
          id_marca?: string | null
          linea?: string | null
          placa?: string
          tipo_combustible?: string | null
          tipo_servicio?: string | null
          transmision?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "categoria_vehiculo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculo_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "vehiculo_id_marca_fkey"
            columns: ["id_marca"]
            isOneToOne: false
            referencedRelation: "marca_vehiculo"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet: {
        Row: {
          actualizado_en: string
          id_persona: string
          saldo: number
          saldo_km: number
        }
        Insert: {
          actualizado_en?: string
          id_persona: string
          saldo?: number
          saldo_km?: number
        }
        Update: {
          actualizado_en?: string
          id_persona?: string
          saldo?: number
          saldo_km?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallet_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: true
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_estadisticas_cliente: {
        Row: {
          canceladas: number | null
          completadas: number | null
          duracion_promedio_seg: number | null
          id_cliente: string | null
          total_gastado: number | null
          total_reservas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reserva_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
        ]
      }
      v_reserva_activa: {
        Row: {
          categoria: string | null
          color: string | null
          conductor_imagen: string | null
          conductor_nombre: string | null
          conductor_telefono: string | null
          costo_total: number | null
          destino_direccion: string | null
          es_para_tercero: boolean | null
          estado: Database["public"]["Enums"]["estado_reserva"] | null
          id: string | null
          id_beneficiario: string | null
          id_cliente: string | null
          id_conductor: string | null
          marca: string | null
          modelo: string | null
          origen_direccion: string | null
          parentesco: Database["public"]["Enums"]["parentesco"] | null
          pasajero_nombre: string | null
          pasajero_telefono: string | null
          placa: string | null
          precio: number | null
          referencia: string | null
          solicitado_en: string | null
          tipo_reserva: Database["public"]["Enums"]["tipo_reserva"] | null
          titular_email: string | null
          titular_nombre: string | null
          titular_telefono: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reserva_id_beneficiario_fkey"
            columns: ["id_beneficiario"]
            isOneToOne: false
            referencedRelation: "persona_beneficiario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      v_reserva_detalle: {
        Row: {
          categoria: string | null
          color: string | null
          conductor_imagen: string | null
          conductor_nombre: string | null
          conductor_telefono: string | null
          costo_total: number | null
          destino_direccion: string | null
          es_para_tercero: boolean | null
          estado: Database["public"]["Enums"]["estado_reserva"] | null
          id: string | null
          id_beneficiario: string | null
          id_cliente: string | null
          id_conductor: string | null
          marca: string | null
          modelo: string | null
          origen_direccion: string | null
          parentesco: Database["public"]["Enums"]["parentesco"] | null
          pasajero_nombre: string | null
          pasajero_telefono: string | null
          placa: string | null
          precio: number | null
          referencia: string | null
          solicitado_en: string | null
          tipo_reserva: Database["public"]["Enums"]["tipo_reserva"] | null
          titular_email: string | null
          titular_nombre: string | null
          titular_telefono: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reserva_id_beneficiario_fkey"
            columns: ["id_beneficiario"]
            isOneToOne: false
            referencedRelation: "persona_beneficiario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_id_conductor_fkey"
            columns: ["id_conductor"]
            isOneToOne: false
            referencedRelation: "perfil_conductor"
            referencedColumns: ["id_persona"]
          },
        ]
      }
    }
    Functions: {
      buscar_reservas_inmediatas: {
        Args: {
          p_id_conductor: string
          p_lat: number
          p_lng: number
          p_rango_km: number
        }
        Returns: {
          destino_direccion: string
          destino_lat: number
          destino_lng: number
          distancia_a_origen_km: number
          distancia_km: number
          duracion_seg: number
          estado: Database["public"]["Enums"]["estado_reserva"]
          id: string
          id_categoria: number
          id_cliente: string
          modo_pago: Database["public"]["Enums"]["modo_pago"]
          observaciones: string
          origen_direccion: string
          origen_lat: number
          origen_lng: number
          precio_estimado: number
          referencia: string
          solicitado_en: string
        }[]
      }
      dearmor: { Args: { "": string }; Returns: string }
      es_admin: { Args: never; Returns: boolean }
      es_conductor: { Args: never; Returns: boolean }
      gen_random_uuid: { Args: never; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      generar_codigo_referido: { Args: { p_nombre: string }; Returns: string }
      get_auth_profile: { Args: never; Returns: Json }
      get_membresias_conductor: {
        Args: { p_id_conductor: string }
        Returns: {
          actualizado_en: string
          costo: number
          creado_en: string
          estado: Database["public"]["Enums"]["estado_membresia"]
          fecha_fin: string
          fecha_inicio: string
          id: string
          id_conductor: string
          periodo_dias: number
        }[]
        SetofOptions: {
          from: "*"
          to: "membresia"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_perfil_dashboard: { Args: never; Returns: Json }
      get_service_timeline: {
        Args: { p_id_reserva: string }
        Returns: {
          capturado_en: string
          creado_en: string
          datos_crudos: Json | null
          distancia_km: number | null
          duracion_seg: number | null
          etapa: Database["public"]["Enums"]["etapa_servicio"]
          id: string
          id_cliente: string | null
          id_conductor: string | null
          id_reserva: string
          lat: number | null
          lng: number | null
          precio_calculado: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "reserva_snapshot"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      persona_actual_id: { Args: never; Returns: string }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      posee_reserva: { Args: { bid: string }; Returns: boolean }
      uuid_generate_v1: { Args: never; Returns: string }
      uuid_generate_v1mc: { Args: never; Returns: string }
      uuid_generate_v3: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_generate_v4: { Args: never; Returns: string }
      uuid_generate_v5: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_nil: { Args: never; Returns: string }
      uuid_ns_dns: { Args: never; Returns: string }
      uuid_ns_oid: { Args: never; Returns: string }
      uuid_ns_url: { Args: never; Returns: string }
      uuid_ns_x500: { Args: never; Returns: string }
      verificar_disponibilidad: {
        Args: { p_email?: string; p_telefono?: string }
        Returns: Json
      }
    }
    Enums: {
      direccion_mensaje: "inbound" | "outbound"
      estado_membresia: "PENDIENTE" | "ACTIVA" | "VENCIDA" | "CANCELADA"
      estado_queja: "pending" | "in_review" | "resolved" | "rejected"
      estado_referido: "pending" | "approved" | "rejected"
      estado_reserva:
        | "NEW"
        | "PENDING"
        | "ACCEPTED"
        | "STARTED"
        | "ARRIVED"
        | "REACHED"
        | "COMPLETE"
        | "PAID"
        | "CANCELLED"
      etapa_servicio:
        | "created"
        | "arrival_pickup"
        | "started"
        | "arrival_destination"
        | "completed"
        | "paid"
        | "cancelled"
      lado_documento: "frontal" | "posterior" | "selfie"
      modo_pago: "cash" | "wallet" | "card" | "transfer"
      parentesco:
        | "hijo"
        | "conyuge"
        | "familiar"
        | "amigo"
        | "empleado"
        | "otro"
      plataforma_push: "ios" | "android"
      prioridad_queja: "baja" | "media" | "alta"
      rol_persona: "cliente" | "conductor" | "empresa" | "admin" | "asesor"
      tipo_descuento: "percentage" | "fixed"
      tipo_documento_vehiculo:
        | "soat"
        | "tecnomecanica"
        | "tarjeta_propiedad"
        | "camara_comercio"
        | "foto"
      tipo_movimiento_wallet: "credit" | "debit"
      tipo_queja: "queja" | "reclamo" | "sugerencia" | "otro"
      tipo_reserva: "immediate" | "scheduled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      direccion_mensaje: ["inbound", "outbound"],
      estado_membresia: ["PENDIENTE", "ACTIVA", "VENCIDA", "CANCELADA"],
      estado_queja: ["pending", "in_review", "resolved", "rejected"],
      estado_referido: ["pending", "approved", "rejected"],
      estado_reserva: [
        "NEW",
        "PENDING",
        "ACCEPTED",
        "STARTED",
        "ARRIVED",
        "REACHED",
        "COMPLETE",
        "PAID",
        "CANCELLED",
      ],
      etapa_servicio: [
        "created",
        "arrival_pickup",
        "started",
        "arrival_destination",
        "completed",
        "paid",
        "cancelled",
      ],
      lado_documento: ["frontal", "posterior", "selfie"],
      modo_pago: ["cash", "wallet", "card", "transfer"],
      parentesco: ["hijo", "conyuge", "familiar", "amigo", "empleado", "otro"],
      plataforma_push: ["ios", "android"],
      prioridad_queja: ["baja", "media", "alta"],
      rol_persona: ["cliente", "conductor", "empresa", "admin", "asesor"],
      tipo_descuento: ["percentage", "fixed"],
      tipo_documento_vehiculo: [
        "soat",
        "tecnomecanica",
        "tarjeta_propiedad",
        "camara_comercio",
        "foto",
      ],
      tipo_movimiento_wallet: ["credit", "debit"],
      tipo_queja: ["queja", "reclamo", "sugerencia", "otro"],
      tipo_reserva: ["immediate", "scheduled"],
    },
  },
} as const

