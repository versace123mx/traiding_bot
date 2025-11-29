// Importamos la librería node-telegram-bot-api
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

let bot; // Instancia global del bot.
let botChatId; // Almacenamos el Chat ID globalmente

/**
 * Inicializa el cliente de Telegram con la configuración necesaria.
 * Se llama UNA VEZ al inicio de la aplicación desde index.js.
 * @param {Object} config Objeto de configuración cargado desde la base de datos.
 */
function inicializarBot(config) {
    const token = process.env.API_KEY_Telegram; // Se mantiene en .env por seguridad

    if (!token) {
        throw new Error("ERROR: La variable de entorno API_KEY_Telegram no está definida.");
    }

    // Obtenemos el Chat ID de la configuración (debe existir en la DB)
    const chatIdDesdeDB = config.telegram_chat_id;

    if (!chatIdDesdeDB) {
        throw new Error("ERROR: El parámetro 'telegram_chat_id' no se encontró en la base de datos.");
    }

    botChatId = String(chatIdDesdeDB); // Convertimos a string para asegurar el formato correcto
    bot = new TelegramBot(token, { polling: false }); // Usamos polling: false para un bot de solo envío.
}

/**
 * Función para enviar la alerta de trading
 * @param {string} par El par de trading (ej. 'BTCUSDT')
 * @param {string} direccion LONG o SHORT
 * @param {number} rsi El valor actual del RSI
 * @param {Object} config La configuración completa (para obtener otros detalles si es necesario)
 */


const enviarAlerta = (par, direccion, rsi, config) => {
    if (!bot) {
        console.error("❌ Error: El bot de Telegram no ha sido inicializado. Ejecute primero inicializarBot().");
        return;
    }

    // Aquí puedes incluir más detalles configurables, como el margen o apalancamiento
    // del par específico (tendremos que calcularlo en motor_principal.js)

    const mensaje = `
🚨 **ALERTA SCALPING - ${par}** 🚨
**Dirección:** ${direccion}
**RSI:** ${rsi.toFixed(2)}
**Motivo:** Volumen alto y RSI en extremo.
➡️ ¡Revisar manual para ejecución!
`;

    // Usamos la variable global botChatId que se configuró en la inicialización
    bot.sendMessage(botChatId, mensaje, { parse_mode: 'Markdown' })
        .then(() => {
            // console.log(`Alerta enviada a Telegram para ${par}`);
        })
        .catch((error) => {
            console.error('❌ Error al enviar alerta a Telegram:', error.response?.body || error.message);
        });
}

export { inicializarBot, enviarAlerta };

// Ejemplo de uso (simulando una detección)
// enviarAlerta('ETHUSDT', 'LONG', 28.55);