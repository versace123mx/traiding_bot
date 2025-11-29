// index.js (Punto de entrada de la aplicación - CORREGIDO)

import { probarConexion } from './binance_logica.js';
import DB from './db_mysql.js'; 
import { iniciarMotor } from './motor_principal.js';
import { inicializarBot } from './telegram_api.js'; 

/**
 * Función principal que arranca todo el sistema.
 */
async function main() {
    console.log("--- 🚀 Iniciando Sistema de Alertas de Scalping (Node.js) ---");
    
    // 1. Prueba de Conexión a Binance (Lectura)
    console.log("1. Verificando conexión a Binance...");
    const conectadoBinance = await probarConexion();
    if (!conectadoBinance) {
        console.error("❌ ERROR CRÍTICO: No se pudo conectar a la API de Binance. Terminando.");
        return;
    }
    
    // 2. Prueba de Conexión a MySQL (Lectura de Configuración)
    console.log("2. Verificando conexión a MySQL y cargando configuración...");
    let config = null; // Inicializamos a null

    try {
        config = await DB.obtenerConfiguracion(); // <--- ¡ASIGNACIÓN CORRECTA!
        if (!config || Object.keys(config).length === 0) {
            console.error("❌ ERROR CRÍTICO: Configuración no encontrada o base de datos vacía. Terminando.");
            return;
        }
        // Asegúrate de usar los campos que sabes que son strings (ej. Telegram ID)
        console.log(`✅ Configuración cargada con éxito. (Ej. Apalancamiento Meme: ${config.apalancamiento_meme_coin}x)`);
    } catch (error) {
        console.error(`❌ ERROR CRÍTICO: Fallo al conectar con MySQL: ${error.message} Terminando.`);
        return;
    }
    
    // 2.5. Inicializar Bot de Telegram (usando la config cargada)
    try {
        // El bot necesita el Chat ID y el Token. Asumimos que inicializarBot los obtiene de 'config'.
        inicializarBot(config); 
        console.log("✅ Bot de Telegram inicializado.");
    } catch (error) {
        console.error(`❌ ERROR CRÍTICO: Fallo al inicializar Telegram: ${error.message}. Terminando.`);
        return;
    }

    // 3. Iniciar el Motor de Escaneo y Simulación, PASÁNDOLE la configuración
    console.log("3. ✅ Conexiones OK. Iniciando ciclo de escaneo de 5 minutos...");
    iniciarMotor(config); // <-- 'config' tiene el objeto cargado correctamente.
}

// Ejecutar la función principal
main();