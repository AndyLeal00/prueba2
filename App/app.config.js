// Load .env early so environment variables are available
require('dotenv').config();
const supabaseEnvironment = require('./config/supabase.environment');

// Construct AppConfig from environment variables directly instead of requiring a JS file.
const AppConfig = {
    // OJO: app_name NO se lee de .env a proposito. Este valor define el nombre
    // del target de Xcode (sanitizado: "T+Plus" -> "TPlus"), y como .env esta
    // en .easignore no llega al servidor de EAS. Si cada lado calcula un nombre
    // distinto, la build muere en CONFIGURE_XCODE_PROJECT con
    // "Could not find target 'X' in project.pbxproj". Debe ser deterministico.
    app_name: 'TmasPlus',
    app_description: process.env.APP_DESCRIPTION || 'Sistema de transporte urbano inteligente T+Plus',
    app_display_name: process.env.APP_DISPLAY_NAME || 'TmasPlus',
    icon_app: './assets/images/logo-Preview.png',
    app_identifier: process.env.APP_IDENTIFIER || 'com.releaseunocero',
    app_identifier_ios: process.env.APP_IDENTIFIER_IOS || 'tmasplus.tmasplus',
    ios_app_version: process.env.APP_VERSION || '1.10.5',
    runtime_Version: process.env.EXPO_RUNTIME_VERSION || '1.0.4',
    android_app_version: parseInt(process.env.ANDROID_APP_VERSION || '1', 10),
    expo_owner: process.env.EXPO_OWNER || 'tmasplus',
    expo_slug: process.env.EXPO_SLUG || 'tmasplus',
    expo_project_id: process.env.EXPO_PROJECT_ID || '16f8e33a-1dda-48f1-84a6-eeb3c8c5c51f'
};

    // Claves separadas por plataforma: react-native-maps usa PROVIDER_GOOGLE en
    // varias pantallas, y una clave restringida a apps Android deja el mapa en
    // gris dentro del iPhone. Cada plataforma cae a la otra solo como respaldo.
    const API_KEY_ANDROID = process.env.GOOGLE_MAPS_API_KEY_ANDROID || process.env.GOOGLE_MAPS_API_KEY_IOS || '';
    const API_KEY_IOS = process.env.GOOGLE_MAPS_API_KEY_IOS || process.env.GOOGLE_MAPS_API_KEY_ANDROID || '';
    const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || '';
    const RNMAPBOX_MAPS_DOWNLOAD_TOKEN = process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN || process.env.MAPBOX_DOWNLOAD_TOKEN || '';

module.exports = {
    name: AppConfig.app_name,
    description: AppConfig.app_description,
    owner: "tmasplus", 
    sdkVersion: '54.0.0',
    slug: AppConfig.expo_slug,
    scheme: AppConfig.expo_slug,
    privacy: "public",

    runtimeVersion: AppConfig.runtime_Version,

    platforms: [
        "ios",
        "android"
    ],
    androidStatusBar: {
        hidden: true,
        translucent: true
    },
    version: AppConfig.ios_app_version,
    orientation: "portrait",
    icon: AppConfig.icon_app,
    // El splash se configura abajo con el plugin expo-splash-screen. La clave
    // "splash" heredada no permite controlar el tamano de la imagen: con
    // resizeMode contain sobre un PNG de 1024x1024 el logo ocupaba casi todo
    // el ancho, y como logo1024x1024.png no tiene alfa se veia un cuadro
    // blanco recortado sobre el fondo oscuro.
    updates: {
        "fallbackToCacheTimeout": 0,
        "url": "https://u.expo.dev/" + AppConfig.expo_project_id,
    },
    extra: {
        eas: {
            projectId: AppConfig.expo_project_id
        },
        APP_NAME: AppConfig.app_name,
        APP_DISPLAY_NAME: AppConfig.app_display_name,
        APP_IDENTIFIER: AppConfig.app_identifier,
        EXPO_PROJECT_ID: AppConfig.expo_project_id,
        SUPABASE_URL: supabaseEnvironment.url,
        SUPABASE_PUBLISHABLE_KEY: supabaseEnvironment.publishableKey,
        // Alias temporal para consumidores legacy. Contiene la misma publishable
        // key cliente, no una anon JWT ni una service_role.
        SUPABASE_ANON_KEY: supabaseEnvironment.publishableKey,
        SUPABASE_PROJECT_REF: supabaseEnvironment.projectRef,
        SUPABASE_EMAIL_REDIRECT_TO: process.env.SUPABASE_EMAIL_REDIRECT_TO || 'https://dashboard.tmasplus.com/welcome',
        GOOGLE_MAPS_API_KEY_ANDROID: process.env.GOOGLE_MAPS_API_KEY_ANDROID || '',
        GOOGLE_MAPS_API_KEY_IOS: process.env.GOOGLE_MAPS_API_KEY_IOS || '',
        MAPBOX_ACCESS_TOKEN: MAPBOX_ACCESS_TOKEN
    },
    assetBundlePatterns: [
        "**/*"
    ],
    packagerOpts: {
        config: "metro.config.js"
    },
    ios: {
        // Solo iPhone: evita tener que publicar capturas de iPad 13" y el rechazo
        // por layout roto en tablet. Volver a activarlo es cambiar este flag.
        supportsTablet: false,
        bundleIdentifier: AppConfig.app_identifier_ios,
        // El ícono global (logo-Preview.png) mide 1028x1032; Apple exige 1024x1024
        // exacto y sin canal alfa, que es justo lo que cumple este archivo.
        icon: './assets/images/logo1024x1024.png',
        // Purpose strings: Apple (5.1.1) exige que cada texto diga QUE dato se
        // usa, PARA QUE, y de un ejemplo concreto. Nada de frases cortadas con
        // "..." ni mezcla de idiomas: el review se hace en ingles. Si se agrega
        // una capacidad nueva, el texto se escribe con ese mismo molde.
        // NSMotionUsageDescription se elimino a proposito: no hay ningun uso de
        // expo-sensors / react-native-sensors en el codigo, y declarar una
        // capacidad que la app nunca pide contradice el Privacy Label.
        infoPlist: {
            "NSLocationWhenInUseUsageDescription": "TmasPlus uses your location while the app is open to place you on the map, set your pickup point, find available drivers nearby, and calculate the route and fare of your trip. For example, when you request a ride, your pickup location is shared with the driver who accepts it so they can reach you.",
            "NSLocationAlwaysAndWhenInUseUsageDescription": "TmasPlus uses your location in the background only while a trip is active, so the vehicle can be tracked in real time. For example, a driver's position keeps updating on the passenger's map while driving, even with the app in the background, and passengers can share that live trip with a safety contact. Background tracking stops when the trip ends or the driver goes offline.",
            "NSLocationAlwaysUsageDescription": "TmasPlus uses your location in the background only while a trip is active, so the vehicle can be tracked in real time. For example, a driver's position keeps updating on the passenger's map while driving, even with the app in the background. Background tracking stops when the trip ends or the driver goes offline.",
            "NSCameraUsageDescription": "TmasPlus uses the camera so you can take a photo for your profile picture and, if you drive with us, capture the documents required to be approved. For example, you can tap 'Take photo' to shoot your driver's license when uploading your paperwork.",
            "NSPhotoLibraryUsageDescription": "TmasPlus accesses your photo library so you can pick an existing image as your profile picture and, if you drive with us, upload the documents required to be approved. For example, you can select a photo of your vehicle registration card that is already saved on your device.",
            "ITSAppUsesNonExemptEncryption": false,
            "UIBackgroundModes": [
                "location",
                "fetch",
                "remote-notification"
            ]
        },
        "privacyManifests": {
            "NSPrivacyAccessedAPITypes": [
                {
                    "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
                    "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
                },
                {
                    "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
                    "NSPrivacyAccessedAPITypeReasons": ["3B52.1"]
                },
                {
                    "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",
                    "NSPrivacyAccessedAPITypeReasons": ["E174.1"]
                },
                {
                    "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime",
                    "NSPrivacyAccessedAPITypeReasons": ["35F9.1"]
                }
            ]
        },
        config: {
            googleMapsApiKey: API_KEY_IOS
        },
        buildNumber: AppConfig.ios_app_version
    },
    android: {
        compileSdkVersion: 34,
        targetSdkVersion: 34,
        buildToolsVersion: "34.0.0",
        package: AppConfig.app_identifier,
        versionCode: AppConfig.android_app_version,
        // Necesario para que expo-notifications inicialice Firebase y obtenga el
        // token FCM en Android (sin esto: "Default FirebaseApp is not initialized"
        // → getExpoPushTokenAsync falla → sin push en segundo plano).
        // ⚠️ Requiere que exista App/google-services.json (bajarlo de Firebase
        // Console → app Android com.releaseunocero) ANTES de compilar.
        googleServicesFile: "./google-services.json",
        "permissions": [
            "CAMERA",
            "ACCESS_FINE_LOCATION",
            "ACCESS_COARSE_LOCATION",
            "FOREGROUND_SERVICE",
            "FOREGROUND_SERVICE_LOCATION",
            "ACCESS_BACKGROUND_LOCATION",
            "SCHEDULE_EXACT_ALARM",
            "BODY_SENSORS",
            "ACTIVITY_RECOGNITION",
            "POST_NOTIFICATIONS"
        ],
        blockedPermissions: ["com.google.android.gms.permission.AD_ID"],
        config: {
            googleMaps: {
                apiKey: API_KEY_ANDROID
            }
        },
        // Android App Links (https verificado) para el reset de contraseña.
        // autoVerify + assetlinks.json en dashboard.tmasplus.com hacen que el
        // enlace del correo abra la app DIRECTO, sin depender de que el navegador
        // respete el esquema propio tmasplus:// (incompatibilidad en Firefox,
        // Samsung Internet, MIUI y webviews de Gmail/Outlook). El esquema propio
        // sigue existiendo (scheme global) como respaldo.
        intentFilters: [
            {
                action: "VIEW",
                autoVerify: true,
                data: [
                    {
                        scheme: "https",
                        host: "dashboard.tmasplus.com",
                        pathPrefix: "/reset-password"
                    }
                ],
                category: ["BROWSABLE", "DEFAULT"]
            }
        ]
    },
    "plugins": [
        "expo-asset",
        "expo-localization",
        "expo-secure-store",
        // "@react-native-firebase/app",
        // "@react-native-firebase/auth",
        // "react-native-background-fetch",
        [
            "expo-splash-screen",
            {
                // splash-icon.png es logo1024x1024.png con las esquinas
                // recortadas en alfa, asi que sobre el fondo oscuro se lee como
                // la misma tarjeta blanca redondeada que usa la pantalla de
                // login, en vez de un cuadro blanco a sangre.
                "image": "./assets/images/splash-icon.png",
                // En puntos. La pantalla mas comun ronda los 430pt de ancho, asi
                // que 200pt deja el logo a poco menos de la mitad, con aire.
                "imageWidth": 200,
                "resizeMode": "contain",
                "backgroundColor": "#051A26",
                "dark": {
                    "backgroundColor": "#051A26"
                }
            }
        ],
        [
            "expo-notifications",
            {
                // Ícono de la barra de estado: DEBE ser una silueta blanca sobre
                // fondo transparente. Android usa solo el canal alfa y lo pinta
                // blanco; un logo RGB sin alfa (logo1024x1024.png) salía
                // recortado/como cuadro blanco. `color` es el tinte que Android
                // aplica al ícono y al acento de la notificación.
                "icon": "./assets/images/notification-icon.png",
                "color": "#00E5FF",
                "sounds": [
                    "./assets/sounds/notifi.mpeg",
                    "./assets/sounds/horn.wav",
                    "./assets/sounds/repeat.wav",
                    "./assets/sounds/firstoption.mp3"
                ]
            }
        ],
        [
            "expo-build-properties",
            {
                // Sin useFrameworks a proposito. Con use_frameworks! los pods se
                // compilan como framework modules y react-native-maps incluye
                // headers no modulares de React-Core (RCTComponent.h, RCTView.h,
                // RCTViewManager.h); -Werror convierte ese warning en error y la
                // compilacion de Xcode muere. Se puso "static" cuando estaban
                // activos @react-native-firebase/app y /auth, que si lo exigian;
                // hoy estan comentados y solo se usa el firebase de JS, sin pods.
                // @rnmapbox/maps soporta ambos modos, no requiere frameworks.
                "android": {
                    "enableHermes": true
                }
            }
        ],
        [
            "expo-image-picker",
            {
                // Identicos a ios.infoPlist: este plugin tambien reescribe el
                // Info.plist en prebuild y gana sobre lo declarado alli.
                "photosPermission": "TmasPlus accesses your photo library so you can pick an existing image as your profile picture and, if you drive with us, upload the documents required to be approved. For example, you can select a photo of your vehicle registration card that is already saved on your device.",
                "cameraPermission": "TmasPlus uses the camera so you can take a photo for your profile picture and, if you drive with us, capture the documents required to be approved. For example, you can tap 'Take photo' to shoot your driver's license when uploading your paperwork."
            }
        ],
        // Estos textos DEBEN ser identicos a los de ios.infoPlist: el plugin
        // reescribe el Info.plist en prebuild y, si divergen, el binario acaba
        // mostrando la version del plugin y no la que se reviso.
        [
            "expo-location",
            {
                "locationAlwaysAndWhenInUsePermission": "TmasPlus uses your location in the background only while a trip is active, so the vehicle can be tracked in real time. For example, a driver's position keeps updating on the passenger's map while driving, even with the app in the background, and passengers can share that live trip with a safety contact. Background tracking stops when the trip ends or the driver goes offline.",
                "locationAlwaysPermission": "TmasPlus uses your location in the background only while a trip is active, so the vehicle can be tracked in real time. For example, a driver's position keeps updating on the passenger's map while driving, even with the app in the background. Background tracking stops when the trip ends or the driver goes offline.",
                "locationWhenInUsePermission": "TmasPlus uses your location while the app is open to place you on the map, set your pickup point, find available drivers nearby, and calculate the route and fare of your trip. For example, when you request a ride, your pickup location is shared with the driver who accepts it so they can reach you.",
                "isIosBackgroundLocationEnabled": true,
                "isAndroidBackgroundLocationEnabled": true,
                "isAndroidForegroundServiceEnabled": true
            }
        ],
        // expo-tracking-transparency eliminado a proposito. El plugin inyectaba
        // NSUserTrackingUsageDescription diciendo que el IDFA se usa para
        // "personalized ads", pero requestTrackingPermissionsAsync no se llama
        // en ninguna parte del codigo y no hay ningun SDK de publicidad en el
        // proyecto. Declarar tracking que la app nunca ejecuta contradice el
        // Privacy Nutrition Label y es causal de rechazo. Si algun dia se
        // integra publicidad, hay que volver a agregar el plugin Y disparar el
        // prompt ATT antes de cualquier recoleccion.
        [
            "@rnmapbox/maps",
            {
                "RNMapboxMapsVersion": "11.18.2",
                "RNMapboxMapsImpl": "mapbox",
                "RNMapboxMapsDownloadToken": RNMAPBOX_MAPS_DOWNLOAD_TOKEN
            }
        ],
        "expo-router"
    ]
}
