// motor_principal.js (REFFACTORIZADO - FASE FINAL)

import { obtenerDatosVela, client } from './binance_logica.js';
import { calcularIndicadores } from './indicadores.js'; 
import { enviarAlerta } from './telegram_api.js'; 
import DB from './db_mysql.js';

// --- Desestructuración de DB (¡Necesitamos la nueva función!) ---
const {
    guardarNuevaOperacion,
    obtenerOperacionesAbiertas,
    actualizarOperacion,
    actualizarSLBreakeven 
} = DB;

// --- CONSTANTES MODULARES ---
const INTERVALO_ESCANEO_MS = 5 * 60 * 1000; 
const STABLE_PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'LTCUSDT'];
const PARES_MONITOREO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'SHIBUSDT']; 
// -----------------------------


/**
 * Función auxiliar para obtener los parámetros de la DB basados en el tipo de moneda.
 * @param {string} par Par de trading (ej. 'BTCUSDT').
 * @param {Object} config Objeto de configuración completa.
 */
function obtenerParametrosPorPar(par, config) {
    const esEstable = STABLE_PAIRS.includes(par);
    const prefijo = esEstable ? 'estable_coin' : 'meme_coin';
    
    // Convertimos los valores de la DB (que son strings) a números aquí para la lógica.
    return {
        // Parámetros de Posición (para cálculo en escanearPares)
        apalancamiento: parseFloat(config[`apalancamiento_${prefijo}`]),
        margen_usdt: parseFloat(config[`margen_usdt_${prefijo}`]),
        
        // Parámetros de Salida (para cálculo en monitorearOperaciones)
        tp_fijo_usdt: parseFloat(config[`tp_fijo_${prefijo}_usdt`] || 0), // Default 0 para seguridad
        
        // Parámetros para SL y Breakeven
        sl_fijo_porcentaje: parseFloat(config.sl_fijo_porcentaje || 0.03), 
        porcentaje_para_breakeven: parseFloat(config.porcentaje_para_breakeven || 0.03), 
        
        esEstable: esEstable,
        tipo: prefijo
    };
}


/**
 * 📢 FUNCIÓN 1: ESCANEAR Y ALERTAR (Lógica de Entrada)
 */
async function escanearParesYGenerarAlertas(config) {
    console.log(`\n--- Iniciando escaneo a las ${new Date().toLocaleTimeString()} ---`);

    // 1. Mapear todos los pares a promesas de escaneo
    const tareasEscaneo = PARES_MONITOREO.map(async (par) => {
        const params = obtenerParametrosPorPar(par, config); 

        // 1. Obtener Datos y Calcular Indicadores
        const klines = await obtenerDatosVela(par);

        // ⚠️ LOG DE DEBUGGING AGREGADO AQUÍ ⚠️
        console.log(`[DEBUG] ${par}: Klines recibidas: ${klines.length}`);

        if (klines.length < 100) return; // Si no hay datos, termina la promesa para este par
        

        // 2. Calcular Indicadores (y verificar si existen)
        const indicadores = await calcularIndicadores(klines, config); 

        // -----------------------------------------------------------------
        // ⚠️ CORRECCIÓN DE ERROR: Verificar si se pudo calcular la última vela
        // -----------------------------------------------------------------
        if (indicadores.length === 0) {
            console.log(`⚠️ Advertencia: No se pudieron calcular indicadores para ${par}. Saltando.`);
            return; 
        }

        const ultimaVela = indicadores[indicadores.length - 1]; 
        


        // 3. Cálculo de Volumen Alto
        const volumenesRecientes = klines.slice(-10).map(k => parseFloat(k.volume));
        const volumenPromedio = volumenesRecientes.reduce((a, b) => a + b, 0) / volumenesRecientes.length;
        const volumenAlto = ultimaVela.volume > (volumenPromedio * parseFloat(config.volumen_umbral));

        let direccion = null;
        
        // 4. Criterio RSI Extremo y Volumen
        if (volumenAlto && ultimaVela.rsi <= parseFloat(config.rsi_sobreventa)) {
            direccion = 'LONG';
        } else if (volumenAlto && ultimaVela.rsi >= parseFloat(config.rsi_sobrecompra)) {
            direccion = 'SHORT';
        }

        if (direccion) {
            console.log(`🚨 SEÑAL ENCONTRADA: ${par} - ${direccion}. Tipo: ${params.tipo}`);
            
            // 5. Simulación, Cálculo de Posición y SL Inicial
            const tamanoPosicion = (params.margen_usdt * params.apalancamiento) / ultimaVela.close;

            // --- CÓDIGO DE CÁLCULO DE SL INICIAL ---
            const slFijoUSDT = params.margen_usdt * params.sl_fijo_porcentaje; 
            
            const slFijoInicial = direccion === 'LONG'
                ? ultimaVela.close - (slFijoUSDT / tamanoPosicion) 
                : ultimaVela.close + (slFijoUSDT / tamanoPosicion); 
            // ----------------------------------------

            const nuevaOperacion = {
                timestamp_entrada: new Date(),
                par_trading: par,
                direccion: direccion,
                precio_entrada: ultimaVela.close,
                tamano_posicion: tamanoPosicion,
                rsi_entrada: ultimaVela.rsi,
                volumen_entrada: ultimaVela.volume,
                sl_actual: slFijoInicial, // SL Inicializado
                id_estado: 1 
            };

            await guardarNuevaOperacion(nuevaOperacion);
            
            enviarAlerta(par, direccion, ultimaVela.rsi, config); 
        }

    });

    // 2. Ejecutar todas las promesas en paralelo
    await Promise.all(tareasEscaneo);
}


/**
 * 🔄 FUNCIÓN 2: MONITOREAR OPERACIONES ABIERTAS (Lógica de Salida)
 */
async function monitorearOperacionesAbiertas(config) {
    const operacionesAbiertas = await obtenerOperacionesAbiertas();
    if (operacionesAbiertas.length === 0) return;

    console.log(`\n--- Monitoreando ${operacionesAbiertas.length} operaciones abiertas... ---`);
    
    // Obtener precios de todos los pares
    const symbolsToFetch = [...new Set(operacionesAbiertas.map(op => op.par_trading))];
    const prices = await client.prices({ symbols: symbolsToFetch });

    // 1. Obtener la última vela y sus indicadores para todos los pares abiertos (para TP Dinámico)
    const latestKlines = {};
    for (const par of symbolsToFetch) {
        const klines = await obtenerDatosVela(par);
        if (klines.length > 0) {
            const indicadores = await calcularIndicadores(klines, config);
            latestKlines[par] = indicadores[indicadores.length - 1];
        }
    }
    
    // Parámetro de TP Dinámico (Usando el valor de la DB o 50 como default)
    const rsiCierreDinamico = parseFloat(config.rsi_tp_dinamico || 50); 


    for (const op of operacionesAbiertas) {
        const precioActual = parseFloat(prices[op.par_trading]);
        if (isNaN(precioActual)) continue; 
        
        const params = obtenerParametrosPorPar(op.par_trading, config); 
        const ultimaVela = latestKlines[op.par_trading]; // Indicadores de la vela más reciente
        
        // 1. Calcular Profit actual (en USDT)
        let profitActualUSDT = 0;
        if (op.direccion === 'LONG') {
            profitActualUSDT = (precioActual - op.precio_entrada) * op.tamano_posicion;
        } else { // SHORT
            profitActualUSDT = (op.precio_entrada - precioActual) * op.tamano_posicion;
        }
        
        // 2. Lógica de Salida
        let motivoSalida = null;

        // Criterio A: Tocar SL Actual (Fijo o Breakeven) - Máxima Prioridad
        if ((op.direccion === 'LONG' && precioActual <= op.sl_actual) || 
            (op.direccion === 'SHORT' && precioActual >= op.sl_actual)) {
            
            // Estado 3 (SL Fijo) o Estado 4 (Breakeven)
            motivoSalida = (op.breakeven_activado === 1) ? 4 : 3; 
        } 
        
        // Criterio B: Activar Breakeven/Trailing (Solo si NO está activo)
        else if (op.breakeven_activado === 0) {
            const profitParaBreakevenUSDT = params.margen_usdt * params.porcentaje_para_breakeven;
            
            if (profitActualUSDT >= profitParaBreakevenUSDT) {
                const slBreakeven = op.precio_entrada;
                
                await actualizarSLBreakeven(op.id_op, slBreakeven, 1);
                console.log(`➡️ Operación ${op.id_op} (${op.par_trading}) alcanza Breakeven. SL movido a ${slBreakeven}.`);
                continue; // Actualiza SL y continúa con el siguiente ciclo, no cierra.
            }
        }
        
        // Criterio C: TP Dinámico (Cierre por Reversión de Impulso - Estado 2)
        // Solo se aplica si la operación está en ganancias
        else if (profitActualUSDT > 0 && ultimaVela) {
            
            let condicionReversion = false;
            
            // LONG: RSI cae a nivel de equilibrio o debajo
            if (op.direccion === 'LONG' && ultimaVela.rsi <= rsiCierreDinamico) {
                condicionReversion = true;
            } 
            // SHORT: RSI sube a nivel de equilibrio o encima
            else if (op.direccion === 'SHORT' && ultimaVela.rsi >= rsiCierreDinamico) {
                condicionReversion = true;
            }

            if (condicionReversion) {
                motivoSalida = 2; // Cerrada por TP Dinámico
            }
        }
        
        // Criterio D: TP Fijo (Estado 5)
        // Se ejecuta si no fue cerrada por A, B (se hace continue) o C.
        else if (profitActualUSDT >= params.tp_fijo_usdt) {
            motivoSalida = 5; // Cerrada por TP Fijo
        }
        
        // 3. Actualización de la DB (Cierre)
        if (motivoSalida !== null) {
            const cierreData = {
                id_estado: motivoSalida,
                timestamp_salida: new Date(),
                precio_salida: precioActual,
                profit_usdt: profitActualUSDT
            };
            await actualizarOperacion(op.id_op, cierreData);
            console.log(`✅ Operación ${op.id_op} (${op.par_trading}) cerrada. Resultado: ${cierreData.profit_usdt.toFixed(2)} USDT. Motivo: ${motivoSalida}`);
        }
    }
}


/**
 * 🏃 FUNCIÓN PRINCIPAL: INICIO DEL MOTOR (Recibe la configuración)
 */
async function iniciarMotor(config) { 
    
    const ejecutarCiclo = async () => {
        try {
            console.log("-----------------------------------------");
            await monitorearOperacionesAbiertas(config);
            await escanearParesYGenerarAlertas(config);
        } catch (error) {
            console.error("Error en el ciclo principal:", error);
        }

        // ⚠️ PATRÓN RECURSIVE TIMEOUT: Llama a sí misma para el siguiente ciclo
        setTimeout(ejecutarCiclo, INTERVALO_ESCANEO_MS);
    };
    
    ejecutarCiclo();
    //setInterval(ejecutarCiclo, INTERVALO_ESCANEO_MS);
}

export { iniciarMotor };