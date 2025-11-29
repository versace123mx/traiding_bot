import BinanceModule from 'binance-api-node';
const Binance = BinanceModule.default;
const client = Binance();

const INTERVALO = '5m'; // Intervalo de scalping: 5 minutos
const LIMITE = 200;     // Un límite alto (200 o más) para asegurar datos suficientes para indicadores

/**
 * 📢 Función de Prueba de Conexión.
 * Se puede ejecutar al inicio del programa para validar el cliente.
 */
async function probarConexion() {
    try {
        const time = await client.time();
        console.log('✅ Conexión con Binance exitosa. Servidor de tiempo:', time);
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con Binance:', error);
        return false;
    }
}


/**
 * 📈 Obtiene las últimas 100 velas (klines) para un par específico.
 * @param {string} symbol El símbolo del par (ej. 'BTCUSDT')
 * @returns {Promise<Array>} Un array de objetos con los datos de las velas.
 */
async function obtenerDatosVela(symbol) {
    try {
        const klines = await client.candles({
            symbol: symbol,
            interval: INTERVALO,
            limit: LIMITE // Datos necesarios para calcular correctamente los indicadores (RSI, MAs)
        });
        
        console.log(`Datos de ${symbol} obtenidos con éxito.`);
        return klines;
    } catch (error) {
        console.error(`Error al obtener klines de ${symbol}:`, error);
        return [];
    }
}

// Exportamos las funciones que queremos usar externamente
export { probarConexion, obtenerDatosVela, client };