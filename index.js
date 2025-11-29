// index.js (Punto de entrada de la aplicación)

import { probarConexion } from './binance_logica.js';
import DB from './db_mysql.js'; // Importa el módulo de la base de datos
import { iniciarMotor } from './motor_principal.js'; // Importa el corazón de la lógica

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
    try {
        const config = await DB.obtenerConfiguracion();
        if (!config || Object.keys(config).length === 0) {
            console.error("❌ ERROR CRÍTICO: Configuración no encontrada o base de datos vacía. Terminando.");
            return;
        }
        console.log(`✅ Configuración cargada con éxito. (Ej. Apalancamiento: ${config.apalancamiento}x)`);
    } catch (error) {
        console.error("❌ ERROR CRÍTICO: Fallo al conectar con MySQL. Terminando.");
        return;
    }
    
    // 3. Iniciar el Motor de Escaneo y Simulación
    console.log("3. ✅ Conexiones OK. Iniciando ciclo de escaneo de 5 minutos...");
    iniciarMotor(); // Esta función contiene el setInterval y ya no debe ser await
}

// Ejecutar la función principal
main();