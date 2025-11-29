// motor_principal.js

import { obtenerDatosVela, client } from './binance_logica.js'; // Conexión a Binance
import { calcularIndicadores, periods } from './indicadores.js'; // Cálculo de Indicadores
import { enviarAlerta } from './telegram_api.js'; // Notificación (Asumiendo que creaste este archivo)
import DB from './db_mysql.js'; // Conexión a la Base de Datos (necesitarás 'mysql2' o similar)

// ---------------------------------------------------------------------------------
// ❌ ESTA SECCIÓN CAUSABA EL ERROR DE DUPLICIDAD. 
// SE ELIMINA LA ASIGNACIÓN DIRECTA Y SE USA DESESTRUCTURACIÓN:
// ---------------------------------------------------------------------------------

const {
    obtenerConfiguracion,
    guardarNuevaOperacion,
    obtenerOperacionesAbiertas,
    actualizarOperacion
} = DB;

// ---------------------------------------------------------------------------------
// ❌ TAMBIÉN SE ELIMINÓ LA SECCIÓN COMPLETA DE 'Funciones de Ayuda (Asumidas)'
// ---------------------------------------------------------------------------------


const INTERVALO_ESCANEO_MS = 5 * 60 * 1000; // 5 minutos en milisegundos

// Lista de pares que queremos monitorear (puedes expandir esta lista)
const PARES_MONITOREO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']; 


/**
 * 📢 FUNCIÓN 1: ESCANEAR Y ALERTAR (Lógica de Entrada)
 */
async function escanearParesYGenerarAlertas(config) {
    console.log(`\n--- Iniciando escaneo a las ${new Date().toLocaleTimeString()} ---`);

    for (const par of PARES_MONITOREO) {
        // La variable 'client' NO está disponible en este archivo, debe venir de binance_logica.js 
        // Si tienes problemas aquí, debes importarla. Por ahora, asumimos que obtencionDatosVela es suficiente.
        const klines = await obtenerDatosVela(par);
        if (klines.length < 100) continue; 

        const indicadores = await calcularIndicadores(klines);
        // La última entrada del array es la vela más reciente
        const ultimaVela = indicadores[indicadores.length - 1]; 
        
        // 1. Obtener el volumen promedio reciente (usando las últimas 10 velas)
        const volumenesRecientes = klines.slice(-10).map(k => parseFloat(k.volume));
        const volumenPromedio = volumenesRecientes.reduce((a, b) => a + b, 0) / volumenesRecientes.length;
        
        // Criterio de Volumen: Volumen de la última vela debe ser > (Promedio * Umbral)
        const volumenAlto = ultimaVela.volume > (volumenPromedio * config.volumen_umbral);

        let direccion = null;
        
        // 2. Criterio RSI Extremo
        if (volumenAlto && ultimaVela.rsi <= config.rsi_sobreventa) {
            // LÓGICA LONG: RSI bajo (ej. <= 30) y Alto Volumen
            direccion = 'LONG';
        } else if (volumenAlto && ultimaVela.rsi >= config.rsi_sobrecompra) {
            // LÓGICA SHORT: RSI alto (ej. >= 70) y Alto Volumen
            direccion = 'SHORT';
        }

        if (direccion) {
            console.log(`🚨 SEÑAL ENCONTRADA: ${par} - ${direccion}`);
            
            // 3. Simulación y Registro
            // El tamaño de la posición se calcula usando la configuración (ej. $50 margen * 20x apalancamiento)
            const tamanoPosicion = (config.margen_usdt * config.apalancamiento) / ultimaVela.close;

            const nuevaOperacion = {
                timestamp_entrada: new Date(),
                par_trading: par,
                direccion: direccion,
                precio_entrada: ultimaVela.close,
                tamano_posicion: tamanoPosicion,
                rsi_entrada: ultimaVela.rsi,
                volumen_entrada: ultimaVela.volume,
                // Puedes añadir aquí las MAs, ADX, y Squeeze_Momentum
                id_estado: 1 // Abierta
            };

            await guardarNuevaOperacion(nuevaOperacion);
            enviarAlerta(par, direccion, ultimaVela.rsi); // Manda el mensaje a Telegram
        }
    }
}


/**
 * 🔄 FUNCIÓN 2: MONITOREAR OPERACIONES ABIERTAS (Lógica de Salida)
 * Esta función revisa si alguna simulación toca TP Dinámico o se revierte.
 */
async function monitorearOperacionesAbiertas(config) {
    const operacionesAbiertas = await obtenerOperacionesAbiertas();
    if (operacionesAbiertas.length === 0) return;

    console.log(`\n--- Monitoreando ${operacionesAbiertas.length} operaciones abiertas... ---`);

    // Nota de Corrección: Necesitas importar 'client' de binance_logica.js para usar client.prices
    // Por ahora, asumimos que obtuviste el cliente de la API en el archivo binance_logica.js
    
    for (const op of operacionesAbiertas) {
        // Necesitamos el precio actual del par para simular la salida
        // Petición de un solo precio
        const ticker = await client.prices({ symbol: op.par_trading }); 
        const precioActual = parseFloat(ticker[op.par_trading]);
        
        // 1. Calcular Profit actual
        let profitActualUSDT = 0;
        if (op.direccion === 'LONG') {
            profitActualUSDT = (precioActual - op.precio_entrada) * op.tamano_posicion;
        } else { // SHORT
            profitActualUSDT = (op.precio_entrada - precioActual) * op.tamano_posicion;
        }

        // 2. Lógica de Salida
        let motivoSalida = null;

        // Criterio A: SL a Precio de Entrada (Simulación de Breakeven)
        // Por simplicidad, simularemos un SL del 0.1% bajo el precio de entrada como Stop Loss inicial
        const precioSLInicial = op.direccion === 'LONG' 
            ? op.precio_entrada * 0.999 // -0.1%
            : op.precio_entrada * 1.001; // +0.1%

        if ((op.direccion === 'LONG' && precioActual <= precioSLInicial) || 
            (op.direccion === 'SHORT' && precioActual >= precioSLInicial)) {
            motivoSalida = 3; // Cerrada por SL Fijo (o inicial)
        } 
        
        // Criterio B: TP Dinámico ($30 USDT o más)
        else if (profitActualUSDT >= config.tp_fijo_usdt) {
            // Por simplicidad inicial: Si alcanza los $30, se registra como TP Fijo (motivo 5).
            motivoSalida = 5; 
        }

        // 3. Actualización de la DB
        if (motivoSalida !== null) {
            const cierreData = {
                id_estado: motivoSalida,
                timestamp_salida: new Date(),
                precio_salida: precioActual,
                profit_usdt: profitActualUSDT,
                motivo_salida: motivoSalida
            };
            await actualizarOperacion(op.id_op, cierreData);
            console.log(`✅ Operación ${op.id_op} (${op.par_trading}) cerrada. Resultado: ${cierreData.profit_usdt.toFixed(2)} USDT.`);
        }
    }
}


/**
 * 🏃 FUNCIÓN PRINCIPAL: INICIO DEL MOTOR
 */
async function iniciarMotor() {
    const config = await obtenerConfiguracion(); // Cargar parámetros de la DB
    if (!config) {
        console.error("No se pudo cargar la configuración. Revise la tabla Configuracion.");
        return;
    }
    
    // Ejecutar inmediatamente y luego programar el ciclo de 5 minutos
    const ejecutarCiclo = async () => {
        try {
            await monitorearOperacionesAbiertas(config); // Primero revisa si cerrar
            await escanearParesYGenerarAlertas(config); // Luego busca nuevas alertas
        } catch (error) {
            console.error("Error en el ciclo principal:", error);
        }
    };
    
    // Inicia el primer ciclo y luego lo repite
    ejecutarCiclo();
    setInterval(ejecutarCiclo, INTERVALO_ESCANEO_MS);
}

export { iniciarMotor };