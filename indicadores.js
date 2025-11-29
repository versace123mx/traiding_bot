// indicadores.js (REFFACTORIZADO)

import tulind from 'tulind';

/**
 * Calcula todos los indicadores técnicos requeridos para la estrategia.
 * @param {Array<Object>} klines Array de objetos de vela de Binance.
 * @param {Object} config Objeto de configuración cargado desde la base de datos. <--- NUEVO PARAMETRO
 * @returns {Promise<Array<Object>>} Array de objetos enriquecidos con indicadores.
 */
async function calcularIndicadores(klines, config) { // <--- MODIFICADO
    if (!klines || klines.length === 0) {
        return [];
    }

    // 1. Extraer los datos y definir periodos dinámicos
    const closes = klines.map(k => parseFloat(k.close));
    const highs = klines.map(k => parseFloat(k.high));
    const lows = klines.map(k => parseFloat(k.low));
    const volumes = klines.map(k => parseFloat(k.volume));
    
    // Obtenemos los periodos directamente de la configuración:
    const periods = {
        rsi: config.periodo_rsi,
        ma10: config.ma_periodo_10,
        ma55: config.ma_periodo_55,
        ma200: config.ma_periodo_200,
        adx: config.periodo_adx || 14, // Usamos la DB, si no existe, usamos 14 por defecto
    };

    // Parámetros fijos para MACD (hasta que los hagas configurables en la DB):
    const macd_fast = 12; 
    const macd_slow = 26; 
    const macd_signal = 9; 


    // 2. Cálculos Asíncronos con tulind
    const [rsi_data] = await tulind.indicators.rsi.indicator([closes], [periods.rsi]);
    const [ma10_data] = await tulind.indicators.sma.indicator([closes], [periods.ma10]);
    const [ma55_data] = await tulind.indicators.sma.indicator([closes], [periods.ma55]);
    const [ma200_data] = await tulind.indicators.sma.indicator([closes], [periods.ma200]);
    const [adx_data] = await tulind.indicators.adx.indicator([highs, lows, closes], [periods.adx]);
    const [macd_hist] = await tulind.indicators.macd.indicator([closes], [macd_fast, macd_slow, macd_signal]);


    // 3. Mapear y combinar los datos (Ajuste del max_start)
    const resultados = [];
    
    // Calculamos el índice de inicio más grande que asegura que todos los indicadores estén listos
    const max_start = Math.max(
        periods.rsi, periods.ma200, periods.adx, 
        macd_slow // 26 es el periodo más largo en MACD
    ) - 1; 

    // Indices de desfase, basados en la documentación común de TULIND (periodo - 1)
    const rsi_offset = periods.rsi - 1;
    const ma10_offset = periods.ma10 - 1;
    const ma55_offset = periods.ma55 - 1;
    const ma200_offset = periods.ma200 - 1;
    const adx_offset = periods.adx - 1;
    const macd_offset = macd_slow - 1; // Para el histograma de MACD

    for (let i = max_start; i < klines.length; i++) {
        resultados.push({
            timestamp: parseInt(klines[i].openTime),
            close: closes[i],
            volume: volumes[i],
            // Usamos los índices de desfase dinámicos
            rsi: rsi_data[i - rsi_offset],
            ma10: ma10_data[i - ma10_offset],
            ma55: ma55_data[i - ma55_offset],
            ma200: ma200_data[i - ma200_offset],
            adx: adx_data[i - adx_offset],
            squeeze_momentum: macd_hist[i - macd_offset]
        });
    }

    return resultados;
}

export { calcularIndicadores };