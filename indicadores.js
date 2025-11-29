// indicadores.js

import tulind from 'tulind';

/**
 * Calcula todos los indicadores técnicos requeridos para la estrategia.
 * @param {Array<Object>} klines Array de objetos de vela de Binance.
 * @returns {Promise<Array<Object>>} Array de objetos enriquecidos con indicadores.
 */

const periods = {
        rsi: 14,
        ma10: 10,
        ma55: 55,
        ma200: 200,
        adx: 14, // Periodo común para ADX
        squeeze: 20 // Periodo común para Squeeze Momentum (Keltner Channels & Bollinger Bands)
    };

async function calcularIndicadores(klines) {
    if (!klines || klines.length === 0) {
        return [];
    }

    // 1. Extraer los datos de cierre y volumen
    // NOTA: Binance API devuelve los precios como strings, debemos convertirlos a números (floats)
    const closes = klines.map(k => parseFloat(k.close));
    const highs = klines.map(k => parseFloat(k.high));
    const lows = klines.map(k => parseFloat(k.low));
    const volumes = klines.map(k => parseFloat(k.volume));


    // 2. Cálculos Asíncronos con tulind
    const [rsi_data] = await tulind.indicators.rsi.indicator([closes], [periods.rsi]);
    const [ma10_data] = await tulind.indicators.sma.indicator([closes], [periods.ma10]);
    const [ma55_data] = await tulind.indicators.sma.indicator([closes], [periods.ma55]);
    const [ma200_data] = await tulind.indicators.sma.indicator([closes], [periods.ma200]);
    // ADX requiere highs, lows, y closes
    const [adx_data] = await tulind.indicators.adx.indicator([highs, lows, closes], [periods.adx]);

    // 3. Simulación de Squeeze Momentum (Requiere Bollinguer Bands y Keltner Channels)
    // tulind no tiene Squeeze Momentum nativo, se requiere una lógica más compleja.
    // Para simplificar por ahora, usaremos MACD (un componente clave del momentum)
    const [macd_hist] = await tulind.indicators.macd.indicator([closes], [12, 26, 9]);

    // 4. Mapear y combinar los datos
    const resultados = [];
    const max_start = Math.max(
        periods.rsi, periods.ma200, periods.adx, 
        Math.max(12, 26) // Máximo necesario para MACD
    ) - 1; 

    // Los indicadores tienen diferentes 'warm-up periods' (datos faltantes al inicio)
    // Empezamos a mapear desde donde tenemos todos los indicadores disponibles.
    for (let i = max_start; i < klines.length; i++) {
        resultados.push({
            timestamp: parseInt(klines[i].openTime),
            close: closes[i],
            volume: volumes[i],
            rsi: rsi_data[i - (periods.rsi - 1)],
            ma10: ma10_data[i - (periods.ma10 - 1)],
            ma55: ma55_data[i - (periods.ma55 - 1)],
            ma200: ma200_data[i - (periods.ma200 - 1)],
            adx: adx_data[i - (periods.adx - 1)],
            squeeze_momentum: macd_hist[i - (26 - 1)] // Usando MACD Histograma como proxy
        });
    }

    return resultados;
}

export { calcularIndicadores, periods };